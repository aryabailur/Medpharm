/**
 * POST /api/assistant/query — own-data-scope assistant (V1–V12).
 *
 * ARCHITECTURE.md §7.1, §7.2, §7.4. README §5 (Phase 9), Part 2.
 *
 * THREE RULES (§7.1):
 *   1. The LLM never sees the database. It sees a JSON evidence bundle.
 *   2. Every answer ships with the evidence panel that produced it.
 *   3. Scope is enforced server-side, before the LLM is invoked.
 *
 * Rule 3 is structural here rather than a filter: this server can only reach the
 * `dhanvantari` schema, which holds exactly one institution's data. "Dhanvantari's
 * bot physically cannot read another institution's data" is true because of the
 * architecture, not because of a WHERE clause.
 *
 * "Never generate SQL from an LLM" (§7.4) — every query below is hand-written
 * and parameterised.
 */

import { createHash } from 'node:crypto';

import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { risk } from '../../lib/nidana-client.js';
import { prisma } from '../../lib/prisma.js';

const QueryBody = z.object({ question: z.string().trim().min(1).max(500) });

export type Intent =
  | 'order.status'
  | 'shipment.delayed'
  | 'shipment.eta'
  | 'coldchain.status'
  | 'stock.level'
  | 'stock.expiring'
  | 'consumption.trend'
  | 'reorder.suggest'
  | 'complaint.list'
  | 'complaint.status'
  | 'supplier.score'
  | 'drug.info'
  | 'out_of_scope';

interface Evidence {
  intent: Intent;
  summary: string;
  data: unknown;
}

/** Keyword classifier — instant, and immune to an LLM outage (§7.4). */
export function classifyByKeyword(q: string): Intent {
  const s = q.toLowerCase();
  if (/(status|what happened).*(order)/.test(s) || /last order/.test(s)) return 'order.status';
  // \b on "late" — otherwise "unrelated", "escalate" etc. false-match on the
  // bare substring, which is exactly how "something totally unrelated..."
  // was misrouted to shipment.delayed instead of out_of_scope.
  if (/(delay|\blate\b|overdue)/.test(s)) return 'shipment.delayed';
  // Order-independent: "eta on my shipment", "when will it arrive", "expected
  // delivery" should all match regardless of which term comes first. \b on
  // "eta" so it doesn't fire on ordinary words containing that substring.
  if (/\b(eta)\b|expect|next delivery/.test(s) || (/\bwhen\b/.test(s) && /(deliver|arrive|\bship|come|get here)/.test(s))) return 'shipment.eta';
  if (/(cold|temperature|kept cold|insulin.*cold|cold chain)/.test(s)) return 'coldchain.status';
  if (/(expir|expiry|shelf life)/.test(s)) return 'stock.expiring';
  if (/(how much|how many|\bstock\b|do we have|on hand|inventory)/.test(s)) return 'stock.level';
  if (/(consum|dispens|used last)/.test(s)) return 'consumption.trend';
  if (/(reorder|should i order|need to order|restock)/.test(s)) return 'reorder.suggest';
  // Order-independent for list vs single-complaint status: "list complaints",
  // "show me all complaints", "complaints that are open" should all match.
  if (/complaint/.test(s) && /(open|list|\ball\b|show)/.test(s)) return 'complaint.list';
  if (/(complaint|broken|damaged)/.test(s)) return 'complaint.status';
  if (/(supplier|reliable|on-time|ontime|scorecard)/.test(s)) return 'supplier.score';
  if (/(what is this|drug info|composition)/.test(s)) return 'drug.info';
  return 'out_of_scope';
}

async function stockLevel(): Promise<Evidence> {
  const rows = await prisma.inventory.findMany({ include: { drug: true }, orderBy: { qtyOnHand: 'asc' } });
  const data = rows.map((r) => ({
    drug: r.drug.name,
    qtyOnHand: r.qtyOnHand,
    reorderPoint: r.reorderPoint,
    lowStock: r.qtyOnHand <= r.reorderPoint,
    expiryDate: r.expiryDate,
  }));
  const low = data.filter((d) => d.lowStock).length;
  return { intent: 'stock.level', summary: `${data.length} item(s) in stock, ${low} at or below reorder point`, data };
}

