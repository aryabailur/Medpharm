'use client';

/**
 * Expiring Stock — inventory inside a 180-day expiry window, value at risk.
 */

import { useEffect, useMemo, useState } from 'react';

import { getExpiring, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO, rupees, VIZ } from '../../lib/theme';
import { ApiError, EmptyState, KpiHero, Mono, PageHeader, Panel, PanelTitle, Table, Td } from '../../components/ui';
import { BarChart, ColumnChart, PieChart } from '../../components/charts';

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

  // Expiry-horizon buckets by COUNT (not just value) — a chart-led view of
  // how many line items fall in each window, requested for this screen.
  const countBuckets = [
    { label: 'Expired', count: expired, color: C.red },
    { label: '≤30d', count: inside30, color: C.amber },
    { label: '31-90d', count: inside90 - inside30, color: VIZ.teal },
  ];

  return (
    <>
      <PageHeader title="Expiring Stock" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero index={0} label="Inside 90 days" value={inside90} accent={VIZ.teal} />
        <KpiHero index={1} label="Value at risk" value={rupees(data?.valueAtRisk ?? 0)} accent={C.amber} />
        <KpiHero index={2} label="Inside 30 days" value={inside30} accent={C.red} />
        <KpiHero index={3} label="Already expired" value={expired} accent={C.red} />
      </div>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} />}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Panel delayMs={0}>
            <PanelTitle>Expiry horizon · line items</PanelTitle>
            <div style={{ padding: 18 }}>
              {countBuckets.every((b) => b.count === 0) ? (
                <EmptyState title="Nothing expiring" height={140} glyph="✓" tone={C.green} />
              ) : (
                <ColumnChart bars={countBuckets} height={110} barMax={70} />
              )}
            </div>
          </Panel>

          <Panel delayMs={40}>
            <PanelTitle>Value at risk by window</PanelTitle>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'center' }}>
              <PieChart
                data={buckets}
                size={110}
                centre={rupees(buckets.reduce((a, b) => a + b.value, 0))}
              />
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
          </Panel>
        </div>

        <Panel delayMs={60}>
          <PanelTitle>Value at risk · ranked</PanelTitle>
          <div style={{ padding: 18 }}>
            <BarChart
              data={sorted
                .slice()
                .sort((a, b) => b.qtyOnHand * (b.drug.unitPrice ?? 0) - a.qtyOnHand * (a.drug.unitPrice ?? 0))
                .slice(0, 8)
                .map((r) => ({
                  label: r.drug.name,
                  value: r.qtyOnHand * (r.drug.unitPrice ?? 0),
                  color: r.daysToExpiry != null && r.daysToExpiry <= 30 ? C.red : C.amber,
                }))}
              valueFormat={rupees}
            />
          </div>
        </Panel>

        <Panel delayMs={80}>
          <PanelTitle>Expiring line items</PanelTitle>
          {sorted.length === 0 ? (
            <EmptyState title="Nothing expiring inside this window" height={180} />
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
        </Panel>
      </div>
    </>
  );
}
