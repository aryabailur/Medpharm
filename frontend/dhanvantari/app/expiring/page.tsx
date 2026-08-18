'use client';

/**
 * Expiring Stock — inventory inside a 180-day expiry window, value at risk.
 */

import { useEffect, useMemo, useState } from 'react';

import { getExpiring, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO, rupees } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Table, Td } from '../../components/ui';
import { BarChart, PieChart } from '../../components/charts';

export default function Expiring() {
  const [data, setData] = useState<{ items: InventoryRow[]; valueAtRisk: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getExpiring(180);
        setData(res);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const items = data?.items ?? [];

  const sorted = useMemo(
    () => items.slice().sort((a, b) => (a.daysToExpiry ?? Infinity) - (b.daysToExpiry ?? Infinity)),
    [items],
  );

  const inside90 = items.filter((r) => r.daysToExpiry != null && r.daysToExpiry <= 90 && r.daysToExpiry > 0).length;
  const inside30 = items.filter((r) => r.daysToExpiry != null && r.daysToExpiry <= 30 && r.daysToExpiry > 0).length;
  const expired = items.filter((r) => r.daysToExpiry != null && r.daysToExpiry <= 0).length;

  const buckets = useMemo(() => {
    const b = { expired: 0, d30: 0, d90: 0, d180: 0 };
    for (const r of items) {
      const value = r.qtyOnHand * (r.drug.unitPrice ?? 0);
      const days = r.daysToExpiry ?? Infinity;
      if (days <= 0) b.expired += value;
      else if (days <= 30) b.d30 += value;
      else if (days <= 90) b.d90 += value;
      else b.d180 += value;
    }
    return [
      { label: 'Expired', value: b.expired, color: C.red },
      { label: '≤30 d', value: b.d30, color: C.amber },
      { label: '31–90 d', value: b.d90, color: C.accent },
      { label: '91–180 d', value: b.d180, color: C.grey },
    ];
  }, [items]);

  return (
    <>
      <PageHeader title="Expiring Stock" />

      <KpiBand columns={4}>
        <Kpi label="Inside 90 days" value={inside90} />
        <Kpi label="Value at risk" value={rupees(data?.valueAtRisk ?? 0)} deltaColor={C.amber} />
        <Kpi label="Inside 30 days" value={inside30} deltaColor={C.red} />
        <Kpi label="Already expired" value={expired} deltaColor={C.red} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <CardTitle>Value at risk by window</CardTitle>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <PieChart data={buckets} size={140} />
              <div style={{ display: 'grid', gap: 6 }}>
                {buckets.map((b) => (
                  <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: b.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ font: `500 11px/1.3 ${FONT}`, color: C.inkMuted }}>
                      {b.label}{' '}
                      <span style={{ font: `500 11px/1.3 ${MONO}`, color: C.ink }}>
                        {rupees(b.value)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderLeft: `1px solid ${C.borderSoft}`, paddingLeft: 24 }}>
              <BarChart data={buckets} horizontal valueFormat={rupees} />
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Expiring line items</CardTitle>
          {sorted.length === 0 ? (
            <Empty>Nothing expiring inside this window.</Empty>
          ) : (
            <Table head={['Drug', 'Location', 'On hand', 'Expiry', 'Days', 'Value at risk']}>
              {sorted.map((r) => {
                const days = r.daysToExpiry;
                const color = days != null && days <= 0 ? C.red : days != null && days <= 30 ? C.amber : C.inkMuted;
                const value = r.qtyOnHand * (r.drug.unitPrice ?? 0);
                return (
                  <tr key={r.id}>
                    <Td>{r.drug.name}</Td>
                    <Td>{r.location ?? '—'}</Td>
                    <Td>
                      <Mono>{r.qtyOnHand}</Mono>
                    </Td>
                    <Td>{r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('en-GB') : '—'}</Td>
                    <Td>
                      <Mono color={color}>{days != null ? `${days}d` : '—'}</Mono>
                    </Td>
                    <Td>
                      <Mono>{rupees(value)}</Mono>
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
