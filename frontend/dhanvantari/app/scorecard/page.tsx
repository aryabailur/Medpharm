'use client';

/**
 * Supplier Scorecard — the institution's own view of its supplier's delivery
 * performance, computed by dhanvantari-api from shipments/batches/complaints
 * this institution actually observed.
 *
 * dhanvantari-api's /api/supplier-scorecard returns metrics for this
 * institution's one active supplier relationship, not a league table — the
 * table below has exactly the rows the API gives us, never invented peers.
 */

import { useEffect, useState } from 'react';

import { getScorecard, type SupplierScorecard } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader } from '../../components/ui';
import { Meter } from '../../components/charts';

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
  const deliveries = data?.basis?.shipmentsObserved ?? data?.basis?.shipmentsDelivered ?? null;

  return (
    <>
      <PageHeader title="Supplier Scorecard" />

      {error && (
        <div style={{ padding: 26 }}>
          <ApiError error={error} service="dhanvantari-api" />
        </div>
      )}

      {!error && (
        <>
          <KpiBand columns={4}>
            <Kpi label="On-time delivery" value={fmtPct(m?.onTimePct)} deltaColor={onTimeColor(m?.onTimePct ?? null)} note={deliveries != null ? `Across ${deliveries} deliveries this quarter` : undefined} />
            <Kpi label="Rejection rate" value={fmtPct(m?.rejectionRatePct)} deltaColor={inverseColor(m?.rejectionRatePct ?? null)} />
            <Kpi label="Excursion rate" value={fmtPct(m?.excursionRate)} deltaColor={inverseColor(m?.excursionRate ?? null)} />
            <Kpi label="Avg response" value={fmtPct(m?.shortfallPct)} deltaColor={C.blue} note="Complaint to first manufacturer reply" />
          </KpiBand>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, padding: '26px 26px 52px' }}>
            <Card style={{ animation: rise(0) }}>
              <CardTitle>Supplier scorecard</CardTitle>
              {!data ? (
                <Empty>No scorecard data.</Empty>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Supplier', 'On-time', 'Rejection', 'Excursion rate', 'Price variance', 'Deliveries'].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: h === 'Supplier' ? 'left' : 'right',
                            font: `600 11px/1 ${FONT}`,
                            letterSpacing: '.13em',
                            textTransform: 'uppercase',
                            color: C.inkSoft,
                            padding: '14px 18px',
                            borderBottom: `1px solid ${C.border}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                        <div style={{ font: `500 14px/1.4 ${FONT}`, color: C.ink }}>{data.supplier.name}</div>
                        <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 3 }}>{data.note}</div>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right', verticalAlign: 'top' }}>
                        <div style={{ font: `500 14px/1.4 ${MONO}`, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(m?.onTimePct)}
                        </div>
                        <div style={{ marginLeft: 'auto', marginTop: 7 }}>
                          <Meter pct={m?.onTimePct ?? 0} width={70} thickness={3} color={onTimeColor(m?.onTimePct ?? null)} />
                        </div>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right', verticalAlign: 'top' }}>
                        <Mono color={inverseColor(m?.rejectionRatePct ?? null)}>{fmtPct(m?.rejectionRatePct)}</Mono>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right', verticalAlign: 'top' }}>
                        <Mono color={inverseColor(m?.excursionRate ?? null)}>{fmtPct(m?.excursionRate)}</Mono>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right', verticalAlign: 'top' }}>
                        <Mono>{fmtPct(m?.shortfallPct)}</Mono>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right', verticalAlign: 'top' }}>
                        <Mono>{deliveries ?? '—'}</Mono>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Card>

            <Card style={{ borderLeft: `2px solid ${C.ink}`, alignSelf: 'start', animation: rise(60) }}>
              <CardTitle>Nidana · read</CardTitle>
              <div style={{ padding: 18 }}>
                {!data || m == null ? (
                  <Empty>No supplier data yet.</Empty>
                ) : (
                  <>
                    <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted }}>
                      {data.supplier.name}&rsquo;s cold-chain performance on this institution&rsquo;s freight is{' '}
                      {m.excursionRate != null && m.excursionRate > 10
                        ? `deteriorating: an excursion rate of ${fmtPct(m.excursionRate)}`
                        : `holding at an excursion rate of ${fmtPct(m.excursionRate)}`}
                      {m.onTimePct != null && ` against an on-time delivery rate of ${fmtPct(m.onTimePct)}`}.
                    </div>
                    <div
                      style={{
                        marginTop: 14,
                        borderTop: `1px solid ${C.borderSoft}`,
                        paddingTop: 12,
                      }}
                    >
                      <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                        Recommended action
                      </div>
                      <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted, marginTop: 8 }}>
                        {m.excursionRate != null && m.excursionRate > 10
                          ? 'Ask for a different reefer on cold-chain dispatches, or shift sensitive orders to a morning slot.'
                          : 'No corrective action needed at the current rate — keep monitoring excursions on inbound freight.'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