async function stockExpiring(): Promise<Evidence> {
  const cutoff = new Date(Date.now() + 60 * 86_400_000);
  const rows = await prisma.inventory.findMany({
    where: { expiryDate: { lte: cutoff } },
    include: { drug: true },
    orderBy: { expiryDate: 'asc' },
  });
  const valueAtRisk = rows.reduce((a, r) => a + r.qtyOnHand * (r.drug.unitPrice ?? 0), 0);
  return {
    intent: 'stock.expiring',
    summary: `${rows.length} item(s) expiring within 60 days`,
    data: {
      valueAtRisk: Number(valueAtRisk.toFixed(2)),
      items: rows.map((r) => ({
        drug: r.drug.name,
        qtyOnHand: r.qtyOnHand,
        expiryDate: r.expiryDate,
        daysToExpiry: r.expiryDate ? Math.floor((r.expiryDate.getTime() - Date.now()) / 86_400_000) : null,
      })),
    },
  };
}

async function consumptionTrend(): Promise<Evidence> {
  const since = new Date(Date.now() - 60 * 86_400_000);
  const rows = await prisma.dispense.findMany({
    where: { dispensedAt: { gte: since } },
    include: { drug: { select: { name: true } } },
  });
  const mid = new Date(Date.now() - 30 * 86_400_000);
  const totals = new Map<string, { recent: number; prior: number }>();
  for (const r of rows) {
    const cur = totals.get(r.drug.name) ?? { recent: 0, prior: 0 };
    if (r.dispensedAt >= mid) cur.recent += r.qty;
    else cur.prior += r.qty;
    totals.set(r.drug.name, cur);
  }
  const data = [...totals.entries()]
    .map(([drug, v]) => ({
      drug,
      dispensed: v.recent,
      prior: v.prior,
      deltaPct: v.prior > 0 ? Number((((v.recent - v.prior) / v.prior) * 100).toFixed(1)) : null,
    }))
    .sort((a, b) => b.dispensed - a.dispensed);
  return { intent: 'consumption.trend', summary: `${data.length} drug(s) dispensed in the last 30 days`, data };
}

/** V8 — the reorder list, scored through Nidana with a deterministic fallback. */
async function reorderSuggest(): Promise<Evidence> {
  const rows = await prisma.inventory.findMany({ include: { drug: true } });
  const since = new Date(Date.now() - 180 * 86_400_000);

  const scored = await Promise.all(
    rows.map(async (r) => {
      const dispenses = await prisma.dispense.findMany({
        where: { drugId: r.drugId, dispensedAt: { gte: since } },
        select: { qty: true, dispensedAt: true },
      });
      // Bucket into rough months so the risk model sees a series, not a total.
      const buckets = new Map<number, number>();
      for (const d of dispenses) {
        const k = Math.floor((Date.now() - d.dispensedAt.getTime()) / (30 * 86_400_000));
        buckets.set(k, (buckets.get(k) ?? 0) + d.qty);
      }
      const series = [...buckets.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v);

      const r2 = await risk({
        institutionId: 'self',
        drugId: r.drugId,
        qtyOnHand: r.qtyOnHand,
        reorderPoint: r.reorderPoint,
        recentConsumption: series,
      });
      return {
        drug: r.drug.name,
        inventoryId: r.id,
        drugId: r.drugId,
        qtyOnHand: r.qtyOnHand,
        reorderPoint: r.reorderPoint,
        score: r2.score,
        band: r2.band,
        confidence: r2.confidence,
        signals: r2.signals,
        source: r2.source,
      };
    }),
  );

  const suggest = scored.filter((s) => s.score >= 0.25).sort((a, b) => b.score - a.score);
  return { intent: 'reorder.suggest', summary: `${suggest.length} item(s) worth reordering now`, data: suggest };
}

async function shipmentDelayed(): Promise<Evidence> {
  const rows = await prisma.incomingShipment.findMany({
    where: { status: { not: 'DELIVERED' }, etaAt: { lt: new Date() } },
    orderBy: { etaAt: 'asc' },
  });
  return {
    intent: 'shipment.delayed',
    summary: `${rows.length} shipment(s) past their ETA`,
    data: rows.map((s) => ({
      shipmentId: s.id,
      status: s.status,
      etaAt: s.etaAt,
      daysLate: s.etaAt ? Math.floor((Date.now() - s.etaAt.getTime()) / 86_400_000) : null,
      coldChain: s.coldChain,
      anomalyFlag: s.anomalyFlag,
    })),
  };
}

async function shipmentEta(): Promise<Evidence> {
  const rows = await prisma.incomingShipment.findMany({
    where: { status: { in: ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } },
    orderBy: { etaAt: 'asc' },
    take: 5,
  });
  return {
    intent: 'shipment.eta',
    summary: rows.length ? `Next delivery expected ${rows[0]!.etaAt?.toISOString() ?? 'soon'}` : 'Nothing in transit',
    data: rows.map((s) => ({ shipmentId: s.id, status: s.status, etaAt: s.etaAt, progressPct: s.progressPct, coldChain: s.coldChain })),
  };
}

