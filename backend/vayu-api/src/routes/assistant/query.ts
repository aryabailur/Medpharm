/**
 * POST /api/assistant/query — network-scope assistant (M1–M12).
 *
 * ARCHITECTURE.md §7.1, §7.4. README §5 (Phase 9), Part 2.
 *
 * Pipeline: intent → deterministic tool dispatch → evidence JSON → narration.
 *
 * The response always carries the evidence bundle alongside the prose, so the
 * UI can render the evidence panel next to the answer. "Every answer ships with
 * the evidence panel that produced it — the user can check the model's work."
 *
 * The LLM is optional by design. Without GROQ_API_KEY, or if the call
 * fails, a template narration is generated from the same evidence. An assistant
 * that dies when an API is rate-limited is not demo-safe (§7.4).
 */

import { createHash } from 'node:crypto';

import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import {
  classifyByKeyword,
  dispatch,
  extractEntities,
  type Evidence,
  type Intent,
} from './intents.js';

const QueryBody = z.object({
  question: z.string().trim().min(1).max(500),
});

const GROQ_MODEL = 'openai/gpt-oss-120b';

// `openai/gpt-oss-120b` is a reasoning model: it spends a chunk of max_tokens
// on a hidden `reasoning` field before the visible `content`, and the Groq
// free tier caps this account at 8000 tokens/minute (measured live — a single
// ~1500-prompt-token call left ~100 tokens remaining in the window). Two
// demo questions back to back can 429 the third. The fix is twofold: shrink
// what we send (below) and cache successful narrations (below) so repeats
// cost zero additional tokens.
const MAX_COMPLETION_TOKENS = 700;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Rows of a bundle kept in the prompt sent to the LLM. The UI still gets the
 * full `evidence` in the HTTP response — only the narration prompt is
 * trimmed, to stay well inside the account's tight per-minute token budget
 * and leave headroom for the model's own reasoning tokens.
 */
const PROMPT_ROW_LIMIT = 6;
/**
 * Per-row fields that add bulk without adding anything the narration prompt
 * needs. Kept narrow and deliberate — `signals`/`drivers` stay (they're
 * small and are exactly what makes a risk/forecast narration good, e.g.
 * "at or below the reorder point"); `history` (12 months per pair) and
 * `metrics` (forecast quality diagnostics) are the two genuinely bulky,
 * narration-irrelevant fields that were measured driving demand.forecast's
 * prompt size — the pair's own point/p10/p90/changePct already say what
 * matters for demand narration. Dropped from the prompt projection only.
 */
const VERBOSE_ROW_FIELDS = new Set(['history', 'metrics', 'incidents', 'qc', 'shipments']);

/**
 * Build a compact projection of the evidence for the LLM prompt: cap arrays
 * to the first `PROMPT_ROW_LIMIT` rows (plus a total count so the model
 * knows more exist), and drop bulky per-row sub-arrays that don't change the
 * narration. This is prompt-only — never mutates or shrinks what is returned
 * to the caller.
 */
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
 * occasionally "cites" the evidence by echoing raw fragments verbatim —
 * observed live as 【"point":43266.7】-style citation brackets, sometimes also
 * bare {"key": value} object fragments. The system prompt forbids this
 * explicitly, but a prompt alone is not 100% reliable, so this runs on every
 * LLM answer regardless. Deliberately conservative: it only removes bracket
 * pairs that contain a quoted-key/colon pair (the JSON "fingerprint"), so
 * ordinary parenthetical prose like "(44 institutions)" is never touched.
 */
