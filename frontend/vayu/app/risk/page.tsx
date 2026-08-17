'use client';

/**
 * Risk + Forecast — stockout risk scoring and next-period demand forecast,
 * both surfaced through the assistant's evidence-bundle endpoint.
 */

import { useEffect, useState } from 'react';

import { askAssistant, getFulfilment, type FulfilmentRow } from '../../lib/api';
import { C, FONT, MONO, bandColors, rise } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty } from '../../components/ui';
import { BarChart, ForecastChart, Meter, SignalBars } from '../../components/charts';

interface RiskSignal {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
}

interface RiskRow {
  institution: string;
  district: string;
  drug: string;
  score: number;
  band: string;
  confidence: 'high' | 'medium' | 'low' | string;
  signals: RiskSignal[];
  source: string;
}

interface ForecastDriver {
  label: string;
  direction: 'RISING' | 'FALLING' | string;
  magnitude: number;
}

interface ForecastRow {
  institution: string;
  district: string;
  drug: string;
  history: Array<{ period: string; dispensed: number }>;
  point: number;
  p10: number;
  p90: number;
  drivers: ForecastDriver[];
  lastActual: number;
  changePct: number | null;
  source: string;
  metrics: {
    mape: number;
    band_coverage_pct: number;
    band_coverage_target_pct: number;
    train_rows: number;
    holdout_rows: number;
  } | null;
}

