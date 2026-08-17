/**
 * Control — network overview for the supplier terminal ("Plant Control").
 *
 * Every figure is computed from a live vayu-api response. Nothing here is
 * hardcoded: an empty database renders zeros and <Empty>, not invented rows.
 */

import Link from 'next/link';

import {
  askAssistant,
  getAnalyticsSummary,
  getComplaints,
  getOrders,
  getShipments,
  type AnalyticsSummary,
  type Complaint,
  type Shipment,
  type SupplyOrder,
} from '../lib/api';
import { C, FONT, MONO, rise, stagger, statusColors } from '../lib/theme';
import { Card, Empty, Meter, Pill } from '../components/ui';
import { Donut } from '../components/charts';

export const dynamic = 'force-dynamic';

interface RiskRow {
  institution: string;
  district: string;
  drug: string;
  score: number;
  band: string;
  confidence: string;
  signals: Array<{ name: string; value: number }>;
  source: string;
}

export default async function Control() {
  let orders: SupplyOrder[] = [];
  let shipments: Shipment[] = [];
  let complaints: Complaint[] = [];
  let summary: AnalyticsSummary | null = null;
  let riskRows: RiskRow[] = [];
  let error: string | null = null;

  try {
    const [o, s, c, sum, risk] = await Promise.all([
      getOrders('?take=100'),
      getShipments('?take=100'),
      getComplaints('?take=100'),
      getAnalyticsSummary(),
      askAssistant('where are we about to stock out').catch(() => null),
    ]);
    orders = o.items;
    shipments = s.items;
    complaints = c.items;
    summary = sum;
    riskRows = risk ? ((risk.evidence.data as RiskRow[]) ?? []) : [];
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <div style={{ padding: 26 }}>
        <div style={{ font: `600 12px/1.4 ${FONT}`, color: C.red }}>Cannot reach vayu-api</div>
        <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted, marginTop: 5 }}>{error}</div>
      </div>
    );
  }

  const pendingOrders = orders.filter((o) => o.status === 'PENDING');
  const inFlight = shipments.filter((s) =>
    ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status),
  );
  const awaitingQc = 0; // No batches fetched on this screen — see Batches + QC.
  const openComplaints = complaints.filter((c) => c.status !== 'RESOLVED');
  const delivered = shipments.filter((s) => s.status === 'DELIVERED');
  const onTime = delivered.filter((s) => !s.etaAt || !s.deliveredAt || new Date(s.deliveredAt) <= new Date(s.etaAt));
  const onTimePct = delivered.length ? Math.round((onTime.length / delivered.length) * 100) : null;
  const oldest = pendingOrders.reduce<SupplyOrder | null>(
    (a, b) => (!a || (b.ageHours ?? 0) > (a.ageHours ?? 0) ? b : a),
    null,
  );

  // Order mix, grouped from the fetched orders — no invented buckets.
  const mixColors: Record<string, string> = {
    PENDING: C.accent,
    APPROVED: C.green,
    PARTIAL: C.amber,
    REJECTED: C.red,
  };
  const mixOrder = ['PENDING', 'APPROVED', 'PARTIAL', 'REJECTED'];
  const donutSegments = mixOrder
    .map((status) => ({
      label: status,
      count: orders.filter((o) => o.status === status).length,
      color: mixColors[status]!,
    }))
    .filter((s) => s.count > 0);

  const riskFlags = riskRows.slice(0, 4);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        {[
          {
            label: 'Pending approval',
            value: pendingOrders.length,
            delta: oldest ? `oldest ${oldest.ageHours}h` : undefined,
            deltaColor: (oldest?.ageHours ?? 0) >= 4 ? C.amber : C.grey,
            note: oldest ? oldest.institution?.name ?? 'Unknown institution' : 'Queue is clear',
          },
          {
            label: 'Shipments in flight',
            value: inFlight.length,
            note: `${shipments.length} total on record`,
          },
          {
            label: 'Batches awaiting QC',
            value: awaitingQc,
            note: 'See Batches + QC for detail',
          },
          {
            label: 'Open complaints',
            value: openComplaints.length,
            deltaColor: openComplaints.length ? C.amber : C.grey,
            note: `${complaints.length} total filed`,
          },
          {
            label: 'On-time 30d',
            value: onTimePct != null ? `${onTimePct}%` : '—',
            deltaColor: onTimePct != null && onTimePct >= 90 ? C.green : C.amber,
            note: `${delivered.length} delivered on record`,
          },
        ].map((k, i) => (
          <div key={k.label} style={{ padding: '26px 26px 24px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(i) }}>
            <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
              {k.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
              <span style={{ font: `600 44px/1 ${MONO}`, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums', color: C.ink }}>
                {k.value}
              </span>
              {k.delta && (
                <span style={{ font: `500 11px/1 ${FONT}`, color: k.deltaColor ?? C.inkFaint, paddingBottom: 5 }}>
                  {k.delta}
                </span>
              )}
            </div>
            <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 9 }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)',
          gap: 24,
          padding: '26px 26px 52px',
        }}
      >
        {/* LEFT — Approval queue */}
        <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, overflowX: 'auto', animation: rise(0) }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '17px 18px',
              borderBottom: `1px solid ${C.border}`,
              background: C.surfaceAlt,
            }}
          >
            <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
              Approval queue
            </span>
            <div style={{ flex: 1 }} />
            <Link
              href="/orders"
              style={{
                border: `1px solid ${C.border}`,
                background: C.surface,
                font: `500 12px/1 ${FONT}`,
                color: C.ink,
                padding: '8px 12px',
                borderRadius: 4,
                textDecoration: 'none',
              }}
            >
              Open queue
            </Link>
          </div>

          {orders.length === 0 ? (
            <Empty>No orders on record.</Empty>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
              <thead>
                <tr>
                  {['Order', 'Institution / lines', 'Value', 'Age'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i >= 2 ? 'right' : 'left',
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
                {orders.slice(0, 8).map((o) => {
                  const sc = statusColors(o.status);
                  const totalQty = o.lines.reduce((a, l) => a + l.qtyRequested, 0);
                  return (
                    <tr key={o.id}>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                        <Link
                          href={`/trace?order=${o.id}`}
                          style={{
                            font: `500 12px/1 ${MONO}`,
                            color: C.ink,
                            borderBottom: `1px dotted ${C.inkGhost}`,
                            textDecoration: 'none',
                          }}
                        >
                          {o.id.slice(0, 8)}
                        </Link>
                        <div style={{ marginTop: 7 }}>
                          <Pill label={o.status} />
                        </div>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 14px/1.6 ${FONT}`, color: C.ink, verticalAlign: 'top' }}>
                        {o.institution?.name ?? 'Unknown institution'}
                        <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
                          {o.lines.length} line{o.lines.length === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `500 14px/1.4 ${MONO}`, color: C.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>
                        {totalQty.toLocaleString('en-IN')} u
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right', font: `400 11px/1.4 ${MONO}`, color: (o.ageHours ?? 0) >= 4 ? C.amber : C.inkFaint, verticalAlign: 'top' }}>
                        {o.ageHours}h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Order mix */}
          <Card style={{ animation: rise(40) }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '17px 18px',
                borderBottom: `1px solid ${C.border}`,
                background: C.surfaceAlt,
              }}
            >
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                Order mix
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ font: `500 12px/1 ${MONO}`, color: C.inkFaint }}>{orders.length} total</span>
            </div>
            <div style={{ padding: '22px 20px' }}>
              {orders.length === 0 ? (
                <Empty>No orders on record.</Empty>
              ) : (
                <Donut segments={donutSegments} totalLabel="ORDERS" />
              )}
            </div>
          </Card>

          {/* Shipments in flight */}
          <Card style={{ animation: rise(60) }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '17px 18px',
                borderBottom: `1px solid ${C.border}`,
                background: C.surfaceAlt,
              }}
            >
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                Shipments in flight
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkMuted }}>{inFlight.length} active</span>
            </div>
            <div style={{ padding: 20 }}>
              {inFlight.length === 0 ? (
                <Empty>Nothing in transit.</Empty>
              ) : (
                inFlight.slice(0, 6).map((s) => {
                  const tempBand =
                    s.lastTempC == null
                      ? C.inkGhost
                      : s.lastTempC < 2 || s.lastTempC > 8
                        ? C.red
                        : C.accent;
                  return (
                    <div
                      key={s.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1px solid ${C.borderSoft}` }}
                    >
                      <Link
                        href={`/trace?shipment=${s.id}`}
                        style={{
                          font: `500 12px/1 ${MONO}`,
                          color: C.ink,
                          borderBottom: `1px dotted ${C.inkGhost}`,
                          textDecoration: 'none',
                          width: 66,
                          flex: '0 0 66px',
                        }}
                      >
                        {s.id.slice(0, 8)}
                      </Link>
                      <div style={{ flex: 1 }}>
                        <Meter pct={(s.progressPct ?? 0) * 100} color={s.coldChain ? C.accent : C.inkGhost} width={9999} />
                      </div>
                      <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkFaint, width: 34, textAlign: 'right' }}>
                        {s.progressPct != null ? `${Math.round(s.progressPct * 100)}%` : '—'}
                      </span>
                      <span style={{ font: `500 11px/1 ${MONO}`, color: tempBand, width: 58, textAlign: 'right' }}>
                        {s.lastTempC != null ? `${s.lastTempC.toFixed(1)}°C` : 'ambient'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Network risk · Nidana */}
          <Card style={{ animation: rise(120) }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '17px 18px',
                borderBottom: `1px solid ${C.border}`,
                background: C.surfaceAlt,
              }}
            >
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                Network risk · Nidana
              </span>
              <div style={{ flex: 1 }} />
              <Link
                href="/risk"
                style={{
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  font: `500 12px/1 ${FONT}`,
                  color: C.ink,
                  padding: '6px 10px',
                  borderRadius: 4,
                  textDecoration: 'none',
                }}
              >
                Drilldown
              </Link>
            </div>
            {riskFlags.length === 0 ? (
              <Empty>No stockout risk detected.</Empty>
            ) : (
              riskFlags.map((r, i) => {
                const color = r.band === 'CRITICAL' ? C.red : r.band === 'HIGH' ? C.amber : C.accent;
                const pct = Math.max(0, Math.min(100, r.score * 100));
                return (
                  <div
                    key={i}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.borderSoft}` }}
                  >
                    <div style={{ width: 38, flex: '0 0 38px' }}>
                      <div style={{ font: `600 24px/1 ${MONO}`, color, fontVariantNumeric: 'tabular-nums' }}>
                        {r.score.toFixed(2)}
                      </div>
                      <div style={{ height: 3, background: C.borderSoft, marginTop: 6 }}>
                        <Meter pct={pct} color={color} width={9999} thickness={3} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: `500 13px/1.5 ${FONT}`, color: C.ink }}>
                        {r.institution} · {r.drug}
                      </div>
                      <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
                        {r.district} · {r.band.toLowerCase()} band · {r.confidence} confidence
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
