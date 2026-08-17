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

import type { FastifyInstance } from 'fastify';
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
  if (/(delay|late|overdue)/.test(s)) return 'shipment.delayed';
  if (/(when|eta|expect).*(deliver|arrive|next)/.test(s)) return 'shipment.eta';
  if (/(cold|temperature|kept cold|insulin.*cold)/.test(s)) return 'coldchain.status';
  if (/(expir|expiry|shelf life)/.test(s)) return 'stock.expiring';
  if (/(how much|how many|stock|do we have|on hand)/.test(s)) return 'stock.level';
  if (/(consum|dispens|used last)/.test(s)) return 'consumption.trend';
  if (/(reorder|should i order|need to order|restock)/.test(s)) return 'reorder.suggest';
  if (/(complaint).*(open|list|all)/.test(s) || /show.*complaints/.test(s)) return 'complaint.list';
  if (/(complaint|broken|damaged)/.test(s)) return 'complaint.status';
  if (/(supplier|reliable|on-time|scorecard)/.test(s)) return 'supplier.score';
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
      return {
        intent: 'out_of_scope',
        summary:
          "I can only answer questions about this facility's inventory, orders, shipments and complaints.",
        data: null,
      };
  }
}

function templateNarration(e: Evidence): string {
  if (e.data == null) return e.summary;
  if (Array.isArray(e.data)) {
    return e.data.length ? `${e.summary}. Details in the evidence panel.` : `${e.summary}. Nothing matched.`;
  }
  return e.summary;
}

async function narrate(question: string, e: Evidence): Promise<{ answer: string; source: 'llm' | 'template' }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { answer: templateNarration(e), source: 'template' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        temperature: 0.2,
        system:
          'You explain inventory and supply data to hospital pharmacy staff. Answer using ONLY the JSON evidence provided. ' +
          'Cite specific figures from it. If the evidence is insufficient, say so plainly. Never invent a number that is not in the evidence. Be concise — 2 to 4 sentences.',
        messages: [{ role: 'user', content: `Question: ${question}\n\nEvidence:\n${JSON.stringify(e.data, null, 2)}` }],
      }),
    });
    if (!res.ok) return { answer: templateNarration(e), source: 'template' };
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = json.content?.map((c) => c.text ?? '').join('').trim();
    return text ? { answer: text, source: 'llm' } : { answer: templateNarration(e), source: 'template' };
  } catch {
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
    const { answer, source } = await narrate(question, evidence);

    // Log the full tuple: "if a judge says 'prove it isn't making that up,'
    // you open the log." (§7.4)
    req.log.info(
      { question, intent, evidenceSummary: evidence.summary, narration: source, ms: Date.now() - started },
      'assistant query',
    );

    return { question, intent, answer, narration: source, evidence, ms: Date.now() - started };
  });
}
