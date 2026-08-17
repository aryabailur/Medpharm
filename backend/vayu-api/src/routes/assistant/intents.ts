/**
 * Assistant tool dispatch — network scope (M1–M12).
 *
 * ARCHITECTURE.md §7.1, §7.3, §7.4. README §5 (Phase 9), Part 2.
 *
 * THREE RULES, stated on stage (§7.1):
 *   1. The LLM never sees the database. It sees a JSON evidence bundle.
 *   2. Every answer ships with the evidence panel that produced it.
 *   3. Scope is enforced server-side, before the LLM is invoked.
 *
 * "Never generate SQL from an LLM. Every query in these tables is a
 * hand-written, parameterised Prisma call. Text-to-SQL is a security hole and a
 * hallucination surface, and it will fail live." (§7.4)
 *
 * Every function below is exactly that: hand-written and parameterised.
 */

import { prisma } from '../../lib/prisma.js';
import { risk } from '../../lib/nidana-client.js';

export type Intent =
  | 'diagnosis.stockout'
  | 'demand.forecast'
  | 'risk.summary'
  | 'institution.reliability'
  | 'coldchain.incidents'
  | 'route.performance'
  | 'order.queue'
  | 'batch.trace'
  | 'coverage.gap'
  | 'consumption.network'
  | 'wastage.flag'
  | 'complaint.rca'
  | 'out_of_scope';

export interface Entities {
  drug?: string;
  institution?: string;
  district?: string;
  batchId?: string;
  shipmentId?: string;
  period?: string;
}

export interface Evidence {
  intent: Intent;
  summary: string;
  data: unknown;
}

/**
 * Keyword intent classifier — the fallback for when the LLM API is down or
 * rate-limited mid-demo (§7.4). Deliberately dumb and instant.
 */
export function classifyByKeyword(q: string): Intent {
  const s = q.toLowerCase();
  if (/(why|reason).*(low|out of stock|stockout|running out)/.test(s)) return 'diagnosis.stockout';
  if (/(forecast|predict|will need|next month|demand)/.test(s)) return 'demand.forecast';
  if (/(risk|about to stock out|going to run out)/.test(s)) return 'risk.summary';
  if (/(which institution|most damage|report the most|reliability)/.test(s)) return 'institution.reliability';
  if (/(excursion|cold chain|temperature breach)/.test(s) && /(how many|this month|count)/.test(s)) return 'coldchain.incidents';
  if (/(route|corridor).*(fail|excursion|worst)/.test(s)) return 'route.performance';
  if (/(pending|awaiting|approval|queue)/.test(s)) return 'order.queue';
  if (/(trace|track|history of).*(batch|lot)/.test(s) || /batch [a-z0-9-]+/.test(s)) return 'batch.trace';
  if (/(underserved|coverage|gap|per capita)/.test(s)) return 'coverage.gap';
  if (/(moving fastest|consumption|most dispensed|leaderboard)/.test(s)) return 'consumption.network';
  if (/(wastage|expiry|expired|losing stock)/.test(s)) return 'wastage.flag';
  if (/(caused|rca|root cause).*(complaint)/.test(s) || /what caused/.test(s)) return 'complaint.rca';
  return 'out_of_scope';
}

/** M7 — the aged approval queue. */
async function orderQueue(): Promise<Evidence> {
  const rows = await prisma.supplyOrder.findMany({
    where: { status: 'PENDING' },
    orderBy: { placedAt: 'asc' },
    take: 20,
    include: {
      institution: { select: { name: true, district: true } },
      lines: { include: { drug: { select: { name: true } } } },
    },
  });
  const now = Date.now();
  const data = rows.map((o) => ({
    supplyOrderId: o.id,
    institution: o.institution.name,
    district: o.institution.district,
    ageHours: Math.floor((now - o.placedAt.getTime()) / 3_600_000),
    lines: o.lines.map((l) => ({ drug: l.drug.name, qtyRequested: l.qtyRequested })),
  }));
  return { intent: 'order.queue', summary: `${data.length} order(s) awaiting approval`, data };
}

/** M5 — excursions by severity, route and carrier. */
async function coldchainIncidents(): Promise<Evidence> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.excursion.findMany({
    where: { startedAt: { gte: since } },
    include: { shipment: { select: { id: true, supplyOrder: { select: { institution: { select: { name: true, district: true } } } } } } },
    orderBy: { startedAt: 'desc' },
  });

  const bySeverity = rows.reduce<Record<string, number>>((acc, e) => {
    acc[e.severity] = (acc[e.severity] ?? 0) + 1;
    return acc;
  }, {});

  return {
    intent: 'coldchain.incidents',
    summary: `${rows.length} excursion(s) in the last 30 days`,
    data: {
      total: rows.length,
      bySeverity,
      incidents: rows.slice(0, 20).map((e) => ({
        excursionId: e.id,
        shipmentId: e.shipmentId,
        severity: e.severity,
        durationMin: e.durationMin,
        maxTempC: e.maxTempC,
        minTempC: e.minTempC,
        destination: e.shipment.supplyOrder?.institution?.name,
        startedAt: e.startedAt,
      })),
    },
  };
}

