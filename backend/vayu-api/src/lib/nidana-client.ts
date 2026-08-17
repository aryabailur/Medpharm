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

export interface ForecastResult {
  point: number;
  p10: number;
  p90: number;
  drivers: Array<{ label: string; direction: 'up' | 'down'; magnitude: number }>;
  source: 'nidana' | 'fallback';
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
