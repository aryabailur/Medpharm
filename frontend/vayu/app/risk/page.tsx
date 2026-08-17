'use client';

/**
 * Risk + Demand Forecast — multi-signal stockout risk, every flag drillable.
 *
 * There is no direct /api/risk endpoint on vayu-api: the risk model lives
 * behind the assistant, which assembles the same evidence bundle it narrates
 * from. We call askAssistant with a fixed natural-language question and read
 * evidence.data back out as structured rows — the UI never touches the LLM
 * output for anything but the (unused, here) prose answer.
 */

import { useEffect, useState } from 'react';

import { askAssistant } from '../../lib/api';
import { C, FONT, MONO, bandColors } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, PageHeader, Pill } from '../../components/ui';

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
  source: 'nidana' | 'fallback' | string;
}

function humanise(name: string): string {
  return name.replace(/_/g, ' ');
}

interface ForecastHistoryPoint {
  period: string;
  dispensed: number;
}

interface ForecastDriver {
  label: string;
  direction: 'up' | 'down';
  magnitude: number;
}

interface ForecastMetrics {
  mape: number | null;
  band_coverage_pct: number | null;
  band_coverage_target_pct: number | null;
  train_rows: number | null;
  holdout_rows: number | null;
}

interface ForecastRow {
  institution: string;
  district: string | null;
  drug: string;
  history: ForecastHistoryPoint[];
  point: number;
  p10: number;
  p90: number;
  drivers: ForecastDriver[];
  lastActual: number;
  changePct: number | null;
  source: 'nidana' | 'fallback' | string;
  metrics: ForecastMetrics | null;
}

/** Sparkline + forecast band, plain SVG. Guards against a flat series. */
function ForecastSparkline({ row }: { row: ForecastRow }) {
  const values = row.history.map((h) => h.dispensed);
  const allValues = [...values, row.p10, row.p90];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min;

  const historyX = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * 290 : 0);
  const y = (v: number) => (range === 0 ? 32 : 64 - ((v - min) / range) * 64);

  const points = values.map((v, i) => `${historyX(i)},${y(v)}`).join(' ');
  const p10Y = y(row.p10);
  const p90Y = y(row.p90);
  const pointY = y(row.point);

  return (
    <svg width="100%" height={64} viewBox="0 0 300 64" preserveAspectRatio="none">
      <line x1={290} y1={0} x2={290} y2={64} stroke={C.border} strokeWidth={1} />
      <rect x={290} y={Math.min(p10Y, p90Y)} width={10} height={Math.max(1, Math.abs(p90Y - p10Y))} fill={C.blueTint} />
      {values.length > 0 && <polyline points={points} fill="none" stroke={C.steel} strokeWidth={1.5} />}
      <circle cx={295} cy={pointY} r={3} fill={C.blue} />
    </svg>
  );
}

