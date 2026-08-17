/**
 * Nidana client — with a deterministic TypeScript fallback for every call.
 *
 * ARCHITECTURE.md §3.2. README §8 (non-negotiable). Part 2.
 *
 * "Every Nidana endpoint has a deterministic TypeScript fallback (rolling-mean
 * forecast, weighted-sum risk). Ship the fallback path first, then swap in the
 * real model. Never let Nidana be a single point of demo failure."
 *
 * Force the fallback with NIDANA_FORCE_FALLBACK=true and test it before every
 * demo — a fallback nobody has exercised is not a fallback.
 */

const BASE = process.env.NIDANA_BASE_URL ?? 'http://localhost:8000';
const FORCE_FALLBACK = process.env.NIDANA_FORCE_FALLBACK === 'true';
const TIMEOUT_MS = 3_000;

export interface ForecastInput {
  institutionId: string;
  drugId: string;
  history: Array<{ period: string; dispensed: number }>;
  horizonMonths?: number;
}

export interface ForecastMetrics {
  mape: number | null;
  band_coverage_pct: number | null;
  band_coverage_target_pct?: number | null;
  train_rows?: number | null;
  holdout_rows?: number | null;
}

export interface ForecastResult {
  point: number;
  p10: number;
  p90: number;
  drivers: Array<{ label: string; direction: 'up' | 'down'; magnitude: number }>;
  source: 'nidana' | 'fallback';
  /** Present only on the trained path; the rolling-mean fallback has none. */
  metrics?: ForecastMetrics | null;
  /** "lightgbm" or "rolling_mean" — names the path that served this. */
  model_version?: string;
}

export interface RiskInput {
  institutionId: string;
  drugId: string;
  qtyOnHand: number;
  reorderPoint: number;
  recentConsumption: number[];
  openExcursions?: number;
  lateShipments?: number;
  diseaseSignal?: number;
}

export interface RiskSignal {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface RiskResult {
  score: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: 'low' | 'medium' | 'high';
  signals: RiskSignal[];
  source: 'nidana' | 'fallback';
}

async function callNidana<T>(path: string, body: unknown): Promise<T | null> {
  if (FORCE_FALLBACK) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // cold start, deploy down, timeout — fall back silently
  } finally {
    clearTimeout(timer);
  }
}

/** Rolling-mean forecast with a spread-derived band (§3.2). */
export function forecastFallback(input: ForecastInput): ForecastResult {
  const series = input.history.map((h) => h.dispensed).filter((n) => Number.isFinite(n));
  if (series.length === 0) {
    return { point: 0, p10: 0, p90: 0, drivers: [], source: 'fallback' };
  }

  const window = series.slice(-3);
  const point = window.reduce((a, b) => a + b, 0) / window.length;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);

  const recent = window[window.length - 1] ?? point;
  const prior = series.length > 3 ? series[series.length - 4]! : recent;
  const rising = recent >= prior;

  return {
    point: Math.round(point),
    p10: Math.max(0, Math.round(point - 1.28 * sd)),
    p90: Math.round(point + 1.28 * sd),
    drivers: [
      {
        label: "last month's consumption",
        direction: rising ? 'up' : 'down',
        magnitude: Math.abs(recent - prior),
      },
    ],
    source: 'fallback',
  };
}

/**
 * Deterministic weighted-sum risk with drilldown (§6.4).
 *
 * Confidence is SIGNAL AGREEMENT, not model certainty: high when >=3 of 5
 * signals point the same way, medium at 2, low at 1. That rule is what makes
 * "we don't cry wolf" true, and it belongs in the UI tooltip.
 */
