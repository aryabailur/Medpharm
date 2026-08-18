'use client';

/**
 * Supplier Scorecard — the institution's own view of its supplier's delivery
 * performance, computed by dhanvantari-api from shipments/batches/complaints
 * this institution actually observed.
 */

import { useEffect, useState } from 'react';

import { getScorecard, type SupplierScorecard } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, PageHeader } from '../../components/ui';
import { Donut, Meter } from '../../components/charts';

function onTimeColor(pct: number | null): string {
  if (pct == null) return C.grey;
  if (pct >= 90) return C.green;
  if (pct >= 75) return C.amber;
  return C.red;
}

function inverseColor(pct: number | null): string {
  if (pct == null) return C.grey;
  if (pct <= 5) return C.green;
  if (pct <= 15) return C.amber;
  return C.red;
}

/**
 * Field names as the API actually returns them — `delivered` and `withEta`,
 * not the `shipments*` prefixes assumed earlier, which fell through to the raw
 * camelCase key.
 */
const BASIS_LABELS: Record<string, string> = {
  shipmentsObserved: 'Shipments observed',
  delivered: 'Delivered',
  withEta: 'With an ETA',
  batchesScanned: 'Batches scanned',
  complaintsFiled: 'Complaints filed',
  shipmentsWithExcursion: 'Shipments with an excursion',
};

export default function Scorecard() {
  const [data, setData] = useState<SupplierScorecard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getScorecard();
        setData(res);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const m = data?.metrics;
  const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);

  /**
   * The four headline rates, each on its own 0–100 rail.
   *
   * Deliberately NOT a pie: on-time, rejection, excursion and shortfall are
   * four independent rates measured against different denominators, so they
   * don't partition a whole and their sum (109.4% here) is meaningless. Each
   * gets its own meter, and `good` says which direction is healthy.
   */
  const rates = m
    ? [
        { label: 'On-time delivery', pct: m.onTimePct ?? 0, good: 'high' as const },
        { label: 'Rejection rate', pct: m.rejectionRatePct ?? 0, good: 'low' as const },
        { label: 'Excursion rate', pct: m.excursionRate ?? 0, good: 'low' as const },
        { label: 'Shortfall', pct: m.shortfallPct ?? 0, good: 'low' as const },
      ]
    : [];

  /**
   * Shipment outcomes, which DO partition the observed set — every observed
   * shipment is either clean, excursion-hit or complained about. The raw
   * `basis` counts can't share one bar scale (11 shipments vs 2 complaints
   * measure different things), so only the shipment-level split is charted.
   */
  const b = data?.basis;
  const outcomeSlices = b
    ? (() => {
        const observed = b.shipmentsObserved ?? 0;
        const excursion = b.shipmentsWithExcursion ?? 0;
        const complained = Math.min(b.complaintsFiled ?? 0, Math.max(0, observed - excursion));
        const clean = Math.max(0, observed - excursion - complained);
        return [
          { label: 'Clean', value: clean, color: C.green },
          { label: 'Excursion', value: excursion, color: C.amber },
          { label: 'Complaint filed', value: complained, color: C.red },
        ].filter((s) => s.value > 0);
      })()
    : [];

  return (
    <>
      <PageHeader title="Supplier Scorecard" />

      <div style={{ padding: '18px 26px 0' }}>
        <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint }}>
          PS-SS04 asks for vendor activity tracking. This is the institution&rsquo;s view of its supplier; Vayu
          holds the mirror image.
        </div>
      </div>

      {error && (
        <div style={{ padding: 26 }}>
          <ApiError error={error} />
        </div>
      )}

      {!error && (
        <>
          <KpiBand columns={4}>
            <Kpi label="On-time %" value={fmtPct(m?.onTimePct)} deltaColor={onTimeColor(m?.onTimePct ?? null)} />
            <Kpi label="Rejection %" value={fmtPct(m?.rejectionRatePct)} deltaColor={inverseColor(m?.rejectionRatePct ?? null)} />
            <Kpi label="Excursion rate %" value={fmtPct(m?.excursionRate)} deltaColor={inverseColor(m?.excursionRate ?? null)} />
            <Kpi label="Shortfall %" value={fmtPct(m?.shortfallPct)} deltaColor={inverseColor(m?.shortfallPct ?? null)} />
          </KpiBand>

          <div style={{ padding: 26, display: 'grid', gap: 18 }}>
            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <Card style={{ animation: rise(0) }}>
                <CardTitle>Performance breakdown</CardTitle>
                <div style={{ padding: '18px 18px 20px', display: 'grid', gap: 16 }}>
                  {rates.length === 0 ? (
                    <Empty>No metrics yet.</Empty>
                  ) : (
                    rates.map((r) => {
                      const color =
                        r.good === 'high' ? onTimeColor(r.pct) : inverseColor(r.pct);
                      return (
                        <div key={r.label}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                            }}
                          >
                            <span style={{ font: `500 12px/1.35 ${FONT}`, color: C.ink }}>
                              {r.label}
                            </span>
                            <span style={{ font: `600 13px/1 ${MONO}`, color }}>
                              {r.pct.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <Meter pct={r.pct} color={color} width="full" thickness={4} />
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div
                    style={{
                      font: `400 11px/1.6 ${FONT}`,
                      color: C.inkGhost,
                      borderTop: `1px solid ${C.borderSoft}`,
                      paddingTop: 11,
                    }}
                  >
                    Four independent rates, each against its own denominator — they
                    describe different things rather than shares of one total.
                  </div>
                </div>
              </Card>

              <Card style={{ animation: rise(60) }}>
                <CardTitle>Shipment outcomes</CardTitle>
                <div style={{ padding: 18 }}>
                  {outcomeSlices.length === 0 ? (
                    <Empty>No shipments observed yet.</Empty>
                  ) : (
                    <Donut
                      segments={outcomeSlices.map((s) => ({
                        label: s.label,
                        count: s.value,
                        color: s.color,
                      }))}
                      totalLabel="SHIPMENTS"
                    />
                  )}
                </div>
              </Card>
            </div>

            <Card style={{ animation: rise(100) }}>
              <CardTitle>Observation basis</CardTitle>
              {b ? (
                <div>
                  {Object.entries(b).map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 18px',
                        borderBottom: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <span style={{ font: `400 13px/1.5 ${FONT}`, color: C.inkMuted }}>
                        {BASIS_LABELS[key] ?? key}
                      </span>
                      <span
                        style={{
                          font: `500 14px/1.4 ${MONO}`,
                          color: C.ink,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No basis data.</Empty>
              )}
              {data?.note && (
                <div style={{ padding: '12px 18px 16px', font: `400 12px/1.7 ${FONT}`, color: C.inkFaint }}>
                  {data.note}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