/** M4 — complaint rate per institution. */
async function institutionReliability(): Promise<Evidence> {
  const complaints = await prisma.complaint.findMany({
    include: { institution: { select: { id: true, name: true, district: true } } },
  });
  const shipments = await prisma.shipment.findMany({
    select: { supplyOrder: { select: { institutionId: true } } },
  });

  const shipCount = new Map<string, number>();
  for (const s of shipments) {
    const id = s.supplyOrder?.institutionId;
    if (id) shipCount.set(id, (shipCount.get(id) ?? 0) + 1);
  }

  const grouped = new Map<string, { name: string; district: string | null; complaints: number }>();
  for (const c of complaints) {
    if (!c.institution) continue;
    const cur = grouped.get(c.institution.id) ?? {
      name: c.institution.name,
      district: c.institution.district,
      complaints: 0,
    };
    cur.complaints += 1;
    grouped.set(c.institution.id, cur);
  }

  const data = [...grouped.entries()]
    .map(([id, v]) => {
      const ships = shipCount.get(id) ?? 0;
      return {
        institution: v.name,
        district: v.district,
        complaints: v.complaints,
        shipments: ships,
        ratePer100: ships > 0 ? Number(((v.complaints / ships) * 100).toFixed(1)) : null,
      };
    })
    .sort((a, b) => (b.ratePer100 ?? 0) - (a.ratePer100 ?? 0));

  return {
    intent: 'institution.reliability',
    summary: `${data.length} institution(s) with complaints on record`,
    data,
  };
}

/** M3 — network risk summary, scored via Nidana with a TS fallback. */
async function riskSummary(): Promise<Evidence> {
  const feeds = await prisma.consumptionFeed.findMany({
    orderBy: { periodMonth: 'desc' },
    take: 300,
    include: {
      institution: { select: { id: true, name: true, district: true } },
      drug: { select: { id: true, name: true } },
    },
  });

  const byPair = new Map<string, { institution: string; district: string | null; drug: string; institutionId: string; drugId: string; series: number[]; closing: number }>();
  for (const f of feeds) {
    const key = `${f.institutionId}:${f.drugId}`;
    const cur = byPair.get(key) ?? {
      institution: f.institution.name,
      district: f.institution.district,
      drug: f.drug.name,
      institutionId: f.institutionId,
      drugId: f.drugId,
      series: [],
      closing: f.closing ?? 0,
    };
    if (f.dispensed != null) cur.series.push(f.dispensed);
    byPair.set(key, cur);
  }

  const scored = await Promise.all(
    [...byPair.values()].map(async (p) => {
      const r = await risk({
        institutionId: p.institutionId,
        drugId: p.drugId,
        qtyOnHand: p.closing,
        reorderPoint: Math.round((p.series.reduce((a, b) => a + b, 0) / (p.series.length || 1)) * 0.5),
        recentConsumption: p.series.slice(0, 6).reverse(),
      });
      return { institution: p.institution, district: p.district, drug: p.drug, score: r.score, band: r.band, confidence: r.confidence, signals: r.signals, source: r.source };
    }),
  );

  const atRisk = scored.filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score);
  return {
    intent: 'risk.summary',
    summary: `${atRisk.length} institution/drug pair(s) at elevated stockout risk`,
    data: atRisk.slice(0, 20),
  };
}

/** M8 — full custody chain for a batch. */
async function batchTrace(entities: Entities): Promise<Evidence> {
  const ref = entities.batchId;
  if (!ref) return { intent: 'batch.trace', summary: 'No batch identifier in the question', data: null };

  const batch = await prisma.batch.findFirst({
    where: { OR: [{ id: ref }, { lotNumber: ref }, { qrPayload: ref }] },
    include: {
      drug: true,
      qcRecords: { orderBy: { testedAt: 'asc' } },
      shipmentBatch: {
        include: {
          shipment: {
            include: {
              excursions: { orderBy: { startedAt: 'asc' } },
              complaints: true,
              supplyOrder: { include: { institution: { select: { name: true, district: true } } } },
            },
          },
        },
      },
    },
  });

  if (!batch) return { intent: 'batch.trace', summary: `No batch matching "${ref}"`, data: null };

  return {
    intent: 'batch.trace',
    summary: `Custody chain for lot ${batch.lotNumber} (${batch.drug.name})`,
    data: {
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      drug: batch.drug.name,
      manufactured: batch.mfgDate,
      expiry: batch.expiryDate,
      status: batch.status,
      qc: batch.qcRecords.map((q) => ({ result: q.result, inspector: q.inspector, testedAt: q.testedAt })),
      shipments: batch.shipmentBatch.map((sb) => ({
        shipmentId: sb.shipmentId,
        status: sb.shipment.status,
        destination: sb.shipment.supplyOrder?.institution?.name,
        dispatchedAt: sb.shipment.dispatchedAt,
        deliveredAt: sb.shipment.deliveredAt,
        excursions: sb.shipment.excursions.map((e) => ({ severity: e.severity, durationMin: e.durationMin, maxTempC: e.maxTempC })),
        complaints: sb.shipment.complaints.map((c) => ({ category: c.category, status: c.status, filedAt: c.filedAt })),
      })),
    },
  };
}

