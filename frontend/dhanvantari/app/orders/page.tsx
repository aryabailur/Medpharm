'use client';

/**
 * Supply Orders — every order this institution has placed with its supplier.
 *
 * The `syncStatus` column is easy to confuse with `deliveryStatus`: one says
 * whether our outbound order notification actually reached the supplier's
 * system, the other says what the supplier is doing about the order itself.
 * The note under the table exists because that distinction is invisible
 * otherwise.
 */

import { useEffect, useState } from 'react';

import { getDelayed, getOrders, type IncomingShipment, type OrderRow } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

const IN_TRANSIT = ['DISPATCHED', 'IN_TRANSIT'];

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

type DelayedShipment = IncomingShipment & { daysLate: number | null };

export default function Orders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [delayed, setDelayed] = useState<DelayedShipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ord, del] = await Promise.all([getOrders('?take=100'), getDelayed()]);
        setOrders(ord.items);
        setDelayed(del.items as DelayedShipment[]);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Supply Orders" />
        <div style={{ padding: 26 }}>
          <ApiError error={error} service="dhanvantari-api" />
        </div>
      </>
    );
  }

  const awaiting = orders.filter((o) => o.deliveryStatus == null).length;
  const inTransit = orders.filter((o) => o.deliveryStatus != null && IN_TRANSIT.includes(o.deliveryStatus)).length;

  return (
    <>
      <PageHeader title="Supply Orders" />

      <KpiBand columns={4}>
        <Kpi label="Orders placed" value={orders.length} />
        <Kpi label="Awaiting response" value={awaiting} deltaColor={C.amber} />
        <Kpi label="In transit" value={inTransit} deltaColor={C.accent} />
        <Kpi label="Delayed" value={delayed.length} deltaColor={C.red} delta={delayed.length > 0 ? 'past ETA' : undefined} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <CardTitle>Delayed</CardTitle>
          {delayed.length === 0 ? (
            <Empty>Nothing past its ETA.</Empty>
          ) : (
            <div>
              {delayed.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 16px',
                    borderBottom: `1px solid ${C.borderSoft}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mono>{s.id.slice(0, 12)}</Mono>
                    <Pill label={s.status} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost }}>
                      ETA {fmtDate(s.etaAt)}
                    </span>
                    <Mono color={C.red}>{s.daysLate ?? '—'}d late</Mono>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          {orders.length === 0 ? (
            <Empty>No supply orders placed yet.</Empty>
          ) : (
            <Table head={['Order', 'Placed', 'Lines', 'Delivery status', 'ETA', 'Sync']}>
              {orders.map((o, i) => (
                <tr key={o.supplyOrderId ?? i}>
                  <Td>
                    <Mono>{o.supplyOrderId ? o.supplyOrderId.slice(0, 8) : '—'}</Mono>
                  </Td>
                  <Td>{fmtDate(o.placedAt)}</Td>
                  <Td>
                    <div style={{ font: `500 13px/1.3 ${FONT}`, color: C.ink }}>{o.lines.length} line{o.lines.length === 1 ? '' : 's'}</div>
                    <div
                      style={{
                        font: `400 11px/1.5 ${MONO}`,
                        color: C.inkGhost,
                        marginTop: 2,
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {o.lines.map((l) => l.drugId.slice(0, 8)).join(', ')}
                    </div>
                  </Td>
                  <Td>
                    <Pill label={o.deliveryStatus ?? 'AWAITING'} />
                  </Td>
                  <Td>{fmtDate(o.etaAt)}</Td>
                  <Td>
                    <Pill label={o.syncStatus} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <div style={{ padding: '10px 14px 14px', font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
            Sync shows whether our outbound order notification actually reached the supplier&rsquo;s system —
            it is not the same thing as the order&rsquo;s own delivery status.
          </div>
        </Card>
      </div>
    </>
  );
}
