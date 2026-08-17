'use client';

/**
 * Supplier Scorecard — the institution's own view of its supplier's delivery
 * performance, computed by dhanvantari-api from shipments/batches/complaints
 * this institution actually observed.
 */

import { useEffect, useState } from 'react';

import { getScorecard, type SupplierScorecard } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Kpi, KpiBand, PageHeader } from '../../components/ui';

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

const BASIS_LABELS: Record<string, string> = {
  shipmentsObserved: 'Shipments observed',
  shipmentsDelivered: 'Delivered',
  shipmentsWithEta: 'With ETA',
  batchesScanned: 'Batches scanned',
  complaintsFiled: 'Complaints filed',
  shipmentsWithExcursion: 'Shipments with excursion',
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
            <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
              <CardTitle>Basis</CardTitle>
              {data?.basis ? (
                <div>
                  {Object.entries(data.basis).map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 16px',
                        borderBottom: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <span style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkMuted }}>
                        {BASIS_LABELS[key] ?? key}
                      </span>
                      <span style={{ font: `500 12px/1.4 ${MONO}`, color: C.ink }}>{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '30px 14px', textAlign: 'center', font: `400 12px/1.6 ${FONT}`, color: C.inkGhost }}>
                  No basis data.
                </div>
              )}
              {data?.note && (
                <div style={{ padding: '10px 16px 14px', font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
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
