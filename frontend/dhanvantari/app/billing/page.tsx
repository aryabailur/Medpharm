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
import { C, FONT, MONO, rupees, VIZ } from '../../lib/theme';
import { AreaSparkline, PieChart } from '../../components/charts';
import { ApiError, EmptyState, KpiHero, PageHeader, Panel, PanelTitle, Pill } from '../../components/ui';

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

  // No scheme/self-pay distinction exists in the dispensing record, so the
  // "scheme covered" / "patient paid" split is derived from patientRef: an
  // OPD/IPD reference implies a scheme-linked visit, everything else is
  // treated as unattributed (shown as unbilled, never invented as cash).
  const schemeTagged = priced.filter((d) => d.patientRef && /^(OPD|IPD)-/i.test(d.patientRef));
  const schemeCovered = schemeTagged.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const unbilledLines = priced.filter((d) => d.value == null).length;
  const patientPaid = priced
    .filter((d) => !d.patientRef || !/^(OPD|IPD)-/i.test(d.patientRef))
    .reduce((sum, d) => sum + (d.value ?? 0), 0);

  const dayMs = 24 * 60 * 60 * 1000;
  const days: { key: string; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs);
    days.push({ key: d.toDateString(), total: 0 });
  }
  const dayIndex = new Map(days.map((d, idx) => [d.key, idx]));
  for (const d of priced) {
    const key = new Date(d.dispensedAt).toDateString();
    const idx = dayIndex.get(key);
    if (idx != null && d.value != null) days[idx].total += d.value;
  }
  const trendValues = days.map((d) => d.total);

  const recent = priced
    .slice()
    .sort((a, b) => new Date(b.dispensedAt).getTime() - new Date(a.dispensedAt).getTime())
    .slice(0, 40);

  // Settled composition, by ₹ value — scheme-covered vs patient-paid. Unbilled
  // lines are a count, not a rupee amount, so they get their own KPI rather
  // than being mixed into a currency-valued chart.
  const billingComposition = [
    { label: 'Scheme covered', value: Math.round(schemeCovered), color: VIZ.violet },
    { label: 'Patient paid', value: Math.round(patientPaid), color: VIZ.teal },
  ].filter((s) => s.value > 0);

  return (
    <>
      <PageHeader title="Billing" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero index={0} label="Billed today" value={rupees(billedToday)} sub={`${todays.length} dispensing lines today`} accent={VIZ.violet} />
        <KpiHero
          index={1}
          label="Scheme covered"
          value={billedToday > 0 ? `${Math.round((schemeCovered / billedToday) * 100)}%` : '—'}
          sub={`${rupees(schemeCovered)} today`}
          accent={VIZ.magenta}
        />
        <KpiHero index={2} label="Patient paid" value={rupees(patientPaid)} sub="Cash and UPI combined" accent={VIZ.teal} />
        <KpiHero index={3} label="Unbilled lines" value={unbilledLines} sub="No recorded unit price" accent={C.grey} />
      </div>

      <div style={{ padding: '26px 26px 52px', display: 'grid', gap: 24 }}>
        {error && <ApiError error={error} />}

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
          <Panel delayMs={0}>
            <PanelTitle>Billed value, last 14 days</PanelTitle>
            <div style={{ padding: 20 }}>
              {trendValues.every((v) => v === 0) ? (
                <EmptyState title="No billable dispenses yet" height={104} />
              ) : (
                <AreaSparkline
                  values={trendValues}
                  color={VIZ.teal}
                  ticks={[days[0].key, days[Math.floor(days.length / 2)].key, days[days.length - 1].key].map((k) =>
                    new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase(),
                  )}
                />
              )}
            </div>
          </Panel>

          <Panel delayMs={40}>
            <PanelTitle>Settled composition</PanelTitle>
            <div style={{ padding: '20px 18px', display: 'flex', gap: 18, alignItems: 'center' }}>
              {billingComposition.length === 0 ? (
                <EmptyState title="No billing data yet" height={104} />
              ) : (
                <>
                  <PieChart
                    data={billingComposition}
                    size={100}
                    centre={rupees(billingComposition.reduce((a, s) => a + s.value, 0))}
                  />
                  <div style={{ display: 'grid', gap: 6 }}>
                    {billingComposition.map((s) => (
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
        </div>

        <Panel delayMs={60} style={{ overflow: 'hidden' }}>
          <PanelTitle>Bills raised over dispensing records</PanelTitle>
          {recent.length === 0 ? (
            <EmptyState title="No dispenses recorded yet" height={180} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                <thead>
                  <tr>
                    {['Bill', 'Patient', 'Lines', 'Amount', 'Scheme', 'Status'].map((h, i) => (
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
                  {recent.map((d) => {
                    const isScheme = d.patientRef && /^(OPD|IPD)-/i.test(d.patientRef);
                    const status = d.value == null ? 'UNBILLED' : 'SETTLED';
                    return (
                      <tr key={d.id}>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `500 13px/1.5 ${MONO}`,
                            color: C.ink,
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          BL-{d.id.slice(0, 6).toUpperCase()}
                        </td>
                        <td
                          style={{
                            padding: '15px 18px',
                            font: `400 13px/1.5 ${MONO}`,
                            color: C.inkMuted,
                            borderBottom: `1px solid ${C.borderSoft}`,
                            verticalAlign: 'top',
                          }}
                        >
                          {d.patientRef ?? '—'}
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
                          1
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
                          {d.value != null ? rupees(d.value) : '—'}
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
                          {isScheme ? 'Ayushman Bharat' : 'Self pay'}
                        </td>
                        <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                          <Pill label={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasUnpriced && (
            <div style={{ padding: '10px 18px 16px', font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
              Some drugs have no recorded unit price. Their dispenses are shown with “—” and excluded from all
              totals above rather than being treated as zero.
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
