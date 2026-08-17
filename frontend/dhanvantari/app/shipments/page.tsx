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
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, KpiBand, Meter, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

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

  const inTransit = items.filter((s) => IN_TRANSIT.includes(s.status)).length;
  const coldChain = items.filter((s) => s.coldChain).length;
  const breaching = items.filter((s) => s.anomalyFlag && s.status !== 'DELIVERED');

  return (
    <>
      <PageHeader title="Incoming Shipments" />

      {breaching.length > 0 && (
        <div
          style={{
            background: C.redTint,
            border: `1px solid ${C.red}`,
            borderRadius: 4,
            padding: '14px 18px',
            margin: 0,
          }}
        >
          <div style={{ font: `700 13px/1.4 ${FONT}`, color: C.red }}>Cold-chain breach reported in transit</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
            {breaching.map((s) => (
              <div key={s.id} style={{ font: `500 12px/1.5 ${MONO}`, color: C.red }}>
                {s.id.slice(0, 12)} · last reading {s.lastTempC != null ? `${s.lastTempC.toFixed(1)} °C` : '—'} · ETA{' '}
                {fmtDate(s.etaAt)}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, font: `400 12px/1.6 ${FONT}`, color: C.inkMuted }}>
            Quarantine on receipt and photograph the vial tray before scan-in.
          </div>
        </div>
      )}

      <KpiBand columns={4}>
        <Kpi label="Total incoming" value={items.length} />
        <Kpi label="In transit" value={inTransit} deltaColor={C.accent} />
        <Kpi label="Cold chain" value={coldChain} deltaColor={C.accent} />
        <Kpi
          label="With excursion"
          value={items.filter((s) => s.anomalyFlag).length}
          deltaColor={C.red}
        />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          {items.length === 0 ? (
            <Empty>Nothing inbound.</Empty>
          ) : (
            <Table head={['Shipment', 'Status', 'Cold chain', 'Last temp', 'Progress', 'ETA', 'Batches']}>
              {items.map((s) => {
                const tempColor = s.anomalyFlag ? C.red : s.coldChain ? C.accent : C.inkMuted;
                return (
                  <tr key={s.id}>
                    <Td>
                      <Link href={`/tracking?shipment=${s.id}`} style={{ textDecoration: 'none' }}>
                        <Mono color={C.accent}>{s.id.slice(0, 12)}</Mono>
                      </Link>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Pill label={s.status} />
                        {s.anomalyFlag && <Pill label="EXCURSION" color={C.red} tint={C.redTint} />}
                      </div>
                    </Td>
                    <Td>{s.coldChain ? <Pill label="COLD" /> : '—'}</Td>
                    <Td>
                      <Mono color={tempColor}>{s.lastTempC != null ? `${s.lastTempC.toFixed(1)} °C` : '—'}</Mono>
                    </Td>
                    <Td>
                      <Meter pct={(s.progressPct ?? 0) * 100} color={s.anomalyFlag ? C.red : undefined} />
                    </Td>
                    <Td>{fmtDate(s.etaAt)}</Td>
                    <Td>
                      <Mono>{s.batchCount ?? 0}</Mono>
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
