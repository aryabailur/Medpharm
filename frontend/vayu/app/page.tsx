/**
 * Overview — KPIs and at-a-glance queues.
 *
 * Every figure is computed from a live vayu-api response. Nothing here is
 * hardcoded: an empty database renders zeros, not invented numbers.
 */

import Link from 'next/link';

import { getComplaints, getOrders, getShipments, type Complaint, type Shipment, type SupplyOrder } from '../lib/api';
import { C, FONT, MONO } from '../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, Mono, PageHeader, Pill } from '../components/ui';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  let orders: SupplyOrder[] = [];
  let shipments: Shipment[] = [];
  let complaints: Complaint[] = [];
  let error: string | null = null;

  try {
    const [o, s, c] = await Promise.all([
      getOrders('?status=PENDING&take=100'),
      getShipments('?take=100'),
      getComplaints('?take=100'),
    ]);
    orders = o.items;
    shipments = s.items;
    complaints = c.items;
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <>
        <PageHeader title="Overview" subtitle="Manufacturer / supplier" />
        <div style={{ padding: 28 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  const inFlight = shipments.filter((s) =>
    ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status),
  );
  const coldInFlight = inFlight.filter((s) => s.coldChain);
  const withExcursion = shipments.filter((s) => s.excursionCount > 0);
  const openComplaints = complaints.filter((c) => c.status !== 'RESOLVED');
  const oldest = orders.reduce<SupplyOrder | null>(
    (a, b) => (!a || (b.ageHours ?? 0) > (a.ageHours ?? 0) ? b : a),
    null,
  );
  const delivered = shipments.filter((s) => s.status === 'DELIVERED');
  const onTime = delivered.filter((s) => !s.etaAt || !s.deliveredAt || s.deliveredAt <= s.etaAt);
  const onTimePct = delivered.length
    ? Math.round((onTime.length / delivered.length) * 100)
    : null;

  return (
    <>
      <PageHeader title="Overview" subtitle="Manufacturer / supplier" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi
            label="Pending approval"
            value={orders.length}
            delta={oldest ? `oldest ${oldest.ageHours}h` : undefined}
            deltaColor={(oldest?.ageHours ?? 0) >= 4 ? C.amber : C.grey}
            note={oldest ? `${oldest.institution?.name ?? 'Unknown'}` : 'Queue is clear'}
          />
          <Kpi
            label="Shipments in flight"
            value={inFlight.length}
            delta={coldInFlight.length ? `${coldInFlight.length} cold chain` : undefined}
            deltaColor={C.blue}
            note={
              withExcursion.length
                ? `${withExcursion.length} carrying an excursion`
                : 'No excursions on record'
            }
          />
          <Kpi
            label="Open complaints"
            value={openComplaints.length}
            delta={openComplaints.length ? `${complaints.length} total` : undefined}
            deltaColor={C.amber}
            note={`${complaints.filter((c) => c.status === 'INVESTIGATING').length} under investigation`}
          />
          <Kpi
            label="On-time delivery"
            value={onTimePct === null ? '—' : `${onTimePct}%`}
            deltaColor={C.green}
            note={delivered.length ? `${delivered.length} delivered` : 'No deliveries yet'}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
          <Card>
            <CardTitle right={<Link href="/orders" style={{ font: `600 12px/1 ${FONT}` }}>Open queue →</Link>}>
              Awaiting approval
            </CardTitle>
            {orders.length === 0 ? (
              <Empty>No orders awaiting approval.</Empty>
            ) : (
              <div>
                {orders.slice(0, 5).map((o) => (
                  <div
                    key={o.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Mono>{o.id.slice(0, 8)}</Mono>
                        <Pill label={o.status} />
                      </div>
                      <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 3 }}>
                        {o.institution?.name} · {o.lines.length} line
                        {o.lines.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div style={{ font: `500 11px/1.2 ${MONO}`, color: C.inkGhost, whiteSpace: 'nowrap' }}>
                      {o.ageHours}h old
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle right={<Link href="/telemetry" style={{ font: `600 12px/1 ${FONT}` }}>Console →</Link>}>
              In flight
            </CardTitle>
            {inFlight.length === 0 ? (
              <Empty>Nothing in transit.</Empty>
            ) : (
              <div>
                {inFlight.slice(0, 6).map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '11px 16px',
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <Mono>{s.id.slice(0, 8)}</Mono>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkFaint }}>
                        {s.progressPct != null ? `${Math.round(s.progressPct * 100)}%` : '—'}
                      </span>
                      <span
                        style={{
                          font: `600 11px/1 ${MONO}`,
                          color: s.coldChain ? C.blue : C.grey,
                        }}
                      >
                        {s.lastTempC != null ? `${s.lastTempC.toFixed(1)} °C` : 'ambient'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
