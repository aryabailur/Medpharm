/**
 * Evidence → chart renderer for the Nidana assistant (institution scope).
 *
 * Every assistant turn ships an `evidence` bundle whose `data` shape depends
 * on `evidence.intent` (see backend/dhanvantari-api/src/routes/assistant/index.ts,
 * the Prisma-authored source of truth for this server — its intent set is its
 * own, scoped to one institution's schema, distinct from Vayu's network-scope
 * intents). This component inspects the intent, narrows the row shape with a
 * type guard, and renders the chart primitive from `../../components/charts`
 * that best fits — never a library, never a fabricated value. If the shape
 * doesn't match what a chart needs, it falls back to a plain evidence table;
 * if there's no data at all, a designed `EmptyState`.
 */

import type { ReactNode } from 'react';

import {
  BarChart,
  ColumnChart,
  PieChart,
  SignalBars,
} from '../../components/charts';
import { EmptyState } from '../../components/ui';
import { C, FONT, MONO, SERIES, bandColors } from '../../lib/theme';

// ─── Plain-language signal labels ────────────────────────────────────────────
//
// Mirrors Vayu's `humanizeDriver` in spirit — copied, not imported, since that
// lives in a different app. Model signal names must never reach the UI raw.

function humanizeSignal(label: string): string {
  const key = label.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  const map: Record<string, string> = {
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
// Narrowed by hand from backend/dhanvantari-api/src/routes/assistant/index.ts
// — never a cast to `any`. A row missing what a chart needs degrades to the
// table rather than risk indexing an absent field.

interface StockRow {
  drug: string;
  qtyOnHand: number;
  reorderPoint: number;
  lowStock: boolean;
  expiryDate: string | null;
}

function isStockRow(v: unknown): v is StockRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.drug === 'string' && typeof r.qtyOnHand === 'number' && typeof r.reorderPoint === 'number';
}

interface ExpiringItem {
  drug: string;
  qtyOnHand: number;
  expiryDate: string | null;
  daysToExpiry: number | null;
}

interface StockExpiringData {
  valueAtRisk: number;
  items: ExpiringItem[];
}

function isStockExpiringData(v: unknown): v is StockExpiringData {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.valueAtRisk === 'number' && Array.isArray(r.items);
}

interface ConsumptionRow {
  drug: string;
  dispensed: number;
  prior: number;
  deltaPct: number | null;
}

function isConsumptionRow(v: unknown): v is ConsumptionRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.drug === 'string' && typeof r.dispensed === 'number' && typeof r.prior === 'number';
}

interface ReorderSignal {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
}

interface ReorderRow {
  drug: string;
  qtyOnHand: number;
  reorderPoint: number;
  score: number;
  band: string;
  confidence: string;
  signals: ReorderSignal[];
  source: string;
}

function isReorderRow(v: unknown): v is ReorderRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.drug === 'string' &&
    typeof r.qtyOnHand === 'number' &&
    typeof r.score === 'number' &&
    typeof r.band === 'string' &&
    Array.isArray(r.signals)
  );
}

interface DelayedShipmentRow {
  shipmentId: string;
  status: string;
  etaAt: string | null;
  daysLate: number | null;
  coldChain: boolean;
  anomalyFlag: boolean;
}

function isDelayedShipmentRow(v: unknown): v is DelayedShipmentRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.shipmentId === 'string' && typeof r.status === 'string' && 'daysLate' in r;
}

interface EtaRow {
  shipmentId: string;
  status: string;
  etaAt: string | null;
  progressPct: number | null;
  coldChain: boolean;
}

function isEtaRow(v: unknown): v is EtaRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.shipmentId === 'string' && typeof r.status === 'string' && 'progressPct' in r;
}

interface ColdchainStatusRow {
  shipmentId: string;
  status: string;
  lastTempC: number | null;
  anomalyFlag: boolean;
  etaAt: string | null;
}

function isColdchainStatusRow(v: unknown): v is ColdchainStatusRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.shipmentId === 'string' && 'anomalyFlag' in r && 'lastTempC' in r;
}

interface ComplaintRow {
  complaintId: string;
  category: string;
  status: string | null;
  filedAt: string;
  rcaSummary: string | null;
  photos: number;
}

function isComplaintRow(v: unknown): v is ComplaintRow {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.complaintId === 'string' && typeof r.category === 'string';
}

