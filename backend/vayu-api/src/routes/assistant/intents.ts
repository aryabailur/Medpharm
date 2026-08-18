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
import { forecast, risk } from '../../lib/nidana-client.js';

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

/** How recent a month must be to count toward the district disease signal. */
const DISEASE_LOOKBACK_MONTHS = 3;

/**
 * One district's derived 0..1 disease signal.
 *
 * Blends the latest month's outbreak flag (binary, high weight when true)
 * with the normalised trend-vs-3-month-average, so a district that is both
 * flagged AND trending up scores higher than either alone. Districts with no
 * rows genuinely have no signal — this returns 0, never a guess.
 */
function deriveDiseaseSignal(rows: Array<{ month: Date; outbreakFlag: boolean; trendPctVs3mAvg: number | null }>): number {
  if (rows.length === 0) return 0;
  const latestMonth = rows.reduce((max, r) => (r.month > max ? r.month : max), rows[0]!.month);
  const latest = rows.filter((r) => r.month.getTime() === latestMonth.getTime());
  const outbreakNow = latest.some((r) => r.outbreakFlag);
  // trendPctVs3mAvg is a percentage (e.g. 40 for +40%); normalise to 0..1
  // over a 0-100% band and clamp — a huge spike shouldn't exceed 1.
  const trends = latest.map((r) => r.trendPctVs3mAvg ?? 0).filter((n) => Number.isFinite(n));
  const trend = trends.length ? Math.max(...trends) / 100 : 0;
  const trendSignal = Math.max(0, Math.min(1, trend));
  return Math.max(0, Math.min(1, (outbreakNow ? 0.6 : 0) + trendSignal * 0.4));
}

