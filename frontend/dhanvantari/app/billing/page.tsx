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
import { C, FONT, MONO, rise, rupees } from '../../lib/theme';
import { AreaSparkline } from '../../components/charts';
import { ApiError, Card, CardTitle, Empty, PageHeader, Pill } from '../../components/ui';

const LABEL_SM = {
  font: `600 11px/1 ${FONT}`,
  letterSpacing: '.17em',
  textTransform: 'uppercase' as const,
  color: C.inkFaint,
};

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

  return (
    <>
      <PageHeader title="Billing" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${C.borderFaint}` }}>
          <div style={LABEL_SM}>Billed today</div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: C.ink, marginTop: 12 }}>
            {rupees(billedToday)}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>
            {todays.length} dispensing lines today
          </div>
        </div>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${C.borderFaint}` }}>
          <div style={LABEL_SM}>Scheme covered</div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: C.ink, marginTop: 12 }}>
            {billedToday > 0 ? `${Math.round((schemeCovered / billedToday) * 100)}%` : '—'}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>{rupees(schemeCovered)} today</div>
        </div>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${C.borderFaint}` }}>
          <div style={LABEL_SM}>Patient paid</div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: C.ink, marginTop: 12 }}>
            {rupees(patientPaid)}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>Cash and UPI combined</div>
        </div>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${C.borderFaint}` }}>
          <div style={LABEL_SM}>Unbilled lines</div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: C.ink, marginTop: 12 }}>
            {unbilledLines}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>No recorded unit price</div>
        </div>
      </div>

      <div style={{ padding: '26px 26px 52px', display: 'grid', gap: 24 }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: rise(0) }}>
          <CardTitle>Billed value, last 14 days</CardTitle>
          <div style={{ padding: 20 }}>
            {trendValues.every((v) => v === 0) ? (
              <Empty>No billable dispenses yet.</Empty>
            ) : (
              <AreaSparkline
                values={trendValues}
                ticks={[days[0].key, days[Math.floor(days.length / 2)].key, days[days.length - 1].key].map((k) =>
                  new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase(),
                )}
              />
            )}
          </div>
        </Card>

        <Card style={{ animation: rise(60), overflow: 'hidden' }}>
          <CardTitle>Bills raised over dispensing records</CardTitle>
          {recent.length === 0 ? (
            <Empty>No dispenses recorded yet.</Empty>
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
        </Card>
      </div>
    </>
  );
}
