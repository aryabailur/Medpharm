'use client';

/**
 * Inventory — full line-item list for this store, filterable client-side.
 */

import { useEffect, useMemo, useState } from 'react';

import { getInventory, type InventoryRow } from '../../lib/api';
import { C, FONT, rupees, num } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, KpiBand, Meter, Mono, PageHeader, Segmented, Table, Td } from '../../components/ui';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'low', label: 'Low stock' },
  { value: 'cold', label: 'Cold chain' },
  { value: 'expiry', label: 'Near expiry' },
];

export default function Inventory() {
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getInventory('?take=300');
        setItems(res.items);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'low':
        return items.filter((r) => r.lowStock);
      case 'cold':
        return items.filter((r) => r.drug.coldChain);
      case 'expiry':
        return items.filter((r) => r.daysToExpiry != null && r.daysToExpiry <= 90);
      default:
        return items;
    }
  }, [items, filter]);

  const belowReorder = items.filter((r) => r.lowStock).length;
  const coldChain = items.filter((r) => r.drug.coldChain).length;
  const stockValue = items.reduce((sum, r) => sum + r.qtyOnHand * (r.drug.unitPrice ?? 0), 0);

  return (
    <>
      <PageHeader title="Inventory" right={<Segmented options={FILTERS} value={filter} onChange={setFilter} />} />

      <KpiBand columns={4}>
        <Kpi label="Line items" value={items.length} />
        <Kpi label="Below reorder" value={belowReorder} deltaColor={C.amber} />
        <Kpi label="Cold chain" value={coldChain} deltaColor={C.accent} />
        <Kpi label="Stock value" value={rupees(stockValue)} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          {filtered.length === 0 ? (
            <Empty>No inventory lines match this filter.</Empty>
          ) : (
            <Table head={['Drug', 'Location', 'On hand', 'Reorder', 'Cover', 'Expiry']}>
              {filtered.map((r) => {
                const pct = r.reorderPoint > 0 ? (r.qtyOnHand / r.reorderPoint) * 100 : 0;
                const coverColor = pct < 50 ? C.red : pct < 100 ? C.amber : C.green;
                const past = r.daysToExpiry != null && r.daysToExpiry <= 0;
                const soon = r.daysToExpiry != null && r.daysToExpiry <= 90;
                const expiryColor = past ? C.red : soon ? C.amber : C.inkMuted;
                return (
                  <tr key={r.id}>
                    <Td>
                      <div style={{ font: `500 13px/1.3 ${FONT}`, color: C.ink }}>{r.drug.name}</div>
                      <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 2 }}>
                        {r.drug.nlemCode ?? ''} · {r.drug.packSize ?? ''}
                      </div>
                    </Td>
                    <Td>{r.location ?? '—'}</Td>
                    <Td>
                      <Mono>{num(r.qtyOnHand)}</Mono>
                    </Td>
                    <Td>
                      <Mono>{num(r.reorderPoint)}</Mono>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Meter pct={pct} color={coverColor} />
                        <Mono color={coverColor}>{Math.round(pct)}%</Mono>
                      </div>
                    </Td>
                    <Td style={{ color: expiryColor }}>
                      {r.expiryDate ? (
                        <>
                          {new Date(r.expiryDate).toLocaleDateString('en-GB')}
                          {r.daysToExpiry != null && (
                            <span style={{ marginLeft: 6 }}>
                              <Mono color={expiryColor}>{r.daysToExpiry}d</Mono>
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
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
