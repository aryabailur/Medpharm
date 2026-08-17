'use client';

/**
 * Inventory — full line-item list for this store, filterable client-side.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getInventory, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO, num, rise, statusColors } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Meter, PageHeader, Pill } from '../../components/ui';

const FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'cold', label: 'Cold chain' },
  { value: 'low', label: 'Low stock' },
  { value: 'expiry', label: 'Near expiry' },
];

function stateOf(r: InventoryRow): string {
  if (r.qtyOnHand === 0) return 'CRITICAL';
  if (r.daysToExpiry != null && r.daysToExpiry <= 90) return 'EXPIRING';
  if (r.lowStock) return 'LOW';
  return 'OK';
}

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

  return (
    <>
      <PageHeader title="Inventory" />

      <div style={{ padding: '26px 26px 52px' }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: rise(0), overflow: 'hidden' }}>
          <CardTitle
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                {FILTERS.map((f) => {
                  const active = f.value === filter;
                  return (
                    <button
                      key={f.value || 'all'}
                      onClick={() => setFilter(f.value)}
                      style={{
                        border: active ? `1px solid ${C.inkStrong}` : '1px solid #E4E2DF',
                        background: active ? C.inkStrong : '#fff',
                        color: active ? '#fff' : '#4A4542',
                        font: `500 11px/1 ${FONT}`,
                        padding: '6px 10px',
                        borderRadius: 3,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            }
          >
            Inventory · {items.length} line items
          </CardTitle>

          {filtered.length === 0 ? (
            <Empty>No inventory lines match this filter.</Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                <thead>
                  <tr>
                    {['Drug', 'Batch ref', 'On hand', 'Reorder pt', 'Expiry', 'Location', 'State'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 2 || i === 3 ? 'right' : 'left',
                          font: `600 11px/1 ${FONT}`,
                          letterSpacing: '.13em',
                          textTransform: 'uppercase',
                          color: C.inkSoft,
                          padding: '14px 18px',
                          borderBottom: `1px solid ${C.border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const state = stateOf(r);
                    const { color, tint } = statusColors(state);
                    const pct = r.reorderPoint > 0 ? (r.qtyOnHand / r.reorderPoint) * 100 : 0;
                    const past = r.daysToExpiry != null && r.daysToExpiry <= 0;
                    const soon = r.daysToExpiry != null && r.daysToExpiry <= 90;
                    const expiryColor = past ? C.red : soon ? C.amber : C.inkMuted;
                    return (
                      <tr key={r.id}>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `400 14px/1.6 ${FONT}`,
                            color: C.ink,
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            {r.drug.coldChain && (
                              <span
                                style={{
                                  font: `600 9px/1 ${MONO}`,
                                  letterSpacing: '.04em',
                                  background: C.blueTint,
                                  color: C.blue,
                                  padding: '4px 5px',
                                }}
                              >
                                2–8°
                              </span>
                            )}
                            <div>
                              <div style={{ fontWeight: 500 }}>{r.drug.name}</div>
                              <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
                                {r.drug.genericName ?? '—'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `500 13px/1.5 ${MONO}`,
                            color: C.ink,
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          <Link
                            href="/tracking"
                            style={{
                              border: 0,
                              background: 'transparent',
                              font: `500 12px/1 ${MONO}`,
                              color: C.ink,
                              borderBottom: `1px dotted ${C.inkGhost}`,
                              textDecoration: 'none',
                            }}
                          >
                            {r.batchRef ?? '—'}
                          </Link>
                        </td>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `500 14px/1.4 ${MONO}`,
                            color: C.ink,
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          {num(r.qtyOnHand)}
                        </td>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `400 14px/1.4 ${MONO}`,
                            color: C.inkMuted,
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          {num(r.reorderPoint)}
                        </td>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `400 13px/1.5 ${MONO}`,
                            color: expiryColor,
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          {r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `400 14px/1.6 ${FONT}`,
                            color: C.inkMuted,
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          {r.location ?? '—'}
                        </td>
                        <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                          <Pill label={state} color={color} tint={tint} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
