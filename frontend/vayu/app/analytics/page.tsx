'use client';

/**
 * Network Analytics — supply-chain-wide aggregates: consumption, supplier
 * reliability, district fulfilment, stock health, expiry risk, disease signal.
 *
 * The widest-angle screen in the product: every panel here draws on the
 * 88k-row ledger (`/api/analytics/summary`), so this is the best showcase of
 * the 4-year horizon of real data.
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
import { C, FONT, LABEL, MONO, rise, rupees, SERIES } from '../../lib/theme';
import { ApiError, EmptyState, KpiHero, PageHeader, Panel, PanelTitle, SkeletonRows, Trend } from '../../components/ui';
import {
  BarChart,
  GaugeArc,
  GroupedBarChart,
  LineChart,
  MultiLineChart,
  PieChart,
  ScatterPlot,
} from '../../components/charts';

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
          <SkeletonRows rows={8} />
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
  const vendorGrouped = vendors.map((v) => ({
    label: v.vendorId,
    values: [v.onTimePct, v.rejectionRatePct],
  }));
  const networkOnTimeAvg = vendors.length
    ? vendors.reduce((a, v) => a + v.onTimePct * v.pos, 0) / vendors.reduce((a, v) => a + v.pos, 0)
    : 0;

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
  const networkFulfilmentAvg = fulfilment.length
    ? fulfilment.reduce((a, f) => a + (f.fulfilmentPct ?? 0), 0) / fulfilment.length
    : 0;

  // ── Section 6: expiry ──────────────────────────────────────────────────────
  const expiryBars = expiry.map((e) => ({ label: e.label, value: e.valueInr }));
  const next3moLabels = new Set(['< 1 month', '1–3 months']);
  const expiryNext3mo = expiry
    .filter((e) => next3moLabels.has(e.label))
    .reduce((sum, e) => sum + e.valueInr, 0);
  const totalExpiryValue = expiry.reduce((sum, e) => sum + e.valueInr, 0);

  // ── Section 7: disease signal ──────────────────────────────────────────────
  const diseaseSeries = (disease?.series ?? []).map((p) => ({ x: p.month, y: p.cases }));
  const outbreakMonths = disease?.outbreakMonths ?? 0;

  const belowReorderPct = stockHealth && stockHealth.totalLines > 0
    ? (stockHealth.belowReorder / stockHealth.totalLines) * 100
    : 0;

  return (
    <>
      <PageHeader
        title="Network Analytics"
        subtitle="Every panel below draws on the 88k-row ledger — nothing here is estimated."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero
          index={0}
          label="Ledger rows"
          value={summary ? num(summary.ledgerRows) : '—'}
          accent={C.accent}
          sub={summary ? `${summary.horizon.from ?? '—'} – ${summary.horizon.to ?? '—'}` : undefined}
        />
        <KpiHero
          index={1}
          label="Institutions"
          value={summary ? summary.institutions : '—'}
          accent={SERIES[1]}
          sub={summary ? `${summary.facilities} facilities + ${summary.warehouses} warehouses` : undefined}
        />
        <KpiHero
          index={2}
          label="Below reorder"
          value={stockHealth ? stockHealth.belowReorder : '—'}
          accent={C.amber}
          trend={stockHealth ? <Trend value={Math.round(belowReorderPct)} suffix="%" goodDirection="down" /> : undefined}
          sub={stockHealth ? `of ${stockHealth.totalLines} lines` : undefined}
        />
        <KpiHero label="Districts" index={3} value={summary ? summary.districts : '—'} accent={SERIES[3]} />
      </div>

      <div style={{ padding: 26, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        <Section>Demand — what's moving, and why</Section>

        {/* Consumption & seasonality */}
        <Panel accent={C.accent} delayMs={0} style={{ gridColumn: '1 / -1' }}>
          <PanelTitle
            dot={C.accent}
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
          </PanelTitle>
          <div style={{ padding: 16 }}>
            {consumptionError ? (
              <ApiError error={consumptionError} />
            ) : !consumption || consumption.series.length === 0 ? (
              <EmptyState title="No consumption data" hint="No consumption series recorded for this drug." />
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
        </Panel>

        {/* Disease signal — the leading indicator behind demand spikes */}
        <Panel accent={SERIES[4]} delayMs={40} style={{ gridColumn: '1 / -1' }}>
          <PanelTitle dot={SERIES[4]} right={outbreakMonths > 0 ? <span style={{ font: `600 11px/1 ${MONO}`, color: C.red }}>{outbreakMonths} outbreak months</span> : undefined}>
            Disease Signal
          </PanelTitle>
          <div style={{ padding: 16 }}>
            {diseaseSeries.length === 0 ? (
              <EmptyState title="No disease signal" hint="No disease signal data available." />
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
        </Panel>

        <Section>Supply — is the network keeping up</Section>

        {/* Supplier reliability vs price */}
        <Panel accent={SERIES[2]} delayMs={0} style={{ gridColumn: '1 / -1' }}>
          <PanelTitle dot={SERIES[2]}>Supplier Reliability vs Price</PanelTitle>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center' }}>
            <GaugeArc value={Math.round(networkOnTimeAvg)} label="Network on-time" size={160} />
            <div>
              {vendors.length === 0 ? (
                <EmptyState title="No supplier data" hint="No supplier metrics available." />
              ) : (
                <>
                  <ScatterPlot points={vendorPoints} xLabel="Price variance vs catalogue (%)" yLabel="On-time %" />
                  {bestVendor && worstVendor && (
                    <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 10 }}>
                      {bestVendor.name} leads on-time delivery at {bestVendor.onTimePct.toFixed(0)}% over {bestVendor.pos} POs, while{' '}
                      {worstVendor.name} trails at {worstVendor.onTimePct.toFixed(0)}% over {worstVendor.pos} POs.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {vendors.length > 0 && (
            <div style={{ padding: '0 16px 20px' }}>
              <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost, marginBottom: 10 }}>
                On-time % vs rejection %
              </div>
              <GroupedBarChart
                data={vendorGrouped}
                seriesNames={['On-time %', 'Rejection %']}
                colors={[C.accent, C.red]}
                valueFormat={(v) => `${v.toFixed(1)}%`}
              />
            </div>
          )}
          {vendors.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Supplier', 'On-time %', 'Avg delay', 'Price vs catalogue', 'Rejection %', 'POs'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        ...LABEL,
                        padding: '8px 14px',
                        borderBottom: `1px solid ${C.borderSoft}`,
                        background: C.surfaceAlt,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.vendorId}>
                    <td style={tdStyle}>{v.name}</td>
                    <td style={tdStyle}>
                      <span style={{ font: `500 12px/1.4 ${MONO}`, color: v.onTimePct >= 90 ? C.green : v.onTimePct >= 60 ? C.amber : C.red }}>
                        {v.onTimePct.toFixed(0)}%
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ font: `500 12px/1.4 ${MONO}`, color: C.ink }}>{v.avgDelayDays.toFixed(1)}d</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ font: `500 12px/1.4 ${MONO}`, color: v.priceVariancePct > 0 ? C.red : C.green }}>
                        {v.priceVariancePct > 0 ? '+' : ''}
                        {v.priceVariancePct.toFixed(1)}%
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ font: `500 12px/1.4 ${MONO}`, color: v.rejectionRatePct > 5 ? C.red : C.inkMuted }}>
                        {v.rejectionRatePct.toFixed(1)}%
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ font: `500 12px/1.4 ${MONO}`, color: C.ink }}>{v.pos}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Stock health */}
        <Panel accent={C.red} delayMs={40} style={{ gridColumn: '1 / -1' }}>
          <PanelTitle dot={C.red}>Stock Health</PanelTitle>
          <div style={{ padding: 16 }}>
            {!stockHealth || stockHealth.buckets.length === 0 ? (
              <EmptyState title="No stock data" hint="No stock health data available." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <PieChart
                    data={stockHealth.buckets.map((b, i) => ({
                      label: b.label,
                      value: b.count,
                      color: SERIES[i % SERIES.length],
                    }))}
                    size={130}
                    centre={num(stockHealth.buckets.reduce((a, b) => a + b.count, 0))}
                  />
                  <div style={{ display: 'grid', gap: 6 }}>
                    {stockHealth.buckets.map((b, i) => (
                      <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: SERIES[i % SERIES.length],
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
                  <BarChart
                    data={stockHealth.buckets.map((b, i) => ({ label: b.label, value: b.count, color: SERIES[i % SERIES.length] }))}
                  />
                </div>
              </div>
            )}
          </div>
          {stockHealth && stockHealth.critical.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Drug', 'ABC', 'Institution', 'District', 'Months of stock'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        ...LABEL,
                        padding: '8px 14px',
                        borderBottom: `1px solid ${C.borderSoft}`,
                        background: C.surfaceAlt,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockHealth.critical.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{row.drug}</td>
                    <td style={tdStyle}>
                      {row.abcClass ? (
                        <span
                          style={{
                            font: `600 10px/1.5 ${MONO}`,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: row.abcClass === 'A' ? C.redTint : row.abcClass === 'B' ? C.amberTint : C.greyTint,
                            color: row.abcClass === 'A' ? C.red : row.abcClass === 'B' ? C.amber : C.grey,
                          }}
                        >
                          {row.abcClass}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={tdStyle}>{row.institution}</td>
                    <td style={tdStyle}>{row.district ?? '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ font: `500 12px/1.4 ${MONO}`, color: C.red }}>
                        {row.monthsOfStock != null ? row.monthsOfStock.toFixed(1) : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Section>Gaps — where that shortfall lands</Section>

        {/* District fulfilment — geographic gap */}
        <Panel accent={C.amber} delayMs={0}>
          <PanelTitle dot={C.amber} right={<GaugeArcInline value={networkFulfilmentAvg} />}>
            District Fulfilment
          </PanelTitle>
          <div style={{ padding: 16 }}>
            {fulfilmentBars.length === 0 ? (
              <EmptyState title="No fulfilment data" hint="No district fulfilment data available." />
            ) : (
              <>
                <BarChart data={fulfilmentBars} valueFormat={(v) => `${v}%`} />
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
        </Panel>

        {/* Expiry risk — the waste gap */}
        <Panel accent={C.grey} delayMs={40}>
          <PanelTitle dot={C.grey}>Expiry Risk</PanelTitle>
          <div style={{ padding: 16 }}>
            {expiryBars.length === 0 ? (
              <EmptyState title="No expiry data" hint="No expiry-horizon data available." />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 14 }}>
                  <PieChart
                    data={expiry.map((e, i) => ({
                      label: e.label,
                      value: e.valueInr,
                      color: SERIES[i % SERIES.length],
                    }))}
                    size={120}
                    centre={rupees(expiry.reduce((a, e) => a + e.valueInr, 0))}
                  />
                  <div style={{ display: 'grid', gap: 5 }}>
                    {expiry.map((e, i) => (
                      <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: SERIES[i % SERIES.length],
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
        </Panel>
      </div>
    </>
  );
}

/** Small inline completion ring for a panel header — reuses ProgressRing's math via GaugeArc's smaller sibling. */
function GaugeArcInline({ value }: { value: number }) {
  const color = value >= 90 ? C.green : value >= 80 ? C.amber : C.red;
  return (
    <span style={{ font: `600 12px/1 ${MONO}`, color }}>
      {value ? `${value.toFixed(1)}% network avg` : ''}
    </span>
  );
}

function num(n: number): string {
  return n.toLocaleString('en-IN');
}

const tdStyle = {
  padding: '10px 14px',
  font: `400 13px/1.45 ${FONT}`,
  color: C.inkMuted,
  borderBottom: `1px solid ${C.borderSoft}`,
  verticalAlign: 'middle' as const,
};
