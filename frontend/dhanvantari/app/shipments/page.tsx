'use client';

/**
 * Incoming Shipments — mirrored from Vayu over the signed cross-org contract.
 *
 * The pre-arrival excursion banner (§11, 2:30) is the point of this screen: an
 * institution finds out its cold chain broke *before* the box reaches the dock,
 * not after a nurse opens it.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getIncoming, type IncomingShipment } from '../../lib/api';
import { C, FONT, MONO, VIZ } from '../../lib/theme';
import { ApiError, EmptyState, KpiHero, PageHeader, Panel, PanelTitle, Pill, Table, Td } from '../../components/ui';
import { ColumnChart, Donut, ProgressRing } from '../../components/charts';

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
  const coldChainCount = items.filter((s) => s.coldChain).length;
  const excursionCount = items.filter((s) => s.anomalyFlag).length;

  // Cold-chain vs ambient composition.
  const coldChainSplit = useMemo(
    () =>
      [
        { label: 'Cold chain', count: coldChainCount, color: VIZ.teal },
        { label: 'Ambient', count: items.length - coldChainCount, color: C.grey },
      ].filter((s) => s.count > 0),
    [items, coldChainCount],
  );

  // Status distribution across all inbound shipments.
  const statusBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of items) {
      const key = s.anomalyFlag ? 'EXCURSION' : s.status;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([status, count]) => ({
      label: status.replace(/_/g, ' '),
      count,
      color: status === 'EXCURSION' ? C.red : status === 'DELIVERED' ? C.green : VIZ.teal,
    }));
  }, [items]);

  return (
    <>
      <PageHeader title="Incoming Shipments" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero index={0} label="Total inbound" value={items.length} accent={VIZ.violet} />
        <KpiHero index={1} label="Active" value={active} accent={VIZ.teal} />
        <KpiHero index={2} label="Cold chain" value={coldChainCount} accent={C.blue} />
        <KpiHero index={3} label="Excursions" value={excursionCount} accent={excursionCount > 0 ? C.red : C.green} />
      </div>

      <div style={{ padding: '26px 26px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <Panel delayMs={0}>
            <PanelTitle>Status distribution</PanelTitle>
            <div style={{ padding: 18 }}>
              {statusBars.length === 0 ? (
                <EmptyState title="Nothing inbound" height={140} />
              ) : (
                <ColumnChart bars={statusBars} height={110} barMax={70} />
              )}
            </div>
          </Panel>

          <Panel delayMs={40}>
            <PanelTitle>Cold chain vs ambient</PanelTitle>
            <div style={{ padding: '22px 20px' }}>
              {coldChainSplit.length === 0 ? (
                <EmptyState title="No shipments yet" height={140} />
              ) : (
                <Donut segments={coldChainSplit} totalLabel="SHIPMENTS" size={110} />
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div style={{ padding: '0 26px 52px' }}>
        <Panel delayMs={60}>
          <PanelTitle
            right={
              <span style={{ font: `400 12px/1 ${MONO}`, color: C.inkFaint }}>{active} active</span>
            }
          >
            Incoming shipments
          </PanelTitle>
          {items.length === 0 ? (
            <EmptyState title="Nothing inbound" height={180} />
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ProgressRing pct={pct} size={30} color={s.anomalyFlag ? C.red : VIZ.teal} thickness={3} />
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
        </Panel>
      </div>
    </>
  );
}