export default function RiskPage() {
  const [rows, setRows] = useState<RiskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [forecastRows, setForecastRows] = useState<ForecastRow[] | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await askAssistant('where are we about to stock out');
        const data = res.evidence?.data;
        setRows(Array.isArray(data) ? (data as RiskRow[]) : []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await askAssistant('what will we need next month');
        const data = res.evidence?.data;
        setForecastRows(Array.isArray(data) ? (data as ForecastRow[]) : []);
      } catch (e) {
        setForecastError((e as Error).message);
      } finally {
        setForecastLoading(false);
      }
    })();
  }, []);

  const critical = rows?.filter((r) => r.band === 'CRITICAL').length ?? 0;
  const high = rows?.filter((r) => r.band === 'HIGH').length ?? 0;
  const highConfidence = rows?.filter((r) => r.confidence === 'high').length ?? 0;

  return (
    <>
      <PageHeader title="Risk + Demand Forecast" subtitle="Multi-signal stockout risk, every flag drillable" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        {error ? (
          <ApiError error={error} />
        ) : loading ? (
          <Card style={{ padding: 18 }}>
            <div style={{ font: `400 13px/1.5 ${FONT}`, color: C.inkFaint }}>Loading risk signals…</div>
          </Card>
        ) : !rows || rows.length === 0 ? (
          <Card>
            <Empty>No institution is at elevated stockout risk.</Empty>
          </Card>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Kpi label="Flagged" value={rows.length} />
              <Kpi label="Critical" value={critical} deltaColor={C.red} />
              <Kpi label="High" value={high} deltaColor={C.amber} />
              <Kpi label="High confidence" value={highConfidence} note={`of ${rows.length}`} />
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {rows.map((row, i) => {
                const band = bandColors(row.band);
                const isOpen = expanded === i;
                return (
                  <Card key={`${row.institution}-${row.drug}-${i}`} style={{ overflow: 'hidden' }}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : i)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '14px 16px',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        gap: 12,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: `600 13px/1.4 ${FONT}`, color: C.ink }}>{row.institution}</div>
                        <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 2 }}>
                          {row.district} · {row.drug}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: C.greyTint,
                            color: C.inkFaint,
                            font: `600 10px/1.4 ${FONT}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {row.confidence} confidence
                        </span>
                        <span style={{ font: `600 20px/1 ${MONO}`, color: band.color }}>{row.score.toFixed(2)}</span>
                        <Pill label={row.band} color={band.color} tint={band.tint} />
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '4px 16px 16px', borderTop: `1px solid ${C.borderSoft}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0' }}>
                          <div style={{ font: `600 10px/1.4 ${FONT}`, color: C.inkGhost, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            Signals
                          </div>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: C.greyTint,
                              color: C.inkFaint,
                              font: `600 10px/1.2 ${MONO}`,
                            }}
                          >
                            source: {row.source}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                          {row.signals.map((s) => {
                            const pct = s.weight ? Math.max(0, Math.min(100, (s.contribution / s.weight) * 100)) : 0;
                            return (
                              <div key={s.name}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                  <span style={{ font: `600 12px/1.4 ${FONT}`, color: C.inkMuted, textTransform: 'capitalize' }}>
                                    {humanise(s.name)}
                                  </span>
                                  <span style={{ font: `500 11px/1.4 ${MONO}`, color: C.inkFaint }}>{s.value}</span>
                                </div>
                                <div style={{ background: C.steelTint, borderRadius: 4, height: 6, marginTop: 5, overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, background: C.steel, height: '100%', borderRadius: 4 }} />
                                </div>
                                <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
                                  {s.explanation}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 12 }}>
                          Confidence is signal agreement: high when at least 3 of 5 signals point the same way,
                          medium at 2, low at 1.
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}

        <div>
          <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink, marginTop: 28, marginBottom: 12 }}>
            Demand Forecast
          </div>
          <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: -8, marginBottom: 12 }}>
            Next-period demand with an 80% confidence band. Drivers are SHAP attributions, translated.
          </div>

          {forecastError ? (
            <ApiError error={forecastError} />
          ) : forecastLoading ? (
            <Card style={{ padding: 18 }}>
              <div style={{ font: `400 13px/1.5 ${FONT}`, color: C.inkFaint }}>Loading demand forecast…</div>
            </Card>
          ) : !forecastRows || forecastRows.length === 0 ? (
            <Card>
              <Empty>No forecast data is available.</Empty>
            </Card>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 12 }}>
                {forecastRows.slice(0, 6).map((row, i) => {
                  const rising = row.changePct !== null && row.changePct > 0;
                  const chipColor = row.changePct === null ? C.inkFaint : rising ? C.amber : C.green;
                  const chipTint = row.changePct === null ? C.greyTint : rising ? C.amberTint : C.greenTint;
                  return (
                    <Card key={`${row.institution}-${row.drug}-${i}`} style={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: `600 14px/1.4 ${FONT}`, color: C.ink }}>{row.drug}</div>
                          <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 2 }}>
                            {row.institution} · {row.district ?? 'Unknown district'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ font: `600 22px/1 ${FONT}`, color: C.ink }}>{row.point}</div>
                          <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkFaint, marginTop: 4 }}>
                            {row.p10} – {row.p90}
                          </div>
                          <span
                            style={{
                              display: 'inline-block',
                              marginTop: 6,
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: chipTint,
                              color: chipColor,
                              font: `600 10px/1.4 ${MONO}`,
                            }}
                          >
                            {row.changePct === null ? '—' : `${row.changePct > 0 ? '+' : ''}${row.changePct.toFixed(1)}%`}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <ForecastSparkline row={row} />
                      </div>

                      {row.drivers.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                          {row.drivers.map((d, di) => (
                            <span
                              key={`${d.label}-${di}`}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: C.greyTint,
                                color: C.inkMuted,
                                font: `400 11px/1.4 ${FONT}`,
                              }}
                            >
                              {d.direction === 'up' ? '↑' : '↓'} {d.label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.inkGhost, marginTop: 10 }}>
                        {row.metrics && row.metrics.train_rows !== null
                          ? `MAPE ${row.metrics.mape}% · band coverage ${row.metrics.band_coverage_pct}% of ${row.metrics.band_coverage_target_pct}% target · ${row.metrics.train_rows} train / ${row.metrics.holdout_rows} holdout · lightgbm`
                          : 'rolling-mean fallback · insufficient history to train'}
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 12 }}>
                Coverage is reported as measured, not tuned. On a short, strongly-trended series it varies —
                the row counts show why.
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