/** V4 — "was my insulin shipment kept cold?" */
async function coldchainStatus(): Promise<Evidence> {
  const rows = await prisma.incomingShipment.findMany({
    where: { coldChain: true },
    orderBy: { etaAt: 'desc' },
    take: 10,
  });
  const breached = rows.filter((s) => s.anomalyFlag);
  return {
    intent: 'coldchain.status',
    summary: breached.length
      ? `${breached.length} of ${rows.length} cold-chain shipment(s) breached their band in transit`
      : `All ${rows.length} cold-chain shipment(s) stayed in band`,
    data: rows.map((s) => ({
      shipmentId: s.id,
      status: s.status,
      lastTempC: s.lastTempC,
      anomalyFlag: s.anomalyFlag,
      etaAt: s.etaAt,
    })),
  };
}

async function complaintList(): Promise<Evidence> {
  const rows = await prisma.localComplaint.findMany({ orderBy: { filedAt: 'desc' } });
  const open = rows.filter((c) => c.remoteStatus !== 'RESOLVED');
  return {
    intent: 'complaint.list',
    summary: `${open.length} open complaint(s) of ${rows.length} filed`,
    data: rows.map((c) => ({
      complaintId: c.id,
      category: c.category,
      status: c.remoteStatus,
      filedAt: c.filedAt,
      rcaSummary: c.rcaSummary,
      photos: c.photoUrls.length,
    })),
  };
}

async function supplierScore(): Promise<Evidence> {
  const s = await prisma.supplierScore.findFirst();
  if (!s) return { intent: 'supplier.score', summary: 'No scorecard computed yet', data: null };
  return {
    intent: 'supplier.score',
    summary: `Supplier on-time ${s.onTimePct ?? '—'}%, rejection ${s.rejectionRatePct ?? '—'}%`,
    data: s,
  };
}

async function dispatch(intent: Intent): Promise<Evidence> {
  switch (intent) {
    case 'stock.level': return stockLevel();
    case 'stock.expiring': return stockExpiring();
    case 'consumption.trend': return consumptionTrend();
    case 'reorder.suggest': return reorderSuggest();
    case 'shipment.delayed': return shipmentDelayed();
    case 'shipment.eta': return shipmentEta();
    case 'coldchain.status': return coldchainStatus();
    case 'complaint.list':
    case 'complaint.status': return complaintList();
    case 'supplier.score': return supplierScore();
    case 'order.status': {
      const e = await shipmentEta();
      return { ...e, intent: 'order.status' };
    }
    case 'drug.info':
      return { intent: 'drug.info', summary: 'Scan a QR to identify a specific batch', data: null };
    default:
      return outOfScopeEvidence();
  }
}

/**
 * A graceful, useful reply for an unsupported question — names what this
 * facility's assistant CAN answer instead of a dead end. Scope stays this
 * one institution's own data, never the network (§7.2).
 */
function outOfScopeEvidence(): Evidence {
  return {
    intent: 'out_of_scope',
    summary: "I can only answer questions about this facility's inventory, orders, shipments and complaints",
    data: {
      capabilities: [
        { topic: 'Stock on hand', example: 'How much stock do we have?' },
        { topic: 'Expiring stock', example: 'What is expiring soon?' },
        { topic: 'Reorder suggestions', example: 'Should I reorder anything?' },
        { topic: 'Shipment delays', example: 'Is my shipment delayed?' },
        { topic: 'Delivery ETA', example: 'When will my order arrive?' },
        { topic: 'Cold chain status', example: 'Was my insulin kept cold?' },
        { topic: 'Complaints', example: 'Show me all complaints.' },
        { topic: 'Supplier reliability', example: 'How reliable is my supplier?' },
      ],
    },
  };
}

function templateNarration(e: Evidence): string {
  if (e.intent === 'out_of_scope') {
    const data = e.data as { capabilities?: Array<{ topic: string; example: string }> } | null;
    const list = data?.capabilities?.map((c) => `${c.topic} (e.g. "${c.example}")`).join('; ') ?? '';
    return list ? `${e.summary}. Try one of: ${list}.` : e.summary;
  }
  if (e.data == null) return e.summary;
  if (Array.isArray(e.data)) {
    return e.data.length ? `${e.summary}. Details in the evidence panel.` : `${e.summary}. Nothing matched.`;
  }
  return e.summary;
}

const GROQ_MODEL = 'openai/gpt-oss-120b';