export function riskFallback(input: RiskInput): RiskResult {
  const consumption = input.recentConsumption.filter((n) => Number.isFinite(n));
  const avg = consumption.length
    ? consumption.reduce((a, b) => a + b, 0) / consumption.length
    : 0;

  const coverDays = avg > 0 ? (input.qtyOnHand / avg) * 30 : 999;
  const coverSignal = coverDays < 15 ? 1 : coverDays < 30 ? 0.6 : coverDays < 60 ? 0.3 : 0;

  const half = Math.floor(consumption.length / 2) || 1;
  const older = consumption.slice(0, half);
  const newer = consumption.slice(-half);
  const oldAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : avg;
  const newAvg = newer.length ? newer.reduce((a, b) => a + b, 0) / newer.length : avg;
  const trendSignal = oldAvg > 0 ? Math.max(0, Math.min(1, (newAvg - oldAvg) / oldAvg)) : 0;

  const belowReorder = input.qtyOnHand <= input.reorderPoint ? 1 : 0;
  const diseaseSignal = Math.max(0, Math.min(1, input.diseaseSignal ?? 0));
  const supplierSignal = Math.min(
    1,
    ((input.openExcursions ?? 0) * 0.3 + (input.lateShipments ?? 0) * 0.2),
  );

  const signals: RiskSignal[] = [
    { name: 'cover_days', value: Math.round(coverDays), weight: 0.3, contribution: coverSignal * 0.3, explanation: `about ${Math.round(coverDays)} days of stock left at the current rate` },
    { name: 'consumption_trend', value: Number(trendSignal.toFixed(2)), weight: 0.2, contribution: trendSignal * 0.2, explanation: trendSignal > 0.1 ? 'consumption is rising month over month' : 'consumption is flat or falling' },
    { name: 'below_reorder_point', value: belowReorder, weight: 0.2, contribution: belowReorder * 0.2, explanation: belowReorder ? 'stock is at or below the reorder point' : 'stock is above the reorder point' },
    { name: 'disease_signal', value: Number(diseaseSignal.toFixed(2)), weight: 0.15, contribution: diseaseSignal * 0.15, explanation: diseaseSignal > 0.3 ? 'rising disease incidence in this district' : 'no unusual disease signal' },
    { name: 'supplier_reliability', value: Number(supplierSignal.toFixed(2)), weight: 0.15, contribution: supplierSignal * 0.15, explanation: supplierSignal > 0.3 ? 'this institution has open excursions or late inbound shipments' : 'inbound supply looks healthy' },
  ];

  const score = Math.min(1, signals.reduce((a, s) => a + s.contribution, 0));
  const agreeing = signals.filter((s) => s.contribution / (s.weight || 1) > 0.5).length;

  return {
    score: Number(score.toFixed(3)),
    band: score >= 0.75 ? 'CRITICAL' : score >= 0.5 ? 'HIGH' : score >= 0.25 ? 'MEDIUM' : 'LOW',
    confidence: agreeing >= 3 ? 'high' : agreeing === 2 ? 'medium' : 'low',
    signals,
    source: 'fallback',
  };
}

export async function forecast(input: ForecastInput): Promise<ForecastResult> {
  const remote = await callNidana<Omit<ForecastResult, 'source'>>('/forecast', {
    institution_id: input.institutionId,
    drug_id: input.drugId,
    history: input.history,
    horizon_months: input.horizonMonths ?? 1,
  });
  return remote ? { ...remote, source: 'nidana' } : forecastFallback(input);
}

// ─── RCA (§6.3) ───────────────────────────────────────────────────────────

export interface RcaComplaintInput {
  complaint: Record<string, unknown>;
  product: Record<string, unknown>;
  excursions: Array<Record<string, unknown>>;
  shipment: Record<string, unknown>;
  history: Record<string, unknown>;
}

export interface RcaComplaintResult {
  probableCause: string;
  contributingPattern: string | null;
  recommendedActions: string[];
  source: 'nidana' | 'fallback';
}

export interface RcaCategoryCount { category: string; count: number; pct: number }
export interface RcaNamedCount { label: string; count: number }

export interface RcaInsightsInput {
  totalComplaints: number;
  byCategory: RcaCategoryCount[];
  byTeam: RcaNamedCount[];
  excursionSeverity: RcaNamedCount[];
  monthlyTrend: RcaNamedCount[];
}

export interface RcaChartInsight { cause: string; suggestion: string }
export interface RcaCategoryInsight extends RcaChartInsight { category: string }

export interface RcaInsightsResult {
  categoryInsights: RcaCategoryInsight[];
  teamInsight: RcaChartInsight;
  excursionInsight: RcaChartInsight;
  trendInsight: RcaChartInsight;
  source: 'nidana' | 'fallback';
}

/** Deterministic template — what caused it, keyed by complaint category (§6.3 fallback path). */
const CATEGORY_SUGGESTION: Record<string, string> = {
  TEMP_DAMAGE: 'Audit cold-chain handling and pre-cool checks for the routes and carriers behind these shipments.',
  SEAL_TAMPERED: 'Tighten seal verification at dispatch and again at receiving; review custody handoffs on the affected route.',
  QTY_MISMATCH: 'Cross-check manifest counts against dispatch scans; investigate the specific warehouse and shift involved.',
  WRONG_ITEM: 'Add a second-check step at pick-and-pack for this drug/institution pairing.',
  NEAR_EXPIRY: 'Review FEFO (first-expiry-first-out) allocation for this drug in the dispatch queue.',
  BREAKAGE: 'Review packaging and handling procedures for this drug’s pack size on the affected route.',
};

export function rcaComplaintFallback(input: RcaComplaintInput): RcaComplaintResult {
  const complaint = input.complaint as { category?: string; description?: string };
  const excursions = input.excursions ?? [];
  const history = input.history as { sameDrug90d?: number; sameInstitution90d?: number; sameCategory90d?: number };
  const category = complaint.category ?? 'UNKNOWN';

  const parts: string[] = [`This is a ${category} complaint.`];
  if (excursions.length > 0) {
    const worst = excursions.reduce((a: any, b: any) => ((b.maxTempC ?? -Infinity) > (a.maxTempC ?? -Infinity) ? b : a));
    parts.push(
      `The linked shipment recorded ${excursions.length} excursion(s), the worst reaching ${worst.maxTempC ?? '?'}°C for ${worst.durationMin ?? '?'} minutes (${worst.severity ?? 'unknown'} severity).`,
    );
  }
  if (history?.sameCategory90d) {
    parts.push(`${history.sameCategory90d} other ${category} complaint(s) were filed in the last 90 days.`);
  }

  return {
    probableCause: parts.join(' '),
    contributingPattern:
      (history?.sameInstitution90d ?? 0) >= 2
        ? `This institution has filed ${history.sameInstitution90d} complaints in the last 90 days — a recurring pattern, not an isolated event.`
        : null,
    recommendedActions: [CATEGORY_SUGGESTION[category] ?? 'Investigate this complaint against batch QC and shipment records.'],
    source: 'fallback',
  };
}

