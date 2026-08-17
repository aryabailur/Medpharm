'use client';

/**
 * Dispatch — consignments from warehouse to institution.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getShipments, type Shipment } from '../../lib/api';
import { C, MONO } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, KpiBand, Meter, Mono, PageHeader, Pill, Segmented, Table, Td } from '../../components/ui';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'DISPATCHED', label: 'Dispatched' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'EXCEPTION', label: 'Exception' },
];

export default function Dispatch() {
  const [filter, setFilter] = useState('');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}&take=100` : '?take=100';
      const res = await getShipments(q);
      setShipments(res.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const inFlight = shipments.filter((s) =>
    ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status),
  ).length;
  const coldChain = shipments.filter((s) => s.coldChain).length;
  const withExcursions = shipments.filter((s) => s.excursionCount > 0).length;
  const delivered = shipments.filter((s) => s.status === 'DELIVERED').length;

  return (
    <>
      <PageHeader
        title="Shipment Dispatch"
        right={<Segmented options={FILTERS} value={filter} onChange={setFilter} />}
      />

      <KpiBand columns={4}>
        <Kpi label="In flight" value={inFlight} deltaColor={C.accent} />
        <Kpi label="Cold chain" value={coldChain} />
        <Kpi label="With excursions" value={withExcursions} deltaColor={withExcursions ? C.red : C.grey} />
        <Kpi label="Delivered" value={delivered} deltaColor={C.green} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          {shipments.length === 0 ? (
            <Empty>No shipments match this filter.</Empty>
          ) : (
            <Table head={['Shipment', 'Destination', 'Progress', 'Temp', 'Excursions', 'Status']}>
              {shipments.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <Link href={`/telemetry?shipment=${s.id}`} style={{ textDecoration: 'none' }}>
                      <Mono color={C.accent}>{s.id.slice(0, 8)}</Mono>
                    </Link>
                  </Td>
                  <Td>{s.supplyOrder?.institution?.name ?? 'Unknown institution'}</Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Meter pct={(s.progressPct ?? 0) * 100} />
                      <Mono>{s.progressPct != null ? `${Math.round(s.progressPct * 100)}%` : '—'}</Mono>
                    </div>
                  </Td>
                  <Td>
                    {s.coldChain ? (
                      <Mono color={C.accent}>
                        {s.lastTempC != null ? `${s.lastTempC.toFixed(1)} °C` : '—'}
                      </Mono>
                    ) : (
                      <Mono color={C.inkGhost}>ambient</Mono>
                    )}
                  </Td>
                  <Td>
                    <Mono color={s.excursionCount > 0 ? C.red : C.inkGhost}>
                      {s.excursionCount > 0 ? s.excursionCount : '—'}
                    </Mono>
                  </Td>
                  <Td>
                    <Pill label={s.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