// Same account, same tight budget as vayu-api (measured live: 8000
// tokens/minute on this model, largely consumed by the model's own hidden
// reasoning tokens). Shrink the prompt and cache successful narrations so a
// second identical question never costs another token.
const MAX_COMPLETION_TOKENS = 700;
const REQUEST_TIMEOUT_MS = 8_000;
const PROMPT_ROW_LIMIT = 6;
// `signals` stays: it's small (5 entries) and its `explanation` strings are
// exactly what makes a reorder narration good (e.g. "at or below the reorder
// point"). `photos` is a count, not the array itself, in every evidence
// bundle here, so it never needed dropping — kept for documentation.
const VERBOSE_ROW_FIELDS = new Set(['history']);

/** Compact the evidence for the LLM prompt only — the full `evidence` in the
 * HTTP response, which the UI renders as the evidence panel, is untouched. */
function compactForPrompt(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const total = value.length;
    const trimmed = value.slice(0, PROMPT_ROW_LIMIT).map((v) => compactForPrompt(v, depth + 1));
    return total > trimmed.length ? { totalCount: total, items: trimmed } : trimmed;
  }
  if (value != null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (depth > 0 && VERBOSE_ROW_FIELDS.has(k) && v != null && typeof v === 'object') {
        out[k] = Array.isArray(v) ? `[${v.length} entries omitted for brevity]` : '[omitted for brevity]';
        continue;
      }
      out[k] = compactForPrompt(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Defensive strip of JSON-shaped leakage from the LLM's prose. gpt-oss-120b
 * occasionally "cites" the evidence by echoing raw fragments verbatim (seen
 * live on the vayu-api side as 【"point":43266.7】-style citation brackets,
 * and bare {"key": value} fragments). The system prompt forbids this
 * explicitly, but that alone is not 100% reliable, so this runs on every LLM
 * answer. Conservative by design: only removes bracket pairs carrying a
 * quoted-key/colon pair (the JSON "fingerprint"), so ordinary parenthetical
 * prose like "(3 shipments)" is never touched.
 */
function stripJsonLeakage(text: string): string {
  let out = text;
  out = out.replace(/【[^】]*】/g, '');
  out = out.replace(/[{[][^{}[\]]*"[A-Za-z0-9_]+"\s*:\s*[^{}[\]]*[}\]]/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/\s+([.,;:])/g, '$1');
  out = out.replace(/\(\s*\)/g, '');
  return out.trim();
}

/** Stopwords excluded from the token-overlap grounding check — common
 * English words that would trivially "match" regardless of content. */
const GROUNDING_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'because', 'before', 'being',
  'between', 'currently', 'district', 'evidence', 'following', 'have',
  'information', 'insufficient', 'institution', 'other', 'plainly',
  'question', 'shipment', 'showing', 'these', 'those', 'though', 'through',
  'under', 'which', 'while', 'with', 'without',
]);

/**
 * Collect distinct-word tokens (>=4 letters, lowercased) from every string
 * value anywhere in the compacted prompt evidence — drug names, statuses,
 * etc. Numbers are deliberately not the grounding signal: the prompt asks
 * the model to spell quantities in words ("ninety-five units" rather than
 * "95"), so a digit-based check would reject perfectly good, grounded prose.
 */
function wordTokensIn(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    for (const w of value.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
      if (!GROUNDING_STOPWORDS.has(w)) out.add(w);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) wordTokensIn(v, out);
  } else if (value != null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) wordTokensIn(v, out);
  }
  return out;
}

/**
 * Was this LLM answer actually grounded in the evidence it was given? Guards
 * against a plausible-sounding but ungrounded hedge (e.g. "I don't have
 * enough information...") for evidence that plainly contains the answer —
 * observed live on the sibling vayu-api assistant. Such a response is not
 * caught by the empty-text or bad-status checks, and once cached it would
 * serve the same wrong answer for the full TTL. If the evidence has any
 * named entities, the answer must mention at least one. Evidence with too
 * few groundable words (< 3 — e.g. a mostly-numeric scorecard with just an
 * internal ID string) always passes: there's too little to check against,
 * and rejecting a good numeric-only answer is worse than missing a rare thin
 * hedge here.
 */
function isGrounded(answer: string, promptEvidence: unknown): boolean {
  const evidenceWords = wordTokensIn(promptEvidence);
  if (evidenceWords.size < 3) return true;
  const answerWords = new Set(answer.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  for (const w of answerWords) {
    if (evidenceWords.has(w)) return true;
  }
  return false;
}

interface CacheEntry {
  answer: string;
  expiresAt: number;
}

/** Narration cache: (intent + question + hash of prompt evidence) -> answer.
 * Only successful LLM narrations are cached — never a template fallback,
 * so a transient rate-limit/timeout can't poison a repeat question. */
const NARRATION_CACHE_TTL_MS = 10 * 60_000;
const narrationCache = new Map<string, CacheEntry>();

function cacheKey(intent: Intent, question: string, promptEvidence: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(promptEvidence)).digest('hex');
  return `${intent}:${question.trim().toLowerCase()}:${hash}`;
}