/** Plain-language labels for the SHAP feature names the forecast returns. */
function humanizeDriver(label: string): string {
  const key = label.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  const map: Record<string, string> = {
    'lag 1': "Last month's consumption",
    'lag1': "Last month's consumption",
    'lag 12': 'Same month last year',
    'lag12': 'Same month last year',
    'trend': 'Underlying demand trend',
    'seasonality': 'Seasonal pattern',
    'seasonal': 'Seasonal pattern',
    'month': 'Time of year',
    'rolling mean': 'Recent average consumption',
    'rolling std': 'Recent demand volatility',
    'stockout days': 'Recent stockout days',
    'onboarded': 'Institutions newly onboarded',
  };
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RiskPage() {
  const [riskData, setRiskData] = useState<RiskRow[] | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastRow[] | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [coverage, setCoverage] = useState<FulfilmentRow[] | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await askAssistant('where are we about to stock out');
        setRiskData((res.evidence.data as RiskRow[]) ?? []);
      } catch (e) {
        setRiskError((e as Error).message);
      }
    })();
    (async () => {
      try {
        const res = await askAssistant('what will we need next month');
        setForecastData((res.evidence.data as ForecastRow[]) ?? []);
      } catch (e) {
        setForecastError((e as Error).message);
      }
    })();
    (async () => {
      try {
        const res = await getFulfilment();
        setCoverage(res.items);
      } catch (e) {
        setCoverageError((e as Error).message);
      }
    })();
  }, []);

  const top = (riskData ?? [])[selected] ?? null;
  const forecast = (forecastData ?? [])[selected] ?? (forecastData ?? [])[0] ?? null;

  const bc = top ? bandColors(top.band) : { color: C.grey, tint: C.greyTint };
  const signals =
    top?.signals.map((s) => {
      const pct = s.weight !== 0 ? Math.max(0, Math.min(100, (s.contribution / s.weight) * 100)) : 0;
      const sc = pct >= 66 ? C.red : pct >= 40 ? C.amber : C.green;
      return { label: humanizeDriver(s.name), value: s.value.toFixed(2), pct, color: sc, note: s.explanation };
    }) ?? [];

  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long' });

  const history = forecast?.history.map((h) => ({ x: h.period, y: h.dispensed })) ?? [];
  const forecastPoints = forecast ? [{ x: 'Next', y: forecast.point }] : [];
  const band = forecast ? [{ hi: forecast.p90, lo: forecast.p10 }] : [];
  const drivers =
    forecast?.drivers.map((d) => ({
      label: humanizeDriver(d.label),
      value: d.magnitude,
      color: d.direction === 'RISING' ? C.red : d.direction === 'FALLING' ? C.green : C.accent,
    })) ?? [];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 24, padding: '26px 26px 0' }}>
        <Card style={{ borderLeft: `2px solid ${C.red}`, animation: rise(0) }}>
          <CardTitle>Nidana · risk drilldown</CardTitle>
          <div style={{ padding: 20 }}>
            {riskError ? (
              <ApiError error={riskError} />
            ) : riskData === null ? (
              <Empty>Loading…</Empty>
            ) : !top ? (
              <Empty>No stockout risk detected.</Empty>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ font: `600 16px/1.35 ${FONT}`, color: C.ink }}>
                      {top.drug} · {top.district}
                    </div>
                    <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 5, maxWidth: 320 }}>
                      Confidence is signal agreement, not model certainty: {top.confidence} confidence means{' '}
                      {top.confidence === 'high' ? 'at least 3 of 5' : top.confidence === 'medium' ? '2 of 5' : '1 of 5'}{' '}
                      signals point the same way.
                    </div>
                  </div>
                  <div style={{ font: `600 52px/1 ${MONO}`, letterSpacing: '-.05em', color: bc.color }}>
                    {Math.round(top.score)}
                  </div>
                </div>

                {(riskData ?? []).length > 1 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
                    {(riskData ?? []).slice(0, 8).map((r, i) => (
                      <button
                        key={i}
                        onClick={() => setSelected(i)}
                        style={{
                          padding: '4px 8px',
                          border: `1px solid ${i === selected ? C.ink : C.border}`,
                          borderRadius: 3,
                          background: i === selected ? C.ink : C.surface,
                          color: i === selected ? C.bg : C.inkMuted,
                          font: `500 10px/1.4 ${MONO}`,
                          cursor: 'pointer',
                        }}
                      >
                        {r.institution.slice(0, 14)}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <SignalBars signals={signals} />
                </div>
              </>
            )}
          </div>
        </Card>

        <Card style={{ animation: rise(60) }}>
          <CardTitle
            right={
              forecast?.metrics && (
                <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkMuted }}>MAPE {forecast.metrics.mape}%</span>
              )
            }
          >
            Demand forecast{forecast ? ` · ${forecast.drug}` : ''}
          </CardTitle>
          <div style={{ padding: 20 }}>
            {forecastError ? (
              <ApiError error={forecastError} />
            ) : forecastData === null ? (
              <Empty>Loading…</Empty>
            ) : !forecast ? (
              <Empty>No forecast data available.</Empty>
            ) : (
              <>
                <ForecastChart history={history} forecast={forecastPoints} band={band} yFormat={(v) => Math.round(v).toLocaleString('en-IN')} />
                <div style={{ borderTop: `1px solid ${C.borderSoft}`, marginTop: 12, paddingTop: 12 }}>
                  <div
                    style={{
                      font: `600 11px/1 ${FONT}`,
                      letterSpacing: '.17em',
                      textTransform: 'uppercase',
                      color: C.inkFaint,
                      marginBottom: 10,
                    }}
                  >
                    Why the model says this
                  </div>
                  {drivers.length === 0 ? (
                    <Empty>No driver attribution available.</Empty>
                  ) : (
                    <BarChart data={drivers} valueFormat={(v) => `${v > 0 ? '+' : ''}${v}%`} />
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div style={{ padding: '26px 26px 52px' }}>
        <Card style={{ overflowX: 'auto', animation: rise(100) }}>
          <CardTitle>Coverage gaps · {monthLabel}</CardTitle>
          {coverageError ? (
            <div style={{ padding: 16 }}>
              <ApiError error={coverageError} />
            </div>
          ) : coverage === null ? (
            <Empty>Loading…</Empty>
          ) : coverage.length === 0 ? (
            <Empty>No fulfilment data available.</Empty>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
              <thead>
                <tr>
                  {['District', 'Forecast', 'Committed', 'Coverage'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? 'left' : i === 3 ? 'left' : 'right',
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
                {coverage.map((row, i) => {
                  const pct = row.fulfilmentPct ?? 0;
                  const gapUnits = row.dispensed - row.trueDemand;
                  const gc = pct >= 90 ? C.green : pct >= 70 ? C.amber : C.red;
                  return (
                    <tr key={i}>
                      <td style={{ ...cellText, fontWeight: 500 }}>{row.district}</td>
                      <td style={cellNum}>{Math.round(row.trueDemand).toLocaleString('en-IN')}</td>
                      <td style={{ ...cellNum, color: C.inkMuted, fontWeight: 400 }}>
                        {Math.round(row.dispensed).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <Meter pct={pct} color={gc} width={140} thickness={6} />
                          <span style={{ font: `500 12px/1 ${MONO}`, color: gc }}>
                            {gapUnits >= 0 ? '+' : ''}
                            {Math.round(gapUnits).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

const cellText = {
  padding: '15px 18px',
  font: `400 14px/1.6 ${FONT}`,
  color: C.ink,
  borderBottom: `1px solid ${C.borderSoft}`,
  verticalAlign: 'top' as const,
};

const cellNum = {
  padding: '15px 18px',
  font: `500 14px/1.4 ${MONO}`,
  color: C.ink,
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
  borderBottom: `1px solid ${C.borderSoft}`,
  verticalAlign: 'top' as const,
};
