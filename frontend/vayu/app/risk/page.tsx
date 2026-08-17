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

export default function RiskPage() {
  const [rows, setRows] = useState<RiskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

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
      </div>
    </>
  );
}
