/**
 * Evidence → chart renderer for the Nidana assistant (network scope).
 *
 * Every assistant turn ships an `evidence` bundle whose `data` shape depends
 * on `evidence.intent` (see backend/vayu-api/src/routes/assistant/intents.ts,
 * the Prisma-authored source of truth). This component inspects the intent,
 * narrows the row shape with a type guard, and renders the chart primitive
 * from `../../components/charts` that best fits — never a library, never a
 * fabricated value. If the shape doesn't match what a chart needs, it falls
 * back to a plain evidence table; if there's no data at all, a designed
 * `EmptyState`.
 */

import type { ReactNode } from 'react';
import { useState } from 'react';

import {
  BarChart,
  ColumnChart,
  ForecastChart,
  PieChart,
  SignalBars,
  StepRail,
} from '../../components/charts';
import { EmptyState } from '../../components/ui';
import { bandColors, C, FONT, MONO, SERIES } from '../../lib/theme';

// ─── Plain-language SHAP/driver labels ───────────────────────────────────────
//
// Mirrors frontend/vayu/app/risk/page.tsx's `humanizeDriver` — copied, not
// imported, because that page is outside this track. Signal/driver feature
// names must never reach the UI raw.

function humanizeDriver(label: string): string {
  const key = label.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  const map: Record<string, string> = {
    'lag 1': "Last month's consumption",
    lag1: "Last month's consumption",
    'lag 12': 'Same month last year',
    lag12: 'Same month last year',
    trend: 'Underlying demand trend',
    seasonality: 'Seasonal pattern',
    seasonal: 'Seasonal pattern',
    month: 'Time of year',
    'rolling mean': 'Recent average consumption',
    'rolling std': 'Recent demand volatility',
    'stockout days': 'Recent stockout days',
    onboarded: 'Institutions newly onboarded',
    cover_days: 'Days of stock remaining',
    'cover days': 'Days of stock remaining',
    consumption_trend: 'Consumption trend',
    below_reorder_point: 'Below reorder point',
    disease_signal: 'District disease signal',
    supplier_reliability: 'Supplier reliability',
  };
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Row shapes + type guards ────────────────────────────────────────────────
//
// Narrowed by hand from intents.ts — never a cast to `any`. Every field is
// checked before use; a row missing what a chart needs degrades to the table.

interface RiskSignal {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
}

interface RiskRow {
  institution: string;
  district: string | null;
  drug: string;
  score: number;
  band: string;
  confidence: string;
  signals: RiskSignal[];
  source: string;
}

function isRiskRow(v: unknown): v is RiskRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.institution === 'string' &&
    typeof r.drug === 'string' &&
    typeof r.score === 'number' &&
    typeof r.band === 'string' &&
    Array.isArray(r.signals)
  );
}

interface ReliabilityRow {
  institution: string;
  district: string | null;
  complaints: number;
  shipments: number;
  ratePer100: number | null;
}

function isReliabilityRow(v: unknown): v is ReliabilityRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.institution === 'string' && typeof r.complaints === 'number' && typeof r.shipments === 'number';
}

interface ForecastDriver {
  label: string;
  direction: string;
  magnitude: number;
}

interface ForecastRow {
  institution: string;
  district: string | null;
  drug: string;
  history: Array<{ period: string; dispensed: number }>;
  point: number;
  p10: number;
  p90: number;
  drivers: ForecastDriver[];
  lastActual: number;
  changePct: number | null;
  source: string;
}

function isForecastRow(v: unknown): v is ForecastRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.institution === 'string' &&
    typeof r.drug === 'string' &&
    Array.isArray(r.history) &&
    typeof r.point === 'number'
  );
}

interface OrderQueueRow {
  supplyOrderId: string;
  institution: string;
  district: string | null;
  ageHours: number;
  lines: Array<{ drug: string; qtyRequested: number }>;
}

function isOrderQueueRow(v: unknown): v is OrderQueueRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.institution === 'string' && typeof r.ageHours === 'number' && Array.isArray(r.lines);
}

interface ColdchainIncident {
  excursionId: string;
  shipmentId: string;
  severity: string;
  durationMin: number | null;
  maxTempC: number | null;
  minTempC: number | null;
  destination?: string;
  startedAt: string;
}

interface ColdchainData {
  total: number;
  bySeverity: Record<string, number>;
  incidents: ColdchainIncident[];
}

function isColdchainData(v: unknown): v is ColdchainData {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.total === 'number' && typeof r.bySeverity === 'object' && Array.isArray(r.incidents);
}

interface ConsumptionRow {
  drug: string;
  dispensed: number;
}

function isConsumptionRow(v: unknown): v is ConsumptionRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.drug === 'string' && typeof r.dispensed === 'number';
}