function stripJsonLeakage(text: string): string {
  let out = text;
  // 【...】-style citation brackets — never legitimate prose; the characters
  // don't occur in any evidence value we send, so it's always safe to drop
  // the whole bracketed span.
  out = out.replace(/【[^】]*】/g, '');
  // Bare {"key": value, ...} or ["key": value] fragments — require at least
  // one quoted-key/colon pair inside a single bracket pair (no nesting), so
  // this can't accidentally eat a normal sentence's parentheses or braces.
  out = out.replace(/[{[][^{}[\]]*"[A-Za-z0-9_]+"\s*:\s*[^{}[\]]*[}\]]/g, '');
  // Tidy the whitespace/punctuation left behind by a removal.
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/\s+([.,;:])/g, '$1');
  out = out.replace(/\(\s*\)/g, '');
  return out.trim();
}

/** Stopwords excluded from the token-overlap grounding check — common
 * English words that would trivially "match" regardless of content. */
const GROUNDING_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'awaiting', 'approval',
  'because', 'before', 'being', 'between', 'currently', 'district',
  'evidence', 'following', 'have', 'information', 'insufficient', 'institution',
  'other', 'plainly', 'question', 'requested', 'shipment', 'showing', 'these',
  'those', 'though', 'through', 'under', 'which', 'while', 'with', 'without',
]);

/**
 * Collect distinct-word tokens (>=4 letters, lowercased) from every string
 * value anywhere in the compacted prompt evidence — institution names, drug
 * names, districts, bands, etc. Numbers are deliberately not the grounding
 * signal here: the prompt instructs the model to spell quantities in words
 * ("twelve thousand" rather than "12,000"), so a digit-based check would
 * reject perfectly good, well-grounded prose.
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
 * against the (observed live) failure mode where the model returns a
 * plausible-sounding but ungrounded hedge — e.g. "I don't have enough
 * information to determine..." — for evidence that plainly contains the
 * answer. Such a response is not caught by the empty-text or bad-status
 * checks, and once cached it would serve the same wrong answer for the full
 * TTL. Rule: if the evidence has any named entities (institution, drug,
 * district, ...), the answer must mention at least one of them. Evidence
 * with too few groundable words (< 3 — e.g. a mostly-numeric scorecard with
 * just an internal ID string) always passes: there's too little to check
 * against, and rejecting a good numeric-only answer is worse than missing a
 * rare thin hedge here.
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

/** Narration cache: (intent + hash of the *prompt* evidence) -> LLM answer.
 * Simple Map with timestamps, no dependency. Only successful LLM narrations
 * are cached — a transient rate-limit/timeout must never poison the cache
 * with template prose (§ acceptance). TTL keeps stale demo data from lingering
 * across a long-running dev session. */
const NARRATION_CACHE_TTL_MS = 10 * 60_000;
const narrationCache = new Map<string, CacheEntry>();

function cacheKey(intent: Intent, question: string, promptEvidence: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(promptEvidence)).digest('hex');
  // Question text is part of the key too: the same evidence answers
  // different questions differently ("what's pending" vs "how old is the
  // oldest pending order" over the same order.queue bundle).
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
  // Opportunistic sweep so a long dev session doesn't accumulate unbounded
  // expired entries — cheap relative to the network call that just happened.
  if (narrationCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of narrationCache) {
      if (v.expiresAt < now) narrationCache.delete(k);
    }
  }
}

/**
 * Narrate strictly from the evidence. The prompt forbids inventing figures —
 * "It cannot invent a number, because it is never asked to produce one" (§6.3).
 */