/** M10 — consumption leaderboard. */
async function consumptionNetwork(): Promise<Evidence> {
  const feeds = await prisma.consumptionFeed.findMany({
    include: { drug: { select: { name: true } } },
  });
  const totals = new Map<string, number>();
  for (const f of feeds) {
    totals.set(f.drug.name, (totals.get(f.drug.name) ?? 0) + (f.dispensed ?? 0));
  }
  const data = [...totals.entries()]
    .map(([drug, dispensed]) => ({ drug, dispensed }))
    .sort((a, b) => b.dispensed - a.dispensed)
    .slice(0, 20);
  return { intent: 'consumption.network', summary: `Top ${data.length} drug(s) by dispensed volume`, data };
}

/** M12 — cached RCA for a complaint (§6.3). */
async function complaintRca(): Promise<Evidence> {
  const c = await prisma.complaint.findFirst({
    where: { rcaJson: { not: undefined } },
    orderBy: { filedAt: 'desc' },
    include: {
      batch: { include: { drug: { select: { name: true } } } },
      shipment: { include: { excursions: true } },
      institution: { select: { name: true, district: true } },
    },
  });
  if (!c) return { intent: 'complaint.rca', summary: 'No complaint with a cached RCA yet', data: null };
  return {
    intent: 'complaint.rca',
    summary: `RCA for ${c.category} complaint from ${c.institution?.name ?? 'unknown'}`,
    data: {
      complaintId: c.id,
      category: c.category,
      drug: c.batch?.drug.name,
      rca: c.rcaJson,
      excursions: c.shipment?.excursions.map((e) => ({ severity: e.severity, durationMin: e.durationMin, maxTempC: e.maxTempC })),
    },
  };
}

/** M1 — the money demo: multi-signal stockout diagnosis. */
async function diagnosisStockout(entities: Entities): Promise<Evidence> {
  const summary = await riskSummary();
  const rows = summary.data as Array<{ district: string | null; drug: string }>;
  const filtered = entities.district
    ? rows.filter((r) => r.district?.toLowerCase() === entities.district!.toLowerCase())
    : rows;
  return {
    intent: 'diagnosis.stockout',
    summary: filtered.length
      ? `Multi-signal diagnosis for ${filtered.length} at-risk pair(s)`
      : 'No elevated stockout risk on record for that query',
    data: filtered.slice(0, 5),
  };
}

/** Dispatch table — one hand-written Prisma path per intent (§7.4). */
export async function dispatch(intent: Intent, entities: Entities): Promise<Evidence> {
  switch (intent) {
    case 'order.queue':
      return orderQueue();
    case 'coldchain.incidents':
      return coldchainIncidents();
    case 'institution.reliability':
      return institutionReliability();
    case 'risk.summary':
      return riskSummary();
    case 'batch.trace':
      return batchTrace(entities);
    case 'consumption.network':
      return consumptionNetwork();
    case 'complaint.rca':
      return complaintRca();
    case 'diagnosis.stockout':
      return diagnosisStockout(entities);
    case 'demand.forecast':
    case 'route.performance':
    case 'coverage.gap':
    case 'wastage.flag':
      return { intent, summary: 'Not implemented yet in this phase', data: null };
    default:
      return {
        intent: 'out_of_scope',
        summary:
          'I can only answer questions about this network\'s catalogue, orders, shipments, cold chain and complaints.',
        data: null,
      };
  }
}

/** Crude entity extraction for the keyword path. */
export function extractEntities(q: string): Entities {
  const e: Entities = {};
  const batch = /\b(?:batch|lot)\s+([A-Za-z0-9-]+)/i.exec(q);
  if (batch) e.batchId = batch[1];
  const district = /\b(?:in|for|at)\s+([A-Z][a-z]+)/.exec(q);
  if (district) e.district = district[1];
  return e;
}