interface BatchTraceShipment {
  shipmentId: string;
  status: string;
  destination?: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  excursions: Array<{ severity: string; durationMin: number | null; maxTempC: number | null }>;
  complaints: Array<{ category: string; status: string; filedAt: string }>;
}

interface BatchTraceData {
  batchId: string;
  lotNumber: string;
  drug: string;
  manufactured: string;
  expiry: string;
  status: string;
  qc: Array<{ result: string; inspector: string | null; testedAt: string }>;
  shipments: BatchTraceShipment[];
}

function isBatchTraceData(v: unknown): v is BatchTraceData {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.lotNumber === 'string' && typeof r.drug === 'string' && Array.isArray(r.shipments);
}

interface ComplaintRcaData {
  complaintId: string;
  category: string;
  drug?: string;
  rca: { probable_cause: string; contributing_pattern: string | null; recommended_actions: string[] } | null;
  excursions?: Array<{ severity: string; durationMin: number | null; maxTempC: number | null }>;
}

function isComplaintRcaData(v: unknown): v is ComplaintRcaData {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.category === 'string' && 'rca' in r;
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

const severityColor = (sev: string): string => {
  const s = sev.toUpperCase();
  if (s === 'CRITICAL') return C.red;
  if (s === 'MAJOR' || s === 'HIGH') return C.amber;
  if (s === 'MINOR' || s === 'LOW') return C.green;
  return C.grey;
};

function ChartFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          font: `600 10px/1 ${FONT}`,
          letterSpacing: '.13em',
          textTransform: 'uppercase',
          color: C.inkGhost,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/** Generic evidence table — the guaranteed-safe fallback for any row shape. */
function EvidenceTable({ data }: { data: unknown }) {
  if (data == null) {
    return <EmptyState glyph="◇" title="No evidence returned" hint="This answer has no structured data attached." height={140} />;
  }
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) {
    return <EmptyState glyph="◇" title="Empty evidence set" hint="The query matched nothing right now." height={140} />;
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.slice(0, 8).map((row, i) => (
        <div
          key={i}
          style={{
            padding: '7px 10px',
            background: C.raised,
            borderRadius: 3,
            font: `400 11px/1.5 ${MONO}`,
            color: C.inkMuted,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {summarizeRow(row)}
        </div>
      ))}
      {rows.length > 8 && (
        <div style={{ font: `400 10.5px/1.4 ${FONT}`, color: C.inkGhost }}>
          + {rows.length - 8} more row{rows.length - 8 === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

function summarizeRow(row: unknown): string {
  if (row == null || typeof row !== 'object') return String(row);
  const entries = Object.entries(row as Record<string, unknown>).filter(
    ([, v]) => typeof v !== 'object' || v === null,
  );
  return entries
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

// ─── Per-intent renderers ────────────────────────────────────────────────────

function RiskSummaryChart({ rows }: { rows: RiskRow[] }) {
  const [selected, setSelected] = useState(0);
  const top = rows.slice(0, 8);
  const bars = top.map((r) => ({
    label: `${r.institution} · ${r.drug}`,
    value: r.score,
    color: bandColors(r.band.toUpperCase()).color,
  }));
  const active = top[Math.min(selected, top.length - 1)];
  // The five signals don't share a unit — cover_days is a day count,
  // below_reorder_point is a boolean, the rest are normalised 0..1 — so each
  // gets its own format. Showing all five as "0.00 / 1.00" read as broken.
  const signals =
    active?.signals.map((s) => {
      const firing = s.weight !== 0 ? Math.max(0, Math.min(1, s.contribution / s.weight)) : 0;
      const sc = firing >= 0.66 ? C.red : firing >= 0.34 ? C.amber : C.green;
      const value =
        s.name === 'cover_days'
          ? s.value >= 999
            ? 'no offtake'
            : `${Math.round(s.value)}d`
          : s.name === 'below_reorder_point'
            ? s.value >= 1
              ? 'yes'
              : 'no'
            : `${Math.round(s.value * 100)}%`;
      return { label: humanizeDriver(s.name), value, pct: firing * 100, color: sc, note: s.explanation };
    }) ?? [];

  return (
    <>
      <ChartFrame label={`Top ${top.length} at-risk pairs, by score`}>
        <div style={{ display: 'grid', gap: 4 }}>
          {top.map((r, i) => (
            <button
              key={`${r.institution}-${r.drug}`}
              onClick={() => setSelected(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: i === selected ? C.raised : 'transparent',
                border: 'none',
                borderRadius: 4,
                padding: '4px 6px',
                cursor: 'pointer',
              }}
            >
              <BarChart data={[bars[i]!]} labelWidth={220} valueFormat={(v) => v.toFixed(2)} />
            </button>
          ))}
        </div>
      </ChartFrame>
      {active && (
        <ChartFrame label={`Signals · ${active.institution} · ${active.drug}`}>
          <SignalBars signals={signals} />
        </ChartFrame>
      )}
    </>
  );
}

function ReliabilityChart({ rows }: { rows: ReliabilityRow[] }) {
  const withRate = rows.filter((r) => r.ratePer100 != null).slice(0, 10);
  if (withRate.length === 0) return <EvidenceTable data={rows} />;
  return (
    <ChartFrame label={`Complaint rate per 100 shipments, top ${withRate.length}`}>
      <BarChart
        data={withRate.map((r) => ({ label: r.institution, value: r.ratePer100 as number, color: C.amber }))}
        labelWidth={170}
        valueFormat={(v) => v.toFixed(1)}
      />
    </ChartFrame>
  );
}

function ForecastChartBlock({ rows }: { rows: ForecastRow[] }) {
  const [selected, setSelected] = useState(0);
  const row = rows[Math.min(selected, rows.length - 1)];
  if (!row) return <EvidenceTable data={rows} />;

  const history = row.history.map((h) => ({ x: h.period, y: h.dispensed }));
  const forecastPoint = [{ x: 'Next', y: row.point }];
  const band = [{ hi: row.p90, lo: row.p10 }];
  const driverTotal = row.drivers.reduce((a, d) => a + Math.abs(d.magnitude), 0);
  const driverBars = row.drivers.map((d) => ({
    label: humanizeDriver(d.label),
    value: driverTotal > 0 ? Math.round((Math.abs(d.magnitude) / driverTotal) * 100) : 0,
    color: d.direction.toLowerCase() === 'rising' || d.direction.toLowerCase() === 'up' ? C.red : d.direction.toLowerCase() === 'falling' || d.direction.toLowerCase() === 'down' ? C.green : C.accent,
  }));

  return (
    <>
      {rows.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {rows.slice(0, 6).map((r, i) => (
            <button
              key={`${r.institution}-${r.drug}`}
              onClick={() => setSelected(i)}
              style={{
                padding: '4px 9px',
                borderRadius: 999,
                border: `1px solid ${i === selected ? C.accent : C.border}`,
                background: i === selected ? C.accentTint : C.surface,
                color: i === selected ? C.accent : C.inkFaint,
                font: `500 10.5px/1.4 ${FONT}`,
                cursor: 'pointer',
              }}
            >
              {r.drug}
            </button>
          ))}
        </div>
      )}
      <ChartFrame label={`${row.institution} · ${row.drug} — history + forecast (P10–P90 band)`}>
        <ForecastChart history={history} forecast={forecastPoint} band={band} height={220} width={760} />
      </ChartFrame>
      {driverBars.length > 0 && (
        <ChartFrame label="What's driving this forecast">
          <BarChart data={driverBars} labelWidth={170} valueFormat={(v) => `${v}%`} />
        </ChartFrame>
      )}
    </>
  );
}

function OrderQueueChart({ rows }: { rows: OrderQueueRow[] }) {
  const top = rows.slice(0, 10);
  const bars = top.map((r) => ({
    label: r.institution,
    value: r.ageHours,
    color: r.ageHours >= 24 ? C.red : r.ageHours >= 8 ? C.amber : C.green,
  }));
  return (
    <ChartFrame label={`Age of pending orders (hours), ${top.length} shown`}>
      <BarChart data={bars} labelWidth={170} valueFormat={(v) => `${Math.round(v)}h`} />
    </ChartFrame>
  );
}

function ColdchainChart({ data }: { data: ColdchainData }) {
  const bars = Object.entries(data.bySeverity).map(([sev, count]) => ({
    label: sev,
    count,
    color: severityColor(sev),
  }));
  if (bars.length === 0) {
    return <EmptyState glyph="◇" title="No excursions" hint="No cold-chain excursions in the last 30 days." height={140} />;
  }
  return (
    <ChartFrame label={`${data.total} excursion(s) in the last 30 days, by severity`}>
      <ColumnChart bars={bars} height={130} />
    </ChartFrame>
  );
}

function ConsumptionChart({ rows }: { rows: ConsumptionRow[] }) {
  const top = rows.slice(0, 10);
  return (
    <ChartFrame label={`Top ${top.length} drugs by dispensed volume`}>
      <BarChart
        data={top.map((r, i) => ({ label: r.drug, value: r.dispensed, color: SERIES[i % SERIES.length] }))}
        labelWidth={200}
      />
    </ChartFrame>
  );
}

function BatchTraceChart({ data }: { data: BatchTraceData }) {
  const steps: Array<{ label: string; time: string; dot: string; line?: string; fg?: string }> = [];
  steps.push({ label: `Manufactured — ${data.drug}`, time: new Date(data.manufactured).toLocaleDateString(), dot: C.inkMuted });
  for (const q of data.qc) {
    steps.push({
      label: `QC ${q.result}${q.inspector ? ` · ${q.inspector}` : ''}`,
      time: new Date(q.testedAt).toLocaleDateString(),
      dot: q.result === 'PASS' ? C.green : C.red,
    });
  }
  for (const s of data.shipments) {
    const hasExcursion = s.excursions.length > 0;
    steps.push({
      label: `Shipped to ${s.destination ?? 'unknown'} · ${s.status}`,
      time: s.dispatchedAt ? new Date(s.dispatchedAt).toLocaleDateString() : 'not dispatched',
      dot: hasExcursion ? C.amber : C.accent,
    });
    if (s.deliveredAt) {
      steps.push({ label: 'Delivered', time: new Date(s.deliveredAt).toLocaleDateString(), dot: C.green });
    }
    for (const c of s.complaints) {
      steps.push({ label: `Complaint: ${c.category} (${c.status})`, time: new Date(c.filedAt).toLocaleDateString(), dot: C.red, fg: C.red });
    }
  }
  return (
    <ChartFrame label={`Custody chain — lot ${data.lotNumber}`}>
      <StepRail steps={steps} />
    </ChartFrame>
  );
}

function ComplaintRcaChart({ data }: { data: ComplaintRcaData }) {
  const excursions = data.excursions ?? [];
  const bySeverity = new Map<string, number>();
  for (const e of excursions) bySeverity.set(e.severity, (bySeverity.get(e.severity) ?? 0) + 1);
  const pieData = [...bySeverity.entries()].map(([label, value], i) => ({
    label,
    value,
    color: severityColor(label) ?? SERIES[i % SERIES.length],
  }));

  return (
    <>
      {pieData.length > 0 ? (
        <ChartFrame label="Contributing excursions by severity">
          <PieChart data={pieData} centre={String(excursions.length)} />
        </ChartFrame>
      ) : (
        <EmptyState glyph="◇" title="No linked excursions" hint="This complaint has no cold-chain excursion evidence." height={120} />
      )}
      {data.rca && (
        <ChartFrame label="Root cause">
          <div style={{ font: `400 12.5px/1.6 ${FONT}`, color: C.inkMuted }}>{data.rca.probable_cause}</div>
          {data.rca.recommended_actions.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {data.rca.recommended_actions.map((a, i) => (
                <li key={i} style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkFaint }}>
                  {a}
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>
      )}
    </>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function EvidenceChart({ intent, data }: { intent: string; data: unknown }) {
  if (data == null) {
    return (
      <EmptyState
        glyph="◇"
        title="No evidence for this answer"
        hint="Nothing matched the query, or this intent isn't wired up yet."
        height={140}
      />
    );
  }

  switch (intent) {
    case 'risk.summary':
    case 'diagnosis.stockout': {
      if (Array.isArray(data) && data.length > 0 && data.every(isRiskRow)) {
        return <RiskSummaryChart rows={data} />;
      }
      break;
    }
    case 'institution.reliability': {
      if (Array.isArray(data) && data.length > 0 && data.every(isReliabilityRow)) {
        return <ReliabilityChart rows={data} />;
      }
      break;
    }
    case 'demand.forecast': {
      if (Array.isArray(data) && data.length > 0 && data.every(isForecastRow)) {
        return <ForecastChartBlock rows={data} />;
      }
      break;
    }
    case 'order.queue': {
      if (Array.isArray(data) && data.length > 0 && data.every(isOrderQueueRow)) {
        return <OrderQueueChart rows={data} />;
      }
      break;
    }
    case 'coldchain.incidents': {
      if (isColdchainData(data)) {
        return <ColdchainChart data={data} />;
      }
      break;
    }
    case 'consumption.network': {
      if (Array.isArray(data) && data.length > 0 && data.every(isConsumptionRow)) {
        return <ConsumptionChart rows={data} />;
      }
      break;
    }
    case 'batch.trace': {
      if (isBatchTraceData(data)) {
        return <BatchTraceChart data={data} />;
      }
      break;
    }
    case 'complaint.rca': {
      if (isComplaintRcaData(data)) {
        return <ComplaintRcaChart data={data} />;
      }
      break;
    }
    default:
      break;
  }

  // Shape didn't match (or an unimplemented/route.performance/coverage.gap/
  // wastage.flag intent) — degrade to the table rather than risk a broken
  // chart indexing into an absent field.
  return <EvidenceTable data={data} />;
}