interface SupplierScoreData {
  supplierId?: string;
  onTimePct: number | null;
  rejectionRatePct: number | null;
  excursionRate?: number | null;
  priceVariancePct?: number | null;
  shortfallPct?: number | null;
}

function isSupplierScoreData(v: unknown): v is SupplierScoreData {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return 'onTimePct' in r && 'rejectionRatePct' in r;
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

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

function StockLevelChart({ rows }: { rows: StockRow[] }) {
  const top = [...rows].sort((a, b) => a.qtyOnHand - b.qtyOnHand).slice(0, 10);
  return (
    <ChartFrame label={`Stock on hand, ${top.length} lowest shown`}>
      <BarChart
        data={top.map((r) => ({ label: r.drug, value: r.qtyOnHand, color: r.lowStock ? C.amber : C.accent }))}
        labelWidth={170}
      />
    </ChartFrame>
  );
}

function StockExpiringChart({ data }: { data: StockExpiringData }) {
  const withDays = data.items.filter((i) => i.daysToExpiry != null).slice(0, 10);
  if (withDays.length === 0) return <EvidenceTable data={data.items} />;
  return (
    <ChartFrame label={`Days to expiry, ${withDays.length} item(s), value at risk ₹${Math.round(data.valueAtRisk).toLocaleString('en-IN')}`}>
      <BarChart
        data={withDays.map((i) => ({
          label: i.drug,
          value: i.daysToExpiry as number,
          color: (i.daysToExpiry as number) <= 14 ? C.red : (i.daysToExpiry as number) <= 30 ? C.amber : C.green,
        }))}
        labelWidth={170}
        valueFormat={(v) => `${Math.round(v)}d`}
      />
    </ChartFrame>
  );
}

function ConsumptionChart({ rows }: { rows: ConsumptionRow[] }) {
  const top = rows.slice(0, 10);
  return (
    <ChartFrame label={`Dispensed in the last 30 days, top ${top.length}`}>
      <BarChart
        data={top.map((r, i) => ({ label: r.drug, value: r.dispensed, color: SERIES[i % SERIES.length] }))}
        labelWidth={170}
      />
    </ChartFrame>
  );
}

function ReorderChart({ rows }: { rows: ReorderRow[] }) {
  const top = rows.slice(0, 8);
  const bars = top.map((r) => ({ label: r.drug, value: r.score, color: bandColors(r.band.toUpperCase()).color }));
  const first = top[0];
  const signals =
    first?.signals.map((s) => {
      const pct = s.weight !== 0 ? Math.max(0, Math.min(100, (s.contribution / s.weight) * 100)) : 0;
      const sc = pct >= 66 ? C.red : pct >= 40 ? C.amber : C.green;
      return { label: humanizeSignal(s.name), value: s.value.toFixed(2), pct, color: sc, note: s.explanation };
    }) ?? [];

  return (
    <>
      <ChartFrame label={`Reorder urgency score, top ${top.length}`}>
        <BarChart data={bars} labelWidth={170} valueFormat={(v) => v.toFixed(2)} />
      </ChartFrame>
      {first && (
        <ChartFrame label={`Signals · ${first.drug}`}>
          <SignalBars signals={signals} />
        </ChartFrame>
      )}
    </>
  );
}

function DelayedChart({ rows }: { rows: DelayedShipmentRow[] }) {
  const withDays = rows.filter((r) => r.daysLate != null).slice(0, 10);
  if (withDays.length === 0) return <EvidenceTable data={rows} />;
  return (
    <ChartFrame label={`Days late, ${withDays.length} shipment(s)`}>
      <BarChart
        data={withDays.map((r) => ({
          label: r.shipmentId,
          value: r.daysLate as number,
          color: (r.daysLate as number) >= 3 ? C.red : C.amber,
        }))}
        labelWidth={140}
        valueFormat={(v) => `${Math.round(v)}d`}
      />
    </ChartFrame>
  );
}

function EtaChart({ rows }: { rows: EtaRow[] }) {
  const withProgress = rows.filter((r) => r.progressPct != null).slice(0, 8);
  if (withProgress.length === 0) return <EvidenceTable data={rows} />;
  return (
    <ChartFrame label={`In-transit progress, ${withProgress.length} shipment(s)`}>
      <BarChart
        data={withProgress.map((r) => ({ label: r.shipmentId, value: r.progressPct as number, color: C.accent }))}
        labelWidth={140}
        valueFormat={(v) => `${Math.round(v)}%`}
      />
    </ChartFrame>
  );
}

function ColdchainStatusChart({ rows }: { rows: ColdchainStatusRow[] }) {
  const breached = rows.filter((r) => r.anomalyFlag).length;
  const ok = rows.length - breached;
  const pieData = [
    { label: 'In band', value: ok, color: C.green },
    { label: 'Breached', value: breached, color: C.red },
  ];
  return (
    <ChartFrame label={`Cold-chain shipments, in band vs breached`}>
      <PieChart data={pieData} centre={String(rows.length)} />
    </ChartFrame>
  );
}

function ComplaintChart({ rows }: { rows: ComplaintRow[] }) {
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  const bars = [...byCategory.entries()].map(([label, count], i) => ({
    label,
    count,
    color: SERIES[i % SERIES.length],
  }));
  if (bars.length === 0) {
    return <EmptyState glyph="◇" title="No complaints" hint="Nothing filed against this institution yet." height={140} />;
  }
  return (
    <ChartFrame label={`Complaints by category, ${rows.length} filed`}>
      <ColumnChart bars={bars} height={130} />
    </ChartFrame>
  );
}

function SupplierScoreChart({ data }: { data: SupplierScoreData }) {
  const bars: Array<{ label: string; value: number; color: string }> = [];
  if (data.onTimePct != null) bars.push({ label: 'On-time %', value: data.onTimePct, color: C.green });
  if (data.rejectionRatePct != null) bars.push({ label: 'Rejection %', value: data.rejectionRatePct, color: C.red });
  if (data.excursionRate != null) bars.push({ label: 'Excursion rate', value: data.excursionRate, color: C.amber });
  if (data.priceVariancePct != null) bars.push({ label: 'Price variance %', value: data.priceVariancePct, color: C.accent });
  if (data.shortfallPct != null) bars.push({ label: 'Shortfall %', value: data.shortfallPct, color: C.blue });
  if (bars.length === 0) return <EvidenceTable data={data} />;
  return (
    <ChartFrame label="Supplier scorecard">
      <BarChart data={bars} labelWidth={150} valueFormat={(v) => `${v.toFixed(1)}%`} />
    </ChartFrame>
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
    case 'stock.level': {
      if (Array.isArray(data) && data.length > 0 && data.every(isStockRow)) {
        return <StockLevelChart rows={data} />;
      }
      break;
    }
    case 'stock.expiring': {
      if (isStockExpiringData(data)) {
        return <StockExpiringChart data={data} />;
      }
      break;
    }
    case 'consumption.trend': {
      if (Array.isArray(data) && data.length > 0 && data.every(isConsumptionRow)) {
        return <ConsumptionChart rows={data} />;
      }
      break;
    }
    case 'reorder.suggest': {
      if (Array.isArray(data) && data.length > 0 && data.every(isReorderRow)) {
        return <ReorderChart rows={data} />;
      }
      break;
    }
    case 'shipment.delayed': {
      if (Array.isArray(data) && data.length > 0 && data.every(isDelayedShipmentRow)) {
        return <DelayedChart rows={data} />;
      }
      break;
    }
    case 'shipment.eta':
    case 'order.status': {
      if (Array.isArray(data) && data.length > 0 && data.every(isEtaRow)) {
        return <EtaChart rows={data} />;
      }
      break;
    }
    case 'coldchain.status': {
      if (Array.isArray(data) && data.length > 0 && data.every(isColdchainStatusRow)) {
        return <ColdchainStatusChart rows={data} />;
      }
      break;
    }
    case 'complaint.list':
    case 'complaint.status': {
      if (Array.isArray(data) && data.length > 0 && data.every(isComplaintRow)) {
        return <ComplaintChart rows={data} />;
      }
      break;
    }
    case 'supplier.score': {
      if (isSupplierScoreData(data)) {
        return <SupplierScoreChart data={data} />;
      }
      break;
    }
    default:
      break;
  }

  // Shape didn't match (or drug.info / out_of_scope) — degrade to the table
  // rather than risk a broken chart indexing into an absent field.
  return <EvidenceTable data={data} />;
}