function readCache(key: string): string | null {
  const hit = narrationCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    narrationCache.delete(key);
    return null;
  }
  return hit.answer;
}

function writeCache(key: string, answer: string): void {
  narrationCache.set(key, { answer, expiresAt: Date.now() + NARRATION_CACHE_TTL_MS });
  if (narrationCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of narrationCache) {
      if (v.expiresAt < now) narrationCache.delete(k);
    }
  }
}

async function narrate(
  question: string,
  intent: Intent,
  e: Evidence,
  log: FastifyBaseLogger,
): Promise<{ answer: string; source: 'llm' | 'template' }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { answer: templateNarration(e), source: 'template' };

  const promptEvidence = compactForPrompt(e.data);
  const ck = cacheKey(intent, question, promptEvidence);
  const cached = readCache(ck);
  if (cached) return { answer: cached, source: 'llm' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const startedFetch = Date.now();
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: MAX_COMPLETION_TOKENS,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You explain inventory and supply data to hospital pharmacy staff. Answer using ONLY the JSON evidence provided. ' +
              'Some arrays are capped with a totalCount field — that count is real and citable, even though only the first few rows are shown. ' +
              'Cite specific figures from it, in words. If the evidence is insufficient, say so plainly. Never invent a number that is not in the evidence. Be concise — 2 to 4 sentences. ' +
              'Write plain prose for a human reader, as you would speak it out loud. Never quote the JSON verbatim, and never emit field ' +
              'names, key:value pairs, braces, brackets, or bracketed citation markers of any kind — no "qtyOnHand":95, no {…}, no 【…】. ' +
              'Refer to quantities in ordinary words with rounded units, never as a raw JSON field.',
          },
          { role: 'user', content: `Question: ${question}\n\nEvidence:\n${JSON.stringify(promptEvidence)}` },
        ],
      }),
    });
    if (!res.ok) {
      const bodySnippet = await res.text().then((t) => t.slice(0, 300)).catch(() => '<unreadable body>');
      log.warn(
        { question, intent, narrationError: `groq ${res.status}: ${bodySnippet}`, ms: Date.now() - startedFetch },
        'assistant narration falling back to template',
      );
      return { answer: templateNarration(e), source: 'template' };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const choice = json.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (choice?.finish_reason === 'length') {
      log.warn(
        { question, intent, narrationError: `groq truncated output (finish_reason=length), max_tokens=${MAX_COMPLETION_TOKENS}` },
        'assistant narration truncated',
      );
    }
    if (!text) {
      log.warn(
        { question, intent, narrationError: `groq returned empty content, finish_reason=${choice?.finish_reason ?? 'unknown'}` },
        'assistant narration falling back to template',
      );
      return { answer: templateNarration(e), source: 'template' };
    }
    // Defensive cleanup — see stripJsonLeakage above.
    const cleaned = stripJsonLeakage(text);

    // Grounding check — see isGrounded above. Never trust or cache a
    // plausible-sounding hedge over evidence that plainly has numbers.
    if (!isGrounded(cleaned, promptEvidence)) {
      log.warn(
        { question, intent, narrationError: `groq answer not grounded in evidence: "${cleaned.slice(0, 150)}"` },
        'assistant narration falling back to template',
      );
      return { answer: templateNarration(e), source: 'template' };
    }

    writeCache(ck, cleaned);
    return { answer: cleaned, source: 'llm' };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    const narrationError = aborted
      ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    log.warn({ question, intent, narrationError, ms: Date.now() - startedFetch }, 'assistant narration falling back to template');
    return { answer: templateNarration(e), source: 'template' };
  } finally {
    clearTimeout(timer);
  }
}

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/query', async (req, reply) => {
    const parsed = QueryBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const { question } = parsed.data;
    const started = Date.now();

    const intent = classifyByKeyword(question);
    const evidence = await dispatch(intent);
    const { answer, source } = await narrate(question, intent, evidence, req.log);

    // Log the full tuple: "if a judge says 'prove it isn't making that up,'
    // you open the log." (§7.4)
    req.log.info(
      { question, intent, evidenceSummary: evidence.summary, narration: source, ms: Date.now() - started },
      'assistant query',
    );

    return { question, intent, answer, narration: source, evidence, ms: Date.now() - started };
  });
}
