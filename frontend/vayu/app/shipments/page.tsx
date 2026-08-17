'use client';

/**
 * Shipment Dispatch — consignments from warehouse to institution.
 *
 * Client Component: the status filter must refetch in place, matching the
 * orders page's interaction pattern.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getShipments, type Shipment } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

const FILTERS = ['DRAFT', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', ''] as const;

export default function ShipmentsPage() {
  const [filter, setFilter] = useState<string>('');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}&take=100` : '?take=100';
      setShipments((await getShipments(q)).items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const inFlight = shipments.filter((s) =>
    ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status),
  );
  const coldChain = shipments.filter((s) => s.coldChain);
  const withExcursions = shipments.filter((s) => s.excursionCount > 0);
  const delivered = shipments.filter((s) => s.status === 'DELIVERED');

  return (
    <>
      <PageHeader
        title="Shipment Dispatch"
        subtitle="Consignments from warehouse to institution"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f || 'ALL'}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 11px',
                  borderRadius: 7,
                  border: `1px solid ${filter === f ? C.steel : C.border}`,
                  background: filter === f ? C.steelTint : C.surface,
                  color: filter === f ? C.steel : C.inkFaint,
                  font: `600 11px/1.2 ${FONT}`,
                  cursor: 'pointer',
                }}
              >
                {f || 'All'}
              </button>
            ))}
          </div>
        }
      />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        {error ? (
          <ApiError error={error} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Kpi label="In flight" value={inFlight.length} deltaColor={C.blue} />
              <Kpi label="Cold chain" value={coldChain.length} deltaColor={C.blue} />
              <Kpi
                label="With excursions"
                value={withExcursions.length}
                deltaColor={C.red}
                note={withExcursions.length ? 'requires review' : 'No excursions on record'}
              />
              <Kpi label="Delivered" value={delivered.length} deltaColor={C.green} />
            </div>

            <Card>
              {shipments.length === 0 ? (
                <Empty>No shipments with status {filter || 'any'}.</Empty>
              ) : (
                <Table head={['Shipment', 'Destination', 'Progress', 'Temp', 'Excursions', 'Status']}>
                  {shipments.map((s) => {
                    const pct = Math.round((s.progressPct ?? 0) * 100);
                    return (
                      <tr key={s.id}>
                        <Td>
                          <Link href={`/telemetry?shipment=${s.id}`} style={{ textDecoration: 'none' }}>
                            <Mono>{s.id.slice(0, 8)}</Mono>
                          </Link>
                        </Td>
                        <Td>
                          <div style={{ color: C.ink }}>{s.supplyOrder?.institution?.name ?? '—'}</div>
                          <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkGhost }}>
                            {s.supplyOrder?.institution?.district}
                          </div>
                        </Td>
                        <Td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 90,
                                height: 5,
                                background: C.borderSoft,
                                borderRadius: 99,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: C.steel,
                                  borderRadius: 99,
                                }}
                              />
                            </div>
                            <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkFaint }}>{pct}%</span>
                          </div>
                        </Td>
                        <Td>
                          <span
                            style={{
                              font: `600 12px/1 ${MONO}`,
                              color: s.coldChain ? C.blue : C.grey,
                            }}
                          >
                            {s.coldChain && s.lastTempC != null ? `${s.lastTempC.toFixed(1)} °C` : 'ambient'}
                          </span>
                        </Td>
                        <Td style={{ color: s.excursionCount > 0 ? C.red : C.inkMuted, fontWeight: s.excursionCount > 0 ? 600 : 400 }}>
                          {s.excursionCount > 0 ? s.excursionCount : '—'}
                        </Td>
                        <Td>
                          <Pill label={s.status} />
                        </Td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
