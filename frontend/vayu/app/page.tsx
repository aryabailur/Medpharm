/**
 * Control — network overview for the supplier terminal.
 *
 * Every figure is computed from a live vayu-api response. Nothing here is
 * hardcoded: an empty database renders zeros and <Empty>, not invented rows.
 */

import Link from 'next/link';

import {
  getAnalyticsSummary,
  getComplaints,
  getOrders,
  getShipments,
  type AnalyticsSummary,
  type Complaint,
  type Shipment,
  type SupplyOrder,
} from '../lib/api';
import { C, FONT, MONO } from '../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Meter, Mono, PageHeader, Pill } from '../components/ui';

export const dynamic = 'force-dynamic';

export default async function Control() {
  let orders: SupplyOrder[] = [];
  let shipments: Shipment[] = [];
  let complaints: Complaint[] = [];
  let summary: AnalyticsSummary | null = null;
  let error: string | null = null;

  try {
    const [o, s, c, sum] = await Promise.all([
      getOrders('?status=PENDING&take=100'),
      getShipments('?take=100'),
      getComplaints('?take=100'),
      getAnalyticsSummary(),
    ]);
    orders = o.items;
    shipments = s.items;
    complaints = c.items;
    summary = sum;
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <>
        <PageHeader title="Plant Control" />
        <div style={{ padding: 26 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  const inFlight = shipments.filter((s) =>
    ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status),
  );
  const openComplaints = complaints.filter((c) => c.status !== 'RESOLVED');
  const oldest = orders.reduce<SupplyOrder | null>(
    (a, b) => (!a || (b.ageHours ?? 0) > (a.ageHours ?? 0) ? b : a),
    null,
  );

  return (
    <>
      <PageHeader title="Plant Control" />

      <KpiBand columns={5}>
        <Kpi
            label="Pending approval"
            value={orders.length}
            delta={oldest ? `oldest ${oldest.ageHours}h` : undefined}
            deltaColor={(oldest?.ageHours ?? 0) >= 4 ? C.amber : C.grey}
            note={oldest ? oldest.institution?.name ?? 'Unknown institution' : 'Queue is clear'}
          />
          <Kpi
            label="Shipments in flight"
            value={inFlight.length}
            note={`${shipments.length} total on record`}
          />
          <Kpi
            label="Open complaints"
            value={openComplaints.length}
            deltaColor={C.amber}
            note={`${complaints.length} total filed`}
          />
          <Kpi
            label="Ledger rows"
            value={summary ? summary.ledgerRows.toLocaleString('en-IN') : '—'}
            note={
              summary?.horizon.from && summary.horizon.to
                ? `${new Date(summary.horizon.from).toLocaleDateString('en-GB')} – ${new Date(
                    summary.horizon.to,
                  ).toLocaleDateString('en-GB')}`
                : 'No horizon data'
            }
          />
          <Kpi
            label="Institutions"
            value={summary ? summary.institutions : '—'}
            note={summary ? `${summary.facilities} facilities + ${summary.warehouses} warehouses` : undefined}
          />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
          <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
            <CardTitle right={<Link href="/orders" style={{ font: `600 12px/1 ${FONT}`, color: C.accent, textDecoration: 'none' }}>Open queue →</Link>}>
              Awaiting approval
            </CardTitle>
            {orders.length === 0 ? (
              <Empty>No orders awaiting approval.</Empty>
            ) : (
              <div>
                {orders.slice(0, 6).map((o) => (
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
                        {o.institution?.name ?? 'Unknown institution'} · {o.lines.length} line
                        {o.lines.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div
                      style={{
                        font: `500 11px/1.2 ${MONO}`,
                        color: (o.ageHours ?? 0) >= 4 ? C.amber : C.inkGhost,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {o.ageHours}h old
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle right={<Link href="/telemetry" style={{ font: `600 12px/1 ${FONT}`, color: C.accent, textDecoration: 'none' }}>Console →</Link>}>
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
                      gap: 12,
                      padding: '11px 16px',
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <Mono>{s.id.slice(0, 8)}</Mono>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Meter pct={(s.progressPct ?? 0) * 100} />
                      <span
                        style={{
                          font: `600 11px/1 ${MONO}`,
                          color: s.coldChain ? C.accent : C.inkGhost,
                          minWidth: 56,
                          textAlign: 'right',
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