async function narrate(
  question: string,
  intent: Intent,
  evidence: Evidence,
  log: FastifyBaseLogger,
): Promise<{ answer: string; source: 'llm' | 'template' }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { answer: templateNarration(evidence), source: 'template' };

  const promptEvidence = compactForPrompt(evidence.data);
  const ck = cacheKey(intent, question, promptEvidence);
  const cached = readCache(ck);
  if (cached) return { answer: cached, source: 'llm' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const startedFetch = Date.now();
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: MAX_COMPLETION_TOKENS,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You explain supply-chain evidence to a pharmaceutical manufacturer. ' +
              'Answer using ONLY the JSON evidence provided. Cite specific figures from it, in words. ' +
              'Some arrays are capped with a totalCount field — that count is real and citable, ' +
              'even though only the first few rows are shown. ' +
              'If the evidence is insufficient to answer, say so plainly. ' +
              'Never invent a number that is not in the evidence. Be concise — 2 to 4 sentences. ' +
              'Write plain prose for a human reader, as you would speak it out loud. ' +
              'Never quote the JSON verbatim, and never emit field names, key:value pairs, braces, ' +
              'brackets, or bracketed citation markers of any kind — no "point":43266, no {…}, no 【…】. ' +
              'Refer to quantities in ordinary words with rounded units (e.g. "about 43,000 units"), ' +
              'never as a raw JSON field.',
          },
          {
            role: 'user',
            content: `Question: ${question}\n\nEvidence:\n${JSON.stringify(promptEvidence)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const bodySnippet = await res.text().then((t) => t.slice(0, 300)).catch(() => '<unreadable body>');
      log.warn(
        { question, intent, narrationError: `groq ${res.status}: ${bodySnippet}`, ms: Date.now() - startedFetch },
        'assistant narration falling back to template',
      );
      return { answer: templateNarration(evidence), source: 'template' };
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
      return { answer: templateNarration(evidence), source: 'template' };
    }
    // Defensive cleanup — see stripJsonLeakage: the prompt forbids raw JSON
    // citations, but a reasoning model doesn't always comply, so strip
    // residual fragments before this ever reaches the cache or the UI.
    const cleaned = stripJsonLeakage(text);

    // Grounding check — see isGrounded: a plausible-sounding but ungrounded
    // hedge ("I don't have enough information...") over evidence that
    // plainly has numbers is a bad generation, not a fallback-worthy error,
    // but it must never be trusted OR cached (a cached hedge would serve
    // wrong answers for the full TTL).
    if (!isGrounded(cleaned, promptEvidence)) {
      log.warn(
        { question, intent, narrationError: `groq answer not grounded in evidence: "${cleaned.slice(0, 150)}"` },
        'assistant narration falling back to template',
      );
      return { answer: templateNarration(evidence), source: 'template' };
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
    return { answer: templateNarration(evidence), source: 'template' };
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic prose from the evidence — the demo-safe path. */
function templateNarration(evidence: Evidence): string {
  if (evidence.intent === 'out_of_scope') {
    const data = evidence.data as { capabilities?: Array<{ topic: string; example: string }> } | null;
    const list = data?.capabilities?.map((c) => `${c.topic} (e.g. "${c.example}")`).join('; ') ?? '';
    return list ? `${evidence.summary}. Try one of: ${list}.` : evidence.summary;
  }
  if (evidence.data == null) return evidence.summary;
  if (Array.isArray(evidence.data)) {
    if (evidence.data.length === 0) return `${evidence.summary}. Nothing matched.`;
    return `${evidence.summary}. Showing the top ${Math.min(5, evidence.data.length)} in the evidence panel.`;
  }
  return evidence.summary;
}

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/query', async (req, reply) => {
    const parsed = QueryBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const { question } = parsed.data;
    const started = Date.now();

    // Keyword classification: instant, and immune to an LLM outage (§7.4).
    const intent: Intent = classifyByKeyword(question);
    const entities = extractEntities(question);

    // Scope is enforced here, server-side, BEFORE narration: this server only
    // ever queries the `vayu` schema, so network scope is structural (§7.1).
    const evidence = await dispatch(intent, entities);
    const { answer, source } = await narrate(question, intent, evidence, req.log);

    // Log the full tuple. "If a judge says 'prove it isn't making that up,'
    // you open the log." (§7.4)
    req.log.info(
      { question, intent, entities, evidenceSummary: evidence.summary, narration: source, ms: Date.now() - started },
      'assistant query',
    );

    return {
      question,
      intent,
      answer,
      narration: source,
      evidence, // the panel rendered beside the prose
      ms: Date.now() - started,
    };
  });
}
