'use client';

/**
 * Inventory — full line-item list for this store, filterable client-side.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getInventory, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO, num, rupees, statusColors, VIZ } from '../../lib/theme';
import { ApiError, EmptyState, KpiHero, Panel, PanelTitle, Pill } from '../../components/ui';
import { BarChart, ColumnChart, PieChart } from '../../components/charts';

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

  const stockValue = items.reduce((sum, r) => sum + r.qtyOnHand * (r.drug.unitPrice ?? 0), 0);
  const coldChainCount = items.filter((r) => r.drug.coldChain).length;
  const lowCount = items.filter((r) => r.lowStock).length;

  // Stock-cover distribution — days of cover bucketed across every line item.
  const coverBuckets = useMemo(() => {
    const buckets = { critical: 0, low: 0, ok: 0, healthy: 0 };
    for (const r of items) {
      if (r.reorderPoint <= 0) continue;
      const days = (r.qtyOnHand / r.reorderPoint) * 14;
      if (days <= 3) buckets.critical++;
      else if (days <= 7) buckets.low++;
      else if (days <= 21) buckets.ok++;
      else buckets.healthy++;
    }
    return [
      { label: '≤3D', count: buckets.critical, color: C.red },
      { label: '4-7D', count: buckets.low, color: C.amber },
      { label: '8-21D', count: buckets.ok, color: VIZ.teal },
      { label: '21D+', count: buckets.healthy, color: C.green },
    ];
  }, [items]);

  // ABC-style value composition — the drugs that make up most of stock value
  // vs the long tail, derived from actual unit price × qty on hand.
  const valueComposition = useMemo(() => {
    const valued = items
      .map((r) => ({ r, value: r.qtyOnHand * (r.drug.unitPrice ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = valued.reduce((s, x) => s + x.value, 0);
    if (total === 0) return [];
    let cum = 0;
    let aValue = 0;
    let bValue = 0;
    let cValue = 0;
    for (const x of valued) {
      cum += x.value;
      const pct = cum / total;
      if (pct <= 0.8) aValue += x.value;
      else if (pct <= 0.95) bValue += x.value;
      else cValue += x.value;
    }
    return [
      { label: 'A (top 80%)', value: Math.round(aValue), color: VIZ.violet },
      { label: 'B (next 15%)', value: Math.round(bValue), color: VIZ.teal },
      { label: 'C (tail 5%)', value: Math.round(cValue), color: C.grey },
    ].filter((s) => s.value > 0);
  }, [items]);

  // Low-stock ranking — thinnest cover first, for the chart-led ranking.
  const lowRanked = useMemo(
    () =>
      items
        .filter((r) => r.lowStock)
        .map((r) => ({
          label: r.drug.name,
          value: r.reorderPoint > 0 ? Math.round((r.qtyOnHand / r.reorderPoint) * 100) : 0,
          color: r.qtyOnHand === 0 ? C.red : C.amber,
        }))
        .sort((a, b) => a.value - b.value)
        .slice(0, 8),
    [items],
  );

  return (
    <>
      <div style={{ padding: '20px 26px 16px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
        <h1 style={{ margin: 0, font: `600 19px/1.2 ${FONT}`, color: C.ink, letterSpacing: '-0.01em' }}>Inventory</h1>
        <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 5 }}>
          Line items across this store
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero index={0} label="Stock value" value={rupees(stockValue)} sub={`${items.length} line items`} accent={VIZ.violet} />
        <KpiHero index={1} label="Below reorder" value={lowCount} accent={C.amber} />
        <KpiHero index={2} label="Cold chain lines" value={coldChainCount} accent={VIZ.teal} />
        <KpiHero index={3} label="Line items" value={items.length} accent={VIZ.magenta} />
      </div>

      <div style={{ padding: '26px 26px 0' }}>
        {error && <ApiError error={error} />}
      </div>

      <div style={{ padding: '0 26px 26px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        <Panel delayMs={0}>
          <PanelTitle>Stock cover distribution</PanelTitle>
          <div style={{ padding: 18 }}>
            {items.length === 0 ? (
              <EmptyState title="No inventory yet" height={140} />
            ) : (
              <ColumnChart bars={coverBuckets} height={110} barMax={70} />
            )}
          </div>
        </Panel>

        <Panel delayMs={40}>
          <PanelTitle>Value composition</PanelTitle>
          <div style={{ padding: '18px 16px', display: 'flex', gap: 18, alignItems: 'center' }}>
            {valueComposition.length === 0 ? (
              <EmptyState title="No priced stock" height={140} />
            ) : (
              <>
                <PieChart
                  data={valueComposition}
                  size={110}
                  centre={rupees(valueComposition.reduce((a, s) => a + s.value, 0))}
                />
                <div style={{ display: 'grid', gap: 6 }}>
                  {valueComposition.map((s) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                      <span style={{ font: `500 11px/1.3 ${FONT}`, color: C.inkMuted }}>
                        {s.label} <span style={{ font: `500 11px/1.3 ${MONO}`, color: C.ink }}>{rupees(s.value)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Panel>

        <Panel delayMs={60}>
          <PanelTitle>Thinnest cover</PanelTitle>
          <div style={{ padding: 18 }}>
            {lowRanked.length === 0 ? (
              <EmptyState title="Nothing below reorder" height={140} glyph="✓" tone={C.green} />
            ) : (
              <BarChart data={lowRanked} valueFormat={(v) => `${v}%`} labelWidth={100} />
            )}
          </div>
        </Panel>
      </div>

      <div style={{ padding: '0 26px 52px' }}>
        <Panel delayMs={80} style={{ overflow: 'hidden' }}>
          <PanelTitle
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
          </PanelTitle>

          {filtered.length === 0 ? (
            <EmptyState title="No inventory lines match this filter" height={180} />
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
        </Panel>
      </div>
    </>
  );
}
