'use client';

/**
 * Network Analytics — charting surface over /api/analytics.
 *
 * All six analytics endpoints are fetched in parallel on mount. The drug
 * picker re-fetches only /consumption; the rest load once. Every chart is
 * inline SVG (components/charts.tsx) — no chart library, no CSS files.
 */

import { useEffect, useState } from 'react';

import {
  getCatalog,
  getConsumption,
  getDiseaseSignal,
  getExpiry,
  getFulfilment,
  getAnalyticsSummary,
  getStockHealth,
  getVendorAnalytics,
  type ConsumptionResponse,
  type Drug,
} from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, PageHeader, Table, Td } from '../../components/ui';
import { BarChart, Histogram, LineChart, MultiLineChart, ScatterPlot } from '../../components/charts';
import type {
  CriticalStockRow,
  DiseasePoint,
  ExpiryBucket,
  FulfilmentRow,
  StockHealthBucket,
  VendorMetric,
} from '../../lib/api';

const DEFAULT_DRUG_ID = 'DRG002';

function fmtLakhs(n: number): string {
  return `₹${(n / 100000).toFixed(1)}L`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drugs, setDrugs] = useState<Array<Pick<Drug, 'id' | 'name'>>>([]);
  const [drugId, setDrugId] = useState(DEFAULT_DRUG_ID);
  const [consumption, setConsumption] = useState<ConsumptionResponse | null>(null);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [consumptionLoading, setConsumptionLoading] = useState(true);

  const [vendors, setVendors] = useState<VendorMetric[]>([]);
  const [fulfilment, setFulfilment] = useState<{ windowMonths: number; items: FulfilmentRow[] } | null>(null);
  const [stockHealth, setStockHealth] = useState<{
    totalLines: number;
    belowReorder: number;
    buckets: StockHealthBucket[];
    critical: CriticalStockRow[];
  } | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getAnalyticsSummary>> | null>(null);
  const [expiry, setExpiry] = useState<ExpiryBucket[]>([]);
  const [disease, setDisease] = useState<{ series: DiseasePoint[] } | null>(null);

  // Initial parallel load: catalog (for the picker) + the five endpoints that
  // don't depend on the drug selection, + consumption for the default drug.
  useEffect(() => {
    void (async () => {
      try {
        const [summaryRes, catalog, ven, fulf, stock, exp, dis, cons] = await Promise.all([
          getAnalyticsSummary(),
          getCatalog('?take=200'),
          getVendorAnalytics(),
          getFulfilment(),
          getStockHealth(),
          getExpiry(),
          getDiseaseSignal(),
          getConsumption(DEFAULT_DRUG_ID),
        ]);
        setDrugs(catalog.items.map((d) => ({ id: d.id, name: d.name })));
        setVendors(ven.items);
        setFulfilment(fulf);
        setSummary(summaryRes);
        setStockHealth(stock);
        setExpiry(exp.buckets);
        setDisease(dis);
        setConsumption(cons);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setConsumptionLoading(false);
      }
    })();
  }, []);

  // Re-fetch consumption whenever the picker changes (after the initial load).
  useEffect(() => {
    if (loading) return;
    setConsumptionLoading(true);
    setConsumptionError(null);
    void (async () => {
      try {
        const cons = await getConsumption(drugId);
        setConsumption(cons);
      } catch (e) {
        setConsumptionError((e as Error).message);
      } finally {
        setConsumptionLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drugId]);

  const subtitleText = summary
    ? `${summary.horizon.from} – ${summary.horizon.to} · ${summary.ledgerRows.toLocaleString()} ledger rows across ${summary.institutions} institutions`
    : 'Simulated supply chain across the institution network';

  if (error) {
    return (
      <>
        <PageHeader
          title="Network Analytics"
          subtitle={subtitleText}
        />
        <div style={{ padding: 28 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Network Analytics"
          subtitle={subtitleText}
        />
        <div style={{ padding: 28 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ font: `400 13px/1.5 ${FONT}`, color: C.inkFaint }}>Loading network analytics…</div>
          </Card>
        </div>
      </>
    );
  }

  // Real network counts from /api/analytics/summary, not inferred from
  // whatever rows another response happened to return.
  const totalLedgerRows = summary?.ledgerRows ?? 0;
  const institutionCount = summary?.institutions ?? 0;
  const belowReorder = stockHealth?.belowReorder ?? 0;
  const districtCount = summary?.districts ?? 0;

  const worstDistrict = fulfilment?.items[0];
  const bestDistrict = fulfilment?.items[fulfilment.items.length - 1];

  const totalExpiryValue3mo = expiry
    .filter((b) => b.label === 'Expired' || b.label === '< 1 month' || b.label === '1–3 months')
    .reduce((a, b) => a + b.valueInr, 0);

  return (
    <>
      <PageHeader
        title="Network Analytics"
        subtitle={subtitleText}
      />

      <div style={{ padding: 28, display: 'grid', gap: 24 }}>
        {/* 1. KPI row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi
            label="Ledger rows"
            value={totalLedgerRows.toLocaleString()}
            note={summary ? `${summary.horizon.from} – ${summary.horizon.to}` : undefined}
          />
          <Kpi
            label="Institutions"
            value={institutionCount || '—'}
            note={summary ? `${summary.facilities} facilities + ${summary.warehouses} warehouses` : undefined}
          />
          <Kpi label="Below reorder point" value={belowReorder} deltaColor={C.amber} />
          <Kpi label="Districts covered" value={districtCount} />
        </div>

        {/* 2. Consumption & Seasonality */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink }}>Consumption &amp; Seasonality</div>
            <select
              value={drugId}
              onChange={(e) => setDrugId(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: C.surface,
                color: C.ink,
                font: `500 12px/1.2 ${FONT}`,
              }}
            >
              {drugs.length === 0 ? (
                <option value={DEFAULT_DRUG_ID}>{DEFAULT_DRUG_ID}</option>
              ) : (
                drugs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <Card style={{ padding: 16 }}>
            {consumptionError ? (
              <ApiError error={consumptionError} />
            ) : consumptionLoading ? (
              <div style={{ font: `400 13px/1.5 ${FONT}`, color: C.inkFaint }}>Loading consumption…</div>
            ) : !consumption || consumption.series.length === 0 ? (
              <Empty>No consumption data for this drug.</Empty>
            ) : (
              <>
                <MultiLineChart
                  series={[
                    {
                      name: 'Dispensed',
                      color: C.steel,
                      points: consumption.series.map((p) => ({ x: p.month, y: p.dispensed })),
                    },
                    {
                      name: 'True demand',
                      color: C.amber,
                      points: consumption.series.map((p) => ({ x: p.month, y: p.trueDemand })),
                    },
                  ]}
                />
                <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 10 }}>
                  {consumption.seasonality
                    ? `Peaks ${consumption.seasonality.peakMonth}, troughs ${consumption.seasonality.troughMonth} — a ${consumption.seasonality.ratio}x swing.`
                    : 'Not enough history to establish a seasonal swing.'}
                </div>
                <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 6 }}>
                  The gap between dispensed and true demand is censored demand: when a facility stocks out,
                  what it dispensed understates what patients actually needed.
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 3. Supplier Reliability vs Price */}
        <div>
          <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink, marginBottom: 12 }}>
            Supplier Reliability vs Price
          </div>
          <Card style={{ padding: 16 }}>
            {vendors.length === 0 ? (
              <Empty>No vendor purchase orders on record.</Empty>
            ) : (
              <>
                <ScatterPlot
                  xLabel="Price variance vs catalogue (%)"
                  yLabel="On-time delivery (%)"
                  points={vendors.map((v) => ({
                    x: v.priceVariancePct,
                    y: v.onTimePct,
                    label: v.vendorId,
                    color: v.onTimePct >= 90 ? C.green : v.onTimePct >= 60 ? C.amber : C.red,
                  }))}
                />
                <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 10 }}>
                  The tradeoff is the point. VEN04 delivers 98.8% on time at 24% above catalogue price; VEN03
                  is 14% cheaper and arrives on time 22% of the time.
                </div>

                <div style={{ marginTop: 16, overflowX: 'auto' }}>
                  <Table head={['Vendor', 'On-time %', 'Avg delay', 'Price vs catalogue', 'Rejection %', 'POs']}>
                    {vendors.map((v) => (
                      <tr key={v.vendorId}>
                        <Td>{v.vendorId}</Td>
                        <Td>{v.onTimePct.toFixed(1)}%</Td>
                        <Td>{v.avgDelayDays.toFixed(1)}d</Td>
                        <Td>
                          {v.priceVariancePct > 0 ? '+' : ''}
                          {v.priceVariancePct.toFixed(1)}%
                        </Td>
                        <Td>{v.rejectionRatePct.toFixed(2)}%</Td>
                        <Td>{v.pos}</Td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 4. District Fulfilment */}
        <div>
          <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink, marginBottom: 12 }}>District Fulfilment</div>
          <Card style={{ padding: 16 }}>
            {!fulfilment || fulfilment.items.length === 0 ? (
              <Empty>No fulfilment data available.</Empty>
            ) : (
              <>
                <BarChart
                  horizontal
                  valueFormat={(n) => fmtPct(n)}
                  data={fulfilment.items.map((f) => ({
                    label: f.district,
                    value: f.fulfilmentPct ?? 0,
                    color:
                      (f.fulfilmentPct ?? 0) < 80 ? C.red : (f.fulfilmentPct ?? 0) < 90 ? C.amber : C.green,
                  }))}
                />
                {worstDistrict && bestDistrict && (
                  <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 10 }}>
                    {worstDistrict.district} is worst-served ({worstDistrict.stockoutDays} stockout days);{' '}
                    {bestDistrict.district} is best-served ({bestDistrict.stockoutDays} stockout days).
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* 5. Stock Health */}
        <div>
          <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink, marginBottom: 12 }}>Stock Health</div>
          <Card style={{ padding: 16 }}>
            {!stockHealth || stockHealth.buckets.length === 0 ? (
              <Empty>No stock data available.</Empty>
            ) : (
              <>
                <Histogram buckets={stockHealth.buckets} color={C.steel} />
                <div style={{ marginTop: 16, overflowX: 'auto' }}>
                  <Table head={['Drug', 'Institution', 'District', 'Months of stock']}>
                    {stockHealth.critical.length === 0 ? (
                      <tr>
                        <Td style={{ textAlign: 'center' }}>
                          <span style={{ color: C.inkGhost }}>Nothing below reorder point.</span>
                        </Td>
                      </tr>
                    ) : (
                      stockHealth.critical.slice(0, 10).map((c, i) => (
                        <tr key={`${c.drug}-${c.institution}-${i}`}>
                          <Td>{c.drug}</Td>
                          <Td>{c.institution}</Td>
                          <Td>{c.district ?? 'Unknown'}</Td>
                          <Td>{c.monthsOfStock === null ? '—' : c.monthsOfStock.toFixed(1)}</Td>
                        </tr>
                      ))
                    )}
                  </Table>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 6. Expiry Risk */}
        <div>
          <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink, marginBottom: 12 }}>Expiry Risk</div>
          <Card style={{ padding: 16 }}>
            {expiry.length === 0 ? (
              <Empty>No batch expiry data available.</Empty>
            ) : (
              <>
                <BarChart
                  valueFormat={fmtLakhs}
                  data={expiry.map((b) => ({
                    label: b.label,
                    value: b.valueInr,
                    color: b.label === 'Expired' ? C.red : b.label === '< 1 month' ? C.amber : C.steel,
                  }))}
                />
                <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 10 }}>
                  {fmtLakhs(totalExpiryValue3mo)} in stock value is at risk of expiring within the next 3
                  months.
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 7. Disease Signal */}
        <div>
          <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink, marginBottom: 12 }}>Disease Signal</div>
          <Card style={{ padding: 16 }}>
            {!disease || disease.series.length === 0 ? (
              <Empty>No disease signal data available.</Empty>
            ) : (
              <>
                <LineChart
                  series={disease.series.map((p) => ({ x: p.month, y: p.cases }))}
                  color={C.blue}
                  showArea
                  yLabel="Monthly cases, all tracked diseases and districts"
                />
                <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 10 }}>
                  Lagged district disease cases are a top feature in the forecast model, so this regional
                  signal genuinely carries information.
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