/** M3 — network risk summary, scored via Nidana with a TS fallback. */
async function riskSummary(): Promise<Evidence> {
  // Reads StockLedger, not ConsumptionFeed. The MedTrack dataset (§10) loads
  // 88k monthly rows into StockLedger; ConsumptionFeed only ever holds what
  // Dhanvantari pushes up over the contract, which is a much thinner slice.
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  const feeds = await prisma.stockLedger.findMany({
    where: { month: { gte: since }, institution: { type: { not: 'WAREHOUSE' } } },
    orderBy: { month: 'desc' },
    take: 1200,
    include: {
      institution: { select: { id: true, name: true, district: true, districtId: true } },
      drug: { select: { id: true, name: true } },
    },
  });

  const byPair = new Map<
    string,
    {
      institution: string;
      district: string | null;
      districtId: string | null;
      drug: string;
      institutionId: string;
      drugId: string;
      series: number[];
      closing: number;
    }
  >();
  for (const f of feeds) {
    const key = `${f.institutionId}:${f.drugId}`;
    const cur = byPair.get(key) ?? {
      institution: f.institution.name,
      district: f.institution.district,
      districtId: f.institution.districtId,
      drug: f.drug.name,
      institutionId: f.institutionId,
      drugId: f.drugId,
      series: [],
      closing: f.closingStock ?? 0,
    };
    if (f.dispensed != null) cur.series.push(f.dispensed);
    byPair.set(key, cur);
  }

  // Scoring a pair means a Nidana round-trip. Doing that for every pair with
  // recent history (hundreds to low thousands on the full dataset) is what
  // made this endpoint take 6+ seconds while the UI only ever shows the top
  // 8. Rank on a cheap, no-network proxy first — closing stock against
  // average recent consumption, i.e. rough cover days — and only send the
  // most urgent-looking slice through the real scorer. Generous headroom
  // (80 vs the 20 returned) so an imperfect proxy still finds the true top 20.
  const RANK_CAP = 80;
  const ranked = [...byPair.values()]
    .map((p) => {
      const avg = p.series.length ? p.series.reduce((a, b) => a + b, 0) / p.series.length : 0;
      const coverProxy = avg > 0 ? p.closing / avg : p.closing > 0 ? Infinity : -1; // no consumption, some stock -> not urgent; zero stock -> most urgent
      return { p, coverProxy };
    })
    .sort((a, b) => a.coverProxy - b.coverProxy)
    .slice(0, RANK_CAP)
    .map((x) => x.p);

  // ─── Enrich the ranked slice with the two signals the scorer was missing ──
  // Each of these is ONE query across every pair in `ranked`, never a
  // per-pair round trip — that's what kept this endpoint under 3s before,
  // and adding real signals must not regress it.

  const institutionIds = [...new Set(ranked.map((p) => p.institutionId))];
  const drugIds = [...new Set(ranked.map((p) => p.drugId))];
  const districtIds = [...new Set(ranked.map((p) => p.districtId).filter((d): d is string => !!d))];

  // 1. Latest on-hand snapshot. CurrentStock is refreshed more recently than
  //    the ledger's closingStock, which can be months stale for pairs at the
  //    top of the ranking (that staleness is exactly why cover_days was
  //    collapsing to 0). Fall back to ledger closing stock when a pair has
  //    no CurrentStock row.
  const currentStockRows = await prisma.currentStock.findMany({
    where: { institutionId: { in: institutionIds }, drugId: { in: drugIds } },
    select: { institutionId: true, drugId: true, quantityOnHand: true },
  });
  const qtyOnHandByPair = new Map<string, number>();
  for (const r of currentStockRows) {
    qtyOnHandByPair.set(`${r.institutionId}:${r.drugId}`, r.quantityOnHand);
  }

  // 2. District disease signal — one grouped fetch across all districts in
  //    scope, most recent months only.
  const diseaseSince = new Date();
  diseaseSince.setMonth(diseaseSince.getMonth() - DISEASE_LOOKBACK_MONTHS);
  const diseaseRows = districtIds.length
    ? await prisma.diseaseSignal.findMany({
        where: { districtId: { in: districtIds }, month: { gte: diseaseSince } },
        select: { districtId: true, month: true, outbreakFlag: true, trendPctVs3mAvg: true },
      })
    : [];
  const diseaseByDistrict = new Map<string, Array<{ month: Date; outbreakFlag: boolean; trendPctVs3mAvg: number | null }>>();
  for (const r of diseaseRows) {
    const arr = diseaseByDistrict.get(r.districtId) ?? [];
    arr.push({ month: r.month, outbreakFlag: r.outbreakFlag, trendPctVs3mAvg: r.trendPctVs3mAvg });
    diseaseByDistrict.set(r.districtId, arr);
  }
  const diseaseSignalByDistrict = new Map<string, number>();
  for (const [districtId, rows] of diseaseByDistrict) {
    diseaseSignalByDistrict.set(districtId, deriveDiseaseSignal(rows));
  }

  // 3. Open excursions / late shipments per institution — one shipment fetch
  //    (with its excursions) across all institutions in scope.
  const now = new Date();
  const shipmentRows = await prisma.shipment.findMany({
    where: { supplyOrder: { institutionId: { in: institutionIds } } },
    select: {
      supplyOrder: { select: { institutionId: true } },
      etaAt: true,
      deliveredAt: true,
      excursions: { select: { endedAt: true } },
    },
  });
  const excursionsByInstitution = new Map<string, number>();
  const lateShipmentsByInstitution = new Map<string, number>();
  for (const s of shipmentRows) {
    const institutionId = s.supplyOrder?.institutionId;
    if (!institutionId) continue;
    const openExcursions = s.excursions.filter((e) => e.endedAt == null).length;
    if (openExcursions > 0) {
      excursionsByInstitution.set(institutionId, (excursionsByInstitution.get(institutionId) ?? 0) + openExcursions);
    }
    // Late = delivered after its ETA, or still undelivered past its ETA.
    const isLate = s.etaAt != null && (s.deliveredAt ? s.deliveredAt > s.etaAt : now > s.etaAt);
    if (isLate) {
      lateShipmentsByInstitution.set(institutionId, (lateShipmentsByInstitution.get(institutionId) ?? 0) + 1);
    }
  }

  const scored = await Promise.all(
    ranked.map(async (p) => {
      const pairKey = `${p.institutionId}:${p.drugId}`;
      const avgConsumption = p.series.length ? p.series.reduce((a, b) => a + b, 0) / p.series.length : 0;
      const qtyOnHand = qtyOnHandByPair.get(pairKey) ?? p.closing;
      const diseaseSignal = p.districtId ? diseaseSignalByDistrict.get(p.districtId) ?? 0 : 0;

      const r = await risk({
        institutionId: p.institutionId,
        drugId: p.drugId,
        qtyOnHand,
        reorderPoint: Math.round(avgConsumption * 0.5),
        recentConsumption: p.series.slice(0, 6).reverse(),
        diseaseSignal,
        openExcursions: excursionsByInstitution.get(p.institutionId) ?? 0,
        lateShipments: lateShipmentsByInstitution.get(p.institutionId) ?? 0,
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
  // Last 12 months from the ledger, facilities only — warehouses would double
  // count what they issue onward (§10).
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const feeds = await prisma.stockLedger.findMany({
    where: { month: { gte: since }, institution: { type: { not: 'WAREHOUSE' } } },
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


/** M2 — per-drug demand forecast with an 80% band and plain-language drivers. */
async function demandForecast(entities: Entities): Promise<Evidence> {
  // 30 months of ledger history per pair: LightGBM needs ~18 usable rows after
  // lag construction (longest lag is 12), so a shorter window can only ever
  // fall back to a rolling mean.
  const since = new Date();
  since.setMonth(since.getMonth() - 30);
  const feeds = await prisma.stockLedger.findMany({
    where: { month: { gte: since }, institution: { type: { not: 'WAREHOUSE' } } },
    orderBy: { month: 'asc' },
    include: {
      institution: { select: { id: true, name: true, district: true } },
      drug: { select: { id: true, name: true } },
    },
  });

  // Group into one series per institution+drug. The model needs an ordered
  // monthly series; a bag of rows would forecast nothing meaningful.
  const byPair = new Map<
    string,
    { institution: string; district: string | null; drug: string; institutionId: string; drugId: string; history: Array<{ period: string; dispensed: number }> }
  >();
  for (const f of feeds) {
    if (entities.district && f.institution.district?.toLowerCase() !== entities.district.toLowerCase()) continue;
    const key = `${f.institutionId}:${f.drugId}`;
    const cur = byPair.get(key) ?? {
      institution: f.institution.name,
      district: f.institution.district,
      drug: f.drug.name,
      institutionId: f.institutionId,
      drugId: f.drugId,
      history: [],
    };
    cur.history.push({ period: f.month.toISOString().slice(0, 7), dispensed: f.dispensed ?? 0 });
    byPair.set(key, cur);
  }

  // Forecasting all ~1500 institution/drug pairs takes seconds — LightGBM
  // trains a point + two quantile regressors per pair, so it's real CPU work,
  // not just network overhead — and nobody reads past the top of the list
  // (frontend/vayu/app/risk/page.tsx renders only the top 6). Rank by recent
  // volume and forecast the top 10 — a small buffer over what's shown, not
  // the 25 the UI never used. §9's gate is 6 demo questions in under 3s, and
  // an unbounded fan-out blows it.
  const ranked = [...byPair.values()]
    .map((p) => ({ p, recent: p.history.slice(-3).reduce((a, h) => a + h.dispensed, 0) }))
    .sort((a, b) => b.recent - a.recent)
    .slice(0, 10)
    .map((x) => x.p);

  const results = await Promise.all(
    ranked.map(async (p) => {
      const f = await forecast({
        institutionId: p.institutionId,
        drugId: p.drugId,
        history: p.history,
      });
      const lastActual = p.history[p.history.length - 1]?.dispensed ?? 0;
      return {
        institution: p.institution,
        district: p.district,
        drug: p.drug,
        history: p.history.slice(-12),
        point: f.point,
        p10: f.p10,
        p90: f.p90,
        drivers: f.drivers,
        lastActual,
        changePct: lastActual > 0 ? Number((((f.point - lastActual) / lastActual) * 100).toFixed(1)) : null,
        source: f.source,
        metrics: (f as { metrics?: unknown }).metrics ?? null,
      };
    }),
  );

  const sorted = results.sort((a, b) => b.point - a.point);
  return {
    intent: 'demand.forecast',
    summary: sorted.length
      ? `Next-period demand forecast for ${sorted.length} institution/drug pair(s)`
      : 'No consumption history to forecast from',
    data: sorted,
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
      return demandForecast(entities);
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
