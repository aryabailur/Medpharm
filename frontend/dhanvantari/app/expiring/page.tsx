'use client';

/**
 * Expiring Stock — inventory inside a 90-day expiry window, value at risk.
 */

import { useEffect, useMemo, useState } from 'react';

import { getExpiring, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO, num, rise, rupees } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, Empty, Mono, PageHeader, Table, Td } from '../../components/ui';
import { ColumnChart } from '../../components/charts';

export default function Expiring() {
  const [data, setData] = useState<{ items: InventoryRow[]; valueAtRisk: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getExpiring(90);
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

  const buckets = useMemo(() => {
    const b = { d30: { count: 0, value: 0 }, d60: { count: 0, value: 0 }, d90: { count: 0, value: 0 } };
    for (const r of items) {
      const value = r.qtyOnHand * (r.drug.unitPrice ?? 0);
      const days = r.daysToExpiry ?? Infinity;
      if (days <= 30) {
        b.d30.count += 1;
        b.d30.value += value;
      } else if (days <= 60) {
        b.d60.count += 1;
        b.d60.value += value;
      } else if (days <= 90) {
        b.d90.count += 1;
        b.d90.value += value;
      }
    }
    return [
      { label: '≤ 30 D', count: b.d30.count, color: C.red, note: rupees(b.d30.value) },
      { label: '31–60 D', count: b.d60.count, color: C.amber, note: rupees(b.d60.value) },
      { label: '61–90 D', count: b.d90.count, color: C.ochre, note: rupees(b.d90.value) },
    ];
  }, [items]);

  const oldest = sorted[0];

  return (
    <>
      <PageHeader title="Expiring Stock" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, padding: '26px 26px 52px' }}>
        <Card style={{ animation: rise(0) }}>
          <CardTitle right={<Button variant="ghost">Propose redistribution</Button>}>Expiring stock</CardTitle>
          {error ? (
            <div style={{ padding: 16 }}>
              <ApiError error={error} service="dhanvantari-api" />
            </div>
          ) : sorted.length === 0 ? (
            <Empty>Nothing expiring inside this window.</Empty>
          ) : (
            <Table head={['Drug', 'Batch', 'Qty', 'Expires', 'Days left', 'Suggested action']}>
              {sorted.map((r) => {
                const days = r.daysToExpiry;
                const color =
                  days == null ? C.inkMuted : days <= 30 ? C.red : days <= 60 ? C.amber : C.ochre;
                const action =
                  days == null
                    ? 'Monitor'
                    : days <= 30
                      ? 'Dispense first · flag to counters'
                      : days <= 60
                        ? 'Transfer to a higher-turnover site'
                        : 'No action needed at current draw';
                return (
                  <tr key={r.id}>
                    <Td>{r.drug.name}</Td>
                    <Td>
                      <span
                        style={{
                          border: 0,
                          background: 'transparent',
                          font: `500 12px/1 ${MONO}`,
                          color: C.ink,
                          borderBottom: `1px dotted ${C.inkGhost}`,
                        }}
                      >
                        {r.batchRef ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <Mono>{num(r.qtyOnHand)}</Mono>
                    </Td>
                    <Td>{r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('en-GB') : '—'}</Td>
                    <Td>
                      <Mono color={color}>{days != null ? `${days}d` : '—'}</Mono>
                    </Td>
                    <Td>{action}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        <Card style={{ alignSelf: 'start', animation: rise(60) }}>
          <CardTitle>Value at risk</CardTitle>
          <div style={{ padding: 18 }}>
            <ColumnChart
              bars={buckets}
              height={130}
              footnote={
                oldest
                  ? `Oldest line is ${oldest.drug.name} ${oldest.batchRef ?? ''} at ${oldest.daysToExpiry ?? '—'} days.`
                  : 'No expiring lines in this window.'
              }
            />
          </div>
        </Card>
      </div>
    </>
  );
}
