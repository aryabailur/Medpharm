'use client';

/**
 * Risk + Forecast — stockout risk scoring and next-period demand forecast,
 * both surfaced through the assistant's evidence-bundle endpoint.
 */

import { useEffect, useState } from 'react';

import { askAssistant } from '../../lib/api';
import { C, FONT, MONO, bandColors } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, KpiBand, PageHeader } from '../../components/ui';
import { Sparkline } from '../../components/charts';

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

function labelize(name: string): string {
  return name.replace(/_/g, ' ');
}

export default function RiskPage() {
  const [riskData, setRiskData] = useState<RiskRow[] | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastRow[] | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await askAssistant('where are we about to stock out');
        if (!cancelled) setRiskData((res.evidence.data as RiskRow[]) ?? []);
      } catch (e) {
        if (!cancelled) setRiskError((e as Error).message);
      }

      // Forecast trains a LightGBM model (point + two quantile regressors)
      // per pair and is genuinely slow no matter how few pairs are asked
      // for — firing it in parallel with risk just makes both sections sit
      // on "Loading…" together. Fetch it lazily, after risk has already
      // rendered, so the page shows something in under a second.
      if (cancelled) return;
      try {
        const res = await askAssistant('what will we need next month');
        if (!cancelled) setForecastData((res.evidence.data as ForecastRow[]) ?? []);
      } catch (e) {
        if (!cancelled) setForecastError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = (riskData ?? []).slice(0, 8);
  const critical = (riskData ?? []).filter((r) => r.band === 'CRITICAL').length;
  const high = (riskData ?? []).filter((r) => r.band === 'HIGH').length;
  const highConfidence = (riskData ?? []).filter((r) => r.confidence === 'high').length;

  const forecastRows = (forecastData ?? []).slice(0, 6);

  return (
    <>
      <PageHeader title="Risk + Demand Forecast" />

      {riskData && !riskError && (
        <KpiBand columns={4}>
          <Kpi label="Flagged" value={riskData.length} />
          <Kpi label="Critical" value={critical} deltaColor={critical ? C.red : C.grey} />
          <Kpi label="High" value={high} deltaColor={high ? C.amber : C.grey} />
          <Kpi label="High confidence" value={highConfidence} deltaColor={C.accent} />
        </KpiBand>
      )}

      <div style={{ padding: 26, display: 'grid', gap: 28 }}>
        <section style={{ display: 'grid', gap: 14, animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>Stockout Risk</div>

          {riskError ? (
            <ApiError error={riskError} />
          ) : riskData === null ? (
            <Empty>Loading…</Empty>
          ) : (
            <>
              {rows.length === 0 ? (
                <Empty>No stockout risk detected.</Empty>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {rows.map((r, i) => {
                    const bc = bandColors(r.band);
                    const isOpen = expanded === i;
                    return (
                      <Card key={i} style={{ padding: 0 }}>
                        <button
                          onClick={() => setExpanded(isOpen ? null : i)}
                          style={{
                            display: 'flex',
                            width: '100%',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '12px 16px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <div>
                            <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>{r.institution}</div>
                            <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkSoft, marginTop: 2 }}>
                              {r.district} · {r.drug}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ font: `500 20px/1 ${MONO}`, color: C.ink }}>{r.score.toFixed(2)}</span>
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: 4,
                                background: bc.tint,
                                color: bc.color,
                                font: `600 10px/1.5 ${MONO}`,
                                letterSpacing: '.04em',
                              }}
                            >
                              {r.band}
                            </span>
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: 4,
                                background: C.greyTint,
                                color: C.inkSoft,
                                font: `500 10px/1.5 ${FONT}`,
                              }}
                            >
                              {r.confidence} confidence
                            </span>
                          </div>
                        </button>

                        {isOpen && (
                          <div style={{ padding: '4px 16px 16px', borderTop: `1px solid ${C.borderSoft}` }}>
                            <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                              {r.signals.map((s, j) => {
                                const pct = s.weight !== 0 ? Math.max(0, Math.min(1, s.contribution / s.weight)) : 0;
                                return (
                                  <div key={j}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                                      <span style={{ font: `500 11px/1.4 ${FONT}`, color: C.inkMuted, textTransform: 'capitalize' }}>
                                        {labelize(s.name)}
                                      </span>
                                      <span style={{ font: `500 11px/1.4 ${MONO}`, color: C.ink }}>{s.value}</span>
                                    </div>
                                    <div style={{ background: C.borderSoft, height: 5, marginTop: 4 }}>
                                      <div style={{ width: `${pct * 100}%`, height: '100%', background: C.accent }} />
                                    </div>
                                    <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkGhost, marginTop: 3 }}>
                                      {s.explanation}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 12 }}>
                              Confidence is signal agreement: high when at least 3 of 5 signals point the same way,
                              medium at 2, low at 1.
                            </div>
                            <span
                              style={{
                                display: 'inline-block',
                                marginTop: 8,
                                padding: '2px 7px',
                                borderRadius: 4,
                                background: C.greyTint,
                                color: C.inkSoft,
                                font: `500 10px/1.5 ${MONO}`,
                              }}
                            >
                              source: {r.source}
                            </span>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        <section style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>Demand Forecast</div>
            <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 4 }}>
              Next-period demand with an 80% confidence band. Drivers are SHAP attributions, translated.
            </div>
          </div>

          {forecastError ? (
            <ApiError error={forecastError} />
          ) : forecastData === null ? (
            <Empty>Loading…</Empty>
          ) : forecastRows.length === 0 ? (
            <Empty>No forecast data available.</Empty>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {forecastRows.map((f, i) => (
                <Card key={i} style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>{f.drug}</div>
                      <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkSoft, marginTop: 2 }}>{f.institution}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <span style={{ font: `500 20px/1 ${MONO}`, color: C.ink }}>{f.point}</span>
                        {f.changePct == null ? (
                          <span style={{ font: `500 10px/1.5 ${MONO}`, color: C.inkGhost }}>—</span>
                        ) : (
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: f.changePct > 0 ? C.amberTint : C.greenTint,
                              color: f.changePct > 0 ? C.amber : C.green,
                              font: `600 10px/1.5 ${MONO}`,
                            }}
                          >
                            {f.changePct > 0 ? '+' : ''}
                            {f.changePct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div style={{ font: `500 11px/1.4 ${MONO}`, color: C.inkSoft, marginTop: 3 }}>
                        {f.p10} – {f.p90}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <ForecastTrend history={f.history} point={f.point} p10={f.p10} p90={f.p90} />
                  </div>

                  {f.drivers.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {f.drivers.map((d, j) => (
                        <span
                          key={j}
                          style={{
                            padding: '2px 8px',
                            background: C.greyTint,
                            color: C.inkMuted,
                            font: `500 10px/1.6 ${FONT}`,
                            borderRadius: 4,
                          }}
                        >
                          {d.direction === 'RISING' ? '↑' : d.direction === 'FALLING' ? '↓' : '•'} {d.label}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ font: `400 10px/1.5 ${MONO}`, color: C.inkGhost, marginTop: 10 }}>
                    {f.metrics ? (
                      <>
                        MAPE {f.metrics.mape}% · coverage {f.metrics.band_coverage_pct}% of{' '}
                        {f.metrics.band_coverage_target_pct}% · {f.metrics.train_rows} train / {f.metrics.holdout_rows}{' '}
                        holdout · lightgbm
                      </>
                    ) : (
                      <>rolling-mean fallback · insufficient history to train</>
                    )}
                  </div>
                </Card>
              ))}
              <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost }}>
                Coverage is reported as measured, not tuned. On a short, strongly-trended series it varies — the row
                counts show why.
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ForecastTrend({
  history,
  point,
  p10,
  p90,
}: {
  history: Array<{ period: string; dispensed: number }>;
  point: number;
  p10: number;
  p90: number;
}) {
  const values = history.map((h) => h.dispensed);
  if (values.length === 0) {
    return <Sparkline values={[point]} width={200} height={40} />;
  }

  const W = 280;
  const H = 48;
  const histW = 190;
  const bandW = W - histW - 10;
  const padY = 6;

  const allValues = [...values, p10, p90, point];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const scaleY = (v: number) => padY + (H - padY * 2) - ((v - min) / span) * (H - padY * 2);

  const n = values.length;
  const xAt = (i: number) => (n === 1 ? histW / 2 : (i / (n - 1)) * histW);
  const linePoints = values.map((v, i) => `${xAt(i)},${scaleY(v)}`).join(' ');
  const bandX = histW + 10;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <line x1={histW + 5} x2={histW + 5} y1={0} y2={H} stroke={C.borderSoft} strokeWidth={1} />
      {n === 1 ? (
        <circle cx={xAt(0)} cy={scaleY(values[0])} r={2} fill={C.accent} />
      ) : (
        <polyline points={linePoints} fill="none" stroke={C.accent} strokeWidth={1.5} />
      )}
      <rect
        x={bandX}
        y={scaleY(p90)}
        width={bandW}
        height={Math.max(scaleY(p10) - scaleY(p90), 1)}
        fill={C.accent}
        opacity={0.15}
      />
      <line x1={bandX} x2={bandX + bandW} y1={scaleY(point)} y2={scaleY(point)} stroke={C.ink} strokeWidth={1.5} />
    </svg>
  );
}
