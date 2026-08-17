'use client';

/**
 * Incoming Shipments — mirrored from Vayu over the signed cross-org contract.
 *
 * The pre-arrival excursion banner (§11, 2:30) is the point of this screen: an
 * institution finds out its cold chain broke *before* the box reaches the dock,
 * not after a nurse opens it.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getIncoming, type IncomingShipment } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, PageHeader, Pill, Table, Td } from '../../components/ui';
import { Meter } from '../../components/charts';

const IN_TRANSIT = ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Shipments() {
  const [items, setItems] = useState<IncomingShipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getIncoming();
        setItems(res.items);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Incoming Shipments" />
        <div style={{ padding: 26 }}>
          <ApiError error={error} service="dhanvantari-api" />
        </div>
      </>
    );
  }

  const active = items.filter((s) => s.status !== 'DELIVERED').length;

  return (
    <>
      <PageHeader title="Incoming Shipments" />

      <div style={{ padding: '26px 26px 52px' }}>
        <Card style={{ animation: rise(0) }}>
          <CardTitle
            right={
              <span style={{ font: `400 12px/1 ${MONO}`, color: C.inkFaint }}>{active} active</span>
            }
          >
            Incoming shipments
          </CardTitle>
          {items.length === 0 ? (
            <Empty>Nothing inbound.</Empty>
          ) : (
            <Table head={['Shipment', 'Contents', 'Progress', 'Last temp', 'ETA', 'Status']}>
              {items.map((s) => {
                const pct = Math.round((s.progressPct ?? 0) * 100);
                const tempColor = s.lastTempC == null ? '#A89F9B' : s.anomalyFlag ? C.red : C.blue;
                return (
                  <tr key={s.id}>
                    <Td>
                      <Link href={`/tracking?shipment=${s.id}`} style={{ textDecoration: 'none' }}>
                        <span
                          style={{
                            border: 0,
                            background: 'transparent',
                            font: `500 12px/1 ${MONO}`,
                            color: C.ink,
                            borderBottom: `1px dotted ${C.inkGhost}`,
                          }}
                        >
                          {s.id.slice(0, 12)}
                        </span>
                      </Link>
                      <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkFaint, marginTop: 3 }}>
                        {s.supplyOrderId ? s.supplyOrderId.slice(0, 12) : '—'}
                      </div>
                    </Td>
                    <Td>
                      {s.coldChain ? 'Cold chain' : 'Ambient'} · {s.batchCount ?? 0} batch
                      {(s.batchCount ?? 0) === 1 ? '' : 'es'}
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Meter pct={pct} width={72} color={s.anomalyFlag ? C.red : undefined} />
                        <span style={{ font: `400 11px/1 ${MONO}`, color: C.inkFaint }}>{pct}%</span>
                      </div>
                    </Td>
                    <Td>
                      <span style={{ font: `500 13px/1.5 ${MONO}`, color: tempColor }}>
                        {s.lastTempC != null ? `${s.lastTempC.toFixed(1)} °C` : '—'}
                      </span>
                    </Td>
                    <Td>{s.status === 'DELIVERED' ? 'Delivered' : fmtDate(s.etaAt)}</Td>
                    <Td>
                      <Pill label={s.anomalyFlag ? 'EXCURSION' : s.status} />
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
