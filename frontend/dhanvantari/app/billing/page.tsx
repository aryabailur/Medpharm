'use client';

/**
 * Billing.
 *
 * There is no billing endpoint in dhanvantari-api. Billing here is derived
 * entirely from the dispensing ledger (getDispenses) joined to each drug's
 * unitPrice (from getInventory), because at a public facility the act of
 * dispensing IS the billable event — there is no separate billing table to
 * read from. If this ever needs real invoicing (discounts, schemes, taxes),
 * that belongs in a new backend table, not invented here.
 */

import { useEffect, useMemo, useState } from 'react';

import { getDispenses, getInventory, type Dispense, type InventoryRow } from '../../lib/api';
import { C, FONT, rupees } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Table, Td } from '../../components/ui';
import { LineChart } from '../../components/charts';

export default function Billing() {
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());
  const [hasUnpriced, setHasUnpriced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [disp, inv] = await Promise.all([getDispenses('?take=500'), getInventory('?take=300')]);
        setDispenses(disp.items);
        const map = new Map<string, number>();
        let unpriced = false;
        for (const row of inv.items) {
          if (row.drug.unitPrice != null) {
            map.set(row.drugId, row.drug.unitPrice);
          } else {
            unpriced = true;
          }
        }
        setPriceMap(map);
        setHasUnpriced(unpriced);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const priced = useMemo(
    () =>
      dispenses.map((d) => {
        const unitPrice = priceMap.get(d.drugId);
        const value = unitPrice != null ? unitPrice * d.qty : null;
        return { ...d, unitPrice: unitPrice ?? null, value };
      }),
    [dispenses, priceMap],
  );

  const now = new Date();
  const todayStr = now.toDateString();
  const todays = priced.filter((d) => new Date(d.dispensedAt).toDateString() === todayStr);
  const billedToday = todays.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const itemsToday = todays.length;
  const avgValue = itemsToday > 0 ? billedToday / itemsToday : 0;

  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const billedThisMonth = priced
    .filter((d) => {
      const dt = new Date(d.dispensedAt);
      return `${dt.getFullYear()}-${dt.getMonth()}` === monthKey;
    })
    .reduce((sum, d) => sum + (d.value ?? 0), 0);

  // Daily billed value over the last 30 days.
  const dayMs = 24 * 60 * 60 * 1000;
  const days: { key: string; label: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs);
    const key = d.toDateString();
    days.push({ key, label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), total: 0 });
  }
  const dayIndex = new Map(days.map((d, idx) => [d.key, idx]));
  for (const d of priced) {
    const key = new Date(d.dispensedAt).toDateString();
    const idx = dayIndex.get(key);
    if (idx != null && d.value != null) days[idx].total += d.value;
  }
  const series = days.map((d) => ({ x: d.label, y: d.total }));

  const recent = priced
    .slice()
    .sort((a, b) => new Date(b.dispensedAt).getTime() - new Date(a.dispensedAt).getTime())
    .slice(0, 40);

  return (
    <>
      <PageHeader title="Billing" />

      <KpiBand columns={4}>
        <Kpi label="Billed today" value={rupees(billedToday)} />
        <Kpi label="Items dispensed today" value={itemsToday} />
        <Kpi label="Avg value / dispense" value={rupees(avgValue)} />
        <Kpi label="Billed this month" value={rupees(billedThisMonth)} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <CardTitle>Billed value, last 30 days</CardTitle>
          <div style={{ padding: 16 }}>
            <LineChart series={series} showArea />
          </div>
        </Card>

        <Card>
          <CardTitle>Recent dispenses</CardTitle>
          {recent.length === 0 ? (
            <Empty>No dispenses recorded yet.</Empty>
          ) : (
            <Table head={['Time', 'Drug', 'Qty', 'Unit price', 'Value']}>
              {recent.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Mono>
                      {new Date(d.dispensedAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Mono>
                  </Td>
                  <Td>{d.drug?.name ?? d.drugId}</Td>
                  <Td>
                    <Mono>{d.qty}</Mono>
                  </Td>
                  <Td>{d.unitPrice != null ? <Mono>{rupees(d.unitPrice)}</Mono> : '—'}</Td>
                  <Td>{d.value != null ? <Mono>{rupees(d.value)}</Mono> : '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
          {hasUnpriced && (
            <div style={{ padding: '10px 14px', font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
              Some drugs have no recorded unit price. Their dispenses are shown with “—” and excluded from all
              totals above rather than being treated as zero.
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
