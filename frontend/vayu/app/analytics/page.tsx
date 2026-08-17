'use client';

/**
 * Network Analytics — supply-chain-wide aggregates: consumption, supplier
 * reliability, district fulfilment, stock health, expiry risk, disease signal.
 */

import { useEffect, useState } from 'react';

import {
  getAnalyticsSummary,
  getCatalog,
  getConsumption,
  getDiseaseSignal,
  getExpiry,
  getFulfilment,
  getStockHealth,
  getVendorAnalytics,
  type AnalyticsSummary,
  type ConsumptionResponse,
  type Drug,
  type ExpiryBucket,
  type FulfilmentRow,
  type StockHealthBucket,
  type CriticalStockRow,
  type VendorMetric,
} from '../../lib/api';
import { C, FONT, LABEL, MONO, rupees } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Table, Td } from '../../components/ui';
import { BarChart, Histogram, LineChart, MultiLineChart, PieChart, ScatterPlot } from '../../components/charts';

/**
 * Section divider — the page reads as three questions in causal order:
 * what's driving demand, is supply keeping up, and where is the network
 * failing as a result. Each divider spans the full grid row.
 */
function Section({ children }: { children: string }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        ...LABEL,
        paddingBottom: 9,
        marginTop: 6,
        borderBottom: `1px solid ${C.borderFaint}`,
      }}
    >
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [catalog, setCatalog] = useState<Drug[]>([]);
  const [vendors, setVendors] = useState<VendorMetric[]>([]);
  const [fulfilment, setFulfilment] = useState<FulfilmentRow[]>([]);
  const [stockHealth, setStockHealth] = useState<{
    totalLines: number;
    belowReorder: number;
    buckets: StockHealthBucket[];
    critical: CriticalStockRow[];
  } | null>(null);
  const [expiry, setExpiry] = useState<ExpiryBucket[]>([]);
  const [disease, setDisease] = useState<{ diseases: string[]; outbreakMonths: number; series: { month: string; cases: number; outbreak: boolean }[] } | null>(
    null,
  );

  const [drugId, setDrugId] = useState('');
  const [consumption, setConsumption] = useState<ConsumptionResponse | null>(null);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, c, v, f, sh, ex, d] = await Promise.all([
          getAnalyticsSummary(),
          getCatalog('?take=200'),
          getVendorAnalytics(),
          getFulfilment(),
          getStockHealth(),
          getExpiry(),
          getDiseaseSignal(),
        ]);
        setSummary(s);
        setCatalog(c.items);
        setDrugId((current) => current || c.items[0]?.id || '');
        setVendors(v.items);
        setFulfilment(f.items);
        setStockHealth(sh);
        setExpiry(ex.buckets);
        setDisease(d);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!drugId) return;
    (async () => {
      try {
        const res = await getConsumption(drugId);
        setConsumption(res);
        setConsumptionError(null);
      } catch (e) {
        setConsumptionError((e as Error).message);
      }
    })();
  }, [drugId]);

  if (!loaded) {
    return (
      <>
        <PageHeader title="Network Analytics" />
        <div style={{ padding: 26 }}>
          <Empty>Loading…</Empty>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Network Analytics" />
        <div style={{ padding: 26 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  // ── Section 3: supplier reliability vs price ──────────────────────────────
  const vendorPoints = vendors.map((v) => ({
    x: v.priceVariancePct,
    y: v.onTimePct,
    label: v.vendorId,
    color: v.onTimePct >= 90 ? C.green : v.onTimePct >= 60 ? C.amber : C.red,
  }));
  const bestVendor = vendors.length
    ? vendors.reduce((a, b) => (b.onTimePct > a.onTimePct ? b : a))
    : null;
  const worstVendor = vendors.length
    ? vendors.reduce((a, b) => (b.onTimePct < a.onTimePct ? b : a))
    : null;

  // ── Section 4: district fulfilment ────────────────────────────────────────
  const fulfilmentSorted = [...fulfilment]
    .filter((f) => f.fulfilmentPct != null)
    .sort((a, b) => (a.fulfilmentPct ?? 0) - (b.fulfilmentPct ?? 0));
  const fulfilmentBars = fulfilmentSorted.map((f) => ({
    label: f.district,
    value: Math.round(f.fulfilmentPct ?? 0),
    color: (f.fulfilmentPct ?? 0) < 80 ? C.red : (f.fulfilmentPct ?? 0) < 90 ? C.amber : C.green,
  }));
  const worstDistrict = fulfilmentSorted[0];
  const bestDistrict = fulfilmentSorted[fulfilmentSorted.length - 1];

  // ── Section 6: expiry ──────────────────────────────────────────────────────
  const expiryBars = expiry.map((e) => ({ label: e.label, value: e.valueInr }));
  const next3moLabels = new Set(['< 1 month', '1–3 months']);
  const expiryNext3mo = expiry
    .filter((e) => next3moLabels.has(e.label))
    .reduce((sum, e) => sum + e.valueInr, 0);
  const totalExpiryValue = expiry.reduce((sum, e) => sum + e.valueInr, 0);

  // ── Section 7: disease signal ──────────────────────────────────────────────
  const diseaseSeries = (disease?.series ?? []).map((p) => ({ x: p.month, y: p.cases }));

  return (
    <>
      <PageHeader title="Network Analytics" />

      <KpiBand columns={4}>
        <Kpi
          label="Ledger rows"
          value={summary ? num(summary.ledgerRows) : '—'}
          note={summary ? `${summary.horizon.from ?? '—'} – ${summary.horizon.to ?? '—'}` : undefined}
        />
        <Kpi
          label="Institutions"
          value={summary ? summary.institutions : '—'}
          note={summary ? `${summary.facilities} facilities + ${summary.warehouses} warehouses` : undefined}
        />
        <Kpi
          label="Below reorder"
          value={stockHealth ? stockHealth.belowReorder : '—'}
          deltaColor={stockHealth && stockHealth.belowReorder > 0 ? C.amber : C.grey}
        />
        <Kpi label="Districts" value={summary ? summary.districts : '—'} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        <Section>Demand — what's moving, and why</Section>

        {/* Consumption & seasonality */}
        <Card style={{ gridColumn: '1 / -1', animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <CardTitle
            right={
              <select
                value={drugId}
                onChange={(e) => setDrugId(e.target.value)}
                style={{
                  font: `500 11px/1.4 ${FONT}`,
                  color: C.ink,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  padding: '4px 8px',
                }}
              >
                {catalog.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            }
          >
            Consumption &amp; Seasonality
          </CardTitle>
          <div style={{ padding: 16 }}>
            {consumptionError ? (
              <ApiError error={consumptionError} />
            ) : !consumption || consumption.series.length === 0 ? (
              <Empty>No consumption data for this drug.</Empty>
            ) : (
              <>
                <MultiLineChart
                  series={[
                    {
                      name: 'Dispensed',
                      color: C.accent,
                      points: consumption.series.map((p) => ({ x: p.month, y: p.dispensed })),
                    },
                    {
                      name: 'True demand',
                      color: C.amber,
                      points: consumption.series.map((p) => ({ x: p.month, y: p.trueDemand })),
                    },
                  ]}
                />
                <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 10 }}>
                  {consumption.seasonality
                    ? `Peaks in ${consumption.seasonality.peakMonth}, troughs in ${consumption.seasonality.troughMonth} — a ${consumption.seasonality.ratio.toFixed(2)}x seasonality ratio. `
                    : ''}
                  The gap between dispensed and true demand is censored demand: when a facility stocks out, what it
                  dispensed understates what patients actually needed.
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Disease signal — the leading indicator behind demand spikes */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardTitle>Disease Signal</CardTitle>
          <div style={{ padding: 16 }}>
            {diseaseSeries.length === 0 ? (
              <Empty>No disease signal data.</Empty>
            ) : (
              <>
                <LineChart series={diseaseSeries} color={C.accent} showArea />
                <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 10 }}>
                  Lagged district disease cases are a top feature in the forecast model, so this regional signal
                  genuinely carries information.
                </div>
              </>
            )}
          </div>
        </Card>

        <Section>Supply — is the network keeping up</Section>

        {/* Supplier reliability vs price */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardTitle>Supplier Reliability vs Price</CardTitle>
          <div style={{ padding: 16 }}>
            {vendors.length === 0 ? (
              <Empty>No supplier data.</Empty>
            ) : (
              <>
                <ScatterPlot points={vendorPoints} xLabel="Price variance vs catalogue (%)" yLabel="On-time %" />
                {bestVendor && worstVendor && (
                  <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 10 }}>
                    {bestVendor.name} leads on-time delivery at {bestVendor.onTimePct.toFixed(0)}%, while{' '}
                    {worstVendor.name} trails at {worstVendor.onTimePct.toFixed(0)}%.
                  </div>
                )}
              </>
            )}
          </div>
          {vendors.length > 0 && (
            <Table head={['Supplier', 'On-time %', 'Avg delay', 'Price vs catalogue', 'Rejection %', 'POs']}>
              {vendors.map((v) => (
                <tr key={v.vendorId}>
                  <Td>{v.name}</Td>
                  <Td>
                    <Mono color={v.onTimePct >= 90 ? C.green : v.onTimePct >= 60 ? C.amber : C.red}>
                      {v.onTimePct.toFixed(0)}%
                    </Mono>
                  </Td>
                  <Td>
                    <Mono>{v.avgDelayDays.toFixed(1)}d</Mono>
                  </Td>
                  <Td>
                    <Mono color={v.priceVariancePct > 0 ? C.red : C.green}>
                      {v.priceVariancePct > 0 ? '+' : ''}
                      {v.priceVariancePct.toFixed(1)}%
                    </Mono>
                  </Td>
                  <Td>
                    <Mono color={v.rejectionRatePct > 5 ? C.red : C.inkMuted}>{v.rejectionRatePct.toFixed(1)}%</Mono>
                  </Td>
                  <Td>
                    <Mono>{v.pos}</Mono>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Stock health */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardTitle>Stock Health</CardTitle>
          <div style={{ padding: 16 }}>
            {!stockHealth || stockHealth.buckets.length === 0 ? (
              <Empty>No stock data.</Empty>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <PieChart
                    data={stockHealth.buckets.map((b, i) => ({
                      label: b.label,
                      value: b.count,
                      color: [C.red, C.amber, C.accent, C.green, C.grey][i % 5],
                    }))}
                    size={130}
                  />
                  <div style={{ display: 'grid', gap: 6 }}>
                    {stockHealth.buckets.map((b, i) => (
                      <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: [C.red, C.amber, C.accent, C.green, C.grey][i % 5],
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ font: `500 11px/1.3 ${FONT}`, color: C.inkMuted }}>
                          {b.label}{' '}
                          <span style={{ font: `500 11px/1.3 ${MONO}`, color: C.ink }}>
                            {b.count.toLocaleString('en-IN')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${C.borderSoft}`, paddingLeft: 24 }}>
                  <Histogram buckets={stockHealth.buckets} />
                </div>
              </div>
            )}
          </div>
          {stockHealth && stockHealth.critical.length > 0 && (
            <Table head={['Drug', 'Institution', 'District', 'Months of stock']}>
              {stockHealth.critical.slice(0, 10).map((row, i) => (
                <tr key={i}>
                  <Td>{row.drug}</Td>
                  <Td>{row.institution}</Td>
                  <Td>{row.district ?? '—'}</Td>
                  <Td>
                    <Mono color={C.red}>{row.monthsOfStock != null ? row.monthsOfStock.toFixed(1) : '—'}</Mono>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Section>Gaps — where that shortfall lands</Section>

        {/* District fulfilment — geographic gap */}
        <Card>
          <CardTitle>District Fulfilment</CardTitle>
          <div style={{ padding: 16 }}>
            {fulfilmentBars.length === 0 ? (
              <Empty>No fulfilment data.</Empty>
            ) : (
              <>
                <BarChart data={fulfilmentBars} horizontal valueFormat={(v) => `${v}%`} />
                {worstDistrict && bestDistrict && (
                  <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 10 }}>
                    {worstDistrict.district} fulfils {(worstDistrict.fulfilmentPct ?? 0).toFixed(0)}% of demand with{' '}
                    {worstDistrict.stockoutDays} stockout days, versus {bestDistrict.district} at{' '}
                    {(bestDistrict.fulfilmentPct ?? 0).toFixed(0)}% with {bestDistrict.stockoutDays} stockout days.
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Expiry risk — the waste gap */}
        <Card>
          <CardTitle>Expiry Risk</CardTitle>
          <div style={{ padding: 16 }}>
            {expiryBars.length === 0 ? (
              <Empty>No expiry data.</Empty>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 14 }}>
                  <PieChart
                    data={expiry.map((e, i) => ({
                      label: e.label,
                      value: e.valueInr,
                      color: [C.red, C.amber, C.accent, C.grey][i % 4],
                    }))}
                    size={120}
                  />
                  <div style={{ display: 'grid', gap: 5 }}>
                    {expiry.map((e, i) => (
                      <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: [C.red, C.amber, C.accent, C.grey][i % 4],
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ font: `500 11px/1.3 ${FONT}`, color: C.inkMuted }}>
                          {e.label}{' '}
                          <span style={{ font: `500 11px/1.3 ${MONO}`, color: C.ink }}>
                            {rupees(e.valueInr)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <BarChart data={expiryBars} valueFormat={(v) => rupees(v)} />
                <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 10 }}>
                  {rupees(expiryNext3mo || totalExpiryValue)} of stock value is at risk of expiry in the next 3
                  months.
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function num(n: number): string {
  return n.toLocaleString('en-IN');
}