export function rcaInsightsFallback(input: RcaInsightsInput): RcaInsightsResult {
  const pct = (n: number) => (input.totalComplaints > 0 ? Math.round((n / input.totalComplaints) * 100) : 0);

  const categoryInsights: RcaCategoryInsight[] = input.byCategory.map((c) => ({
    category: c.category,
    cause: `${c.category} accounts for ${c.count} of ${input.totalComplaints} complaints (${pct(c.count)}%).`,
    suggestion: CATEGORY_SUGGESTION[c.category] ?? 'Investigate this category against batch QC and shipment records.',
  }));

  const topTeam = [...input.byTeam].sort((a, b) => b.count - a.count)[0];
  const teamInsight: RcaChartInsight = topTeam
    ? {
        cause: `${topTeam.label} is assigned ${topTeam.count} of ${input.totalComplaints} complaints (${pct(topTeam.count)}%).`,
        suggestion: topTeam.label === 'LOGISTICS'
          ? 'Review handling and cold-chain SOPs with the logistics/carrier team.'
          : 'Review QC release criteria for the batches behind these complaints.',
      }
    : { cause: 'No complaints are assigned to a team yet.', suggestion: 'Triage open complaints to QC or Logistics.' };

  const worstExcursion = [...input.excursionSeverity].sort((a, b) => b.count - a.count)[0];
  const excursionInsight: RcaChartInsight = worstExcursion
    ? {
        cause: `${worstExcursion.count} complaint-linked shipment(s) recorded a ${worstExcursion.label} excursion.`,
        suggestion: 'Prioritise cold-chain audits on the carriers/routes behind these excursions.',
      }
    : { cause: 'No complaint is linked to a temperature excursion.', suggestion: 'No cold-chain action indicated.' };

  const trend = input.monthlyTrend;
  const rising = trend.length >= 2 && trend[trend.length - 1]!.count > trend[trend.length - 2]!.count;
  const trendInsight: RcaChartInsight = trend.length
    ? {
        cause: `Complaint volume is ${rising ? 'rising' : 'flat or falling'} — ${trend[trend.length - 1]!.count} filed in ${trend[trend.length - 1]!.label}.`,
        suggestion: rising ? 'Investigate what changed recently — a new route, carrier, or batch — before volume grows further.' : 'No trend-driven action indicated.',
      }
    : { cause: 'Not enough history for a trend.', suggestion: 'Revisit once more months of data are available.' };

  return { categoryInsights, teamInsight, excursionInsight, trendInsight, source: 'fallback' };
}

export async function rcaComplaint(input: RcaComplaintInput): Promise<RcaComplaintResult> {
  const remote = await callNidana<{ probable_cause: string; contributing_pattern: string | null; recommended_actions: string[] }>(
    '/rca',
    input,
  );
  return remote
    ? {
        probableCause: remote.probable_cause,
        contributingPattern: remote.contributing_pattern,
        recommendedActions: remote.recommended_actions,
        source: 'nidana',
      }
    : rcaComplaintFallback(input);
}

export async function rcaInsights(input: RcaInsightsInput): Promise<RcaInsightsResult> {
  const remote = await callNidana<{
    category_insights: Array<{ category: string; cause: string; suggestion: string }>;
    team_insight: RcaChartInsight;
    excursion_insight: RcaChartInsight;
    trend_insight: RcaChartInsight;
  }>('/rca/insights', {
    total_complaints: input.totalComplaints,
    by_category: input.byCategory,
    by_team: input.byTeam.map((t) => ({ label: t.label, count: t.count })),
    excursion_severity: input.excursionSeverity.map((t) => ({ label: t.label, count: t.count })),
    monthly_trend: input.monthlyTrend.map((t) => ({ label: t.label, count: t.count })),
  });

  return remote
    ? {
        categoryInsights: remote.category_insights,
        teamInsight: remote.team_insight,
        excursionInsight: remote.excursion_insight,
        trendInsight: remote.trend_insight,
        source: 'nidana',
      }
    : rcaInsightsFallback(input);
}

export async function risk(input: RiskInput): Promise<RiskResult> {
  const remote = await callNidana<Omit<RiskResult, 'source'>>('/risk', {
    institution_id: input.institutionId,
    drug_id: input.drugId,
    qty_on_hand: input.qtyOnHand,
    reorder_point: input.reorderPoint,
    recent_consumption: input.recentConsumption,
    open_excursions: input.openExcursions ?? 0,
    late_shipments: input.lateShipments ?? 0,
    disease_signal: input.diseaseSignal,
  });
  return remote ? { ...remote, source: 'nidana' } : riskFallback(input);
}
