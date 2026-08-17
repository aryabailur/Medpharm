'use client';

/**
 * Telemetry + Excursions — live position and temperature from the cold chain.
 *
 * Merges what used to be two screens: the live telemetry feed and the
 * excursion ledger for the selected shipment. Next 15 requires useSearchParams
 * to sit inside a Suspense boundary, so all hooks live in <Inner/> and this
 * file's default export is just the wrapper.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  getShipment,
  getShipments,
  getTelemetry,
  streamShipment,
  type Excursion,
  type Shipment,
  type TelemetryPoint,
} from '../../lib/api';
import { C, FONT, LABEL, MONO, rise, statusColors } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, Pill } from '../../components/ui';
import { ColumnChart, Legend, RouteMap, StepRail, TemperatureChart } from '../../components/charts';

const MIN_C = 2;
const MAX_C = 8;

function fmtTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtClock(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(mins: number | null): string {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h} h ${m} m` : `${m} min`;
}

function fmtOpenDuration(startedAt: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  return fmtDuration(mins);
}

function Inner() {
  const params = useSearchParams();
  const preselect = params.get('shipment');

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(preselect);

  const [detail, setDetail] = useState<Shipment | null>(null);
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await getShipments('?take=100');
        setShipments(res.items);
        setListError(null);
      } catch (e) {
        setListError((e as Error).message);
      }
    })();
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const [ship, tel] = await Promise.all([getShipment(id), getTelemetry(id)]);
      setDetail(ship);
      setExcursions(ship.excursions);
      setPoints(tel.points);
      setDetailError(null);
    } catch (e) {
      setDetailError((e as Error).message);
      setDetail(null);
      setExcursions([]);
      setPoints([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const eventCountRef = useRef(0);

  useEffect(() => {
    if (!selectedId) return;
    eventCountRef.current = 0;
    setEventCount(0);
    setLive(false);

    const es = streamShipment(selectedId);

    const bump = () => {
      eventCountRef.current += 1;
      setEventCount(eventCountRef.current);
    };

    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    es.addEventListener('status', (e) => {
      bump();
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setDetail((prev) => (prev ? { ...prev, status: data.status ?? prev.status } : prev));
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener('position', (e) => {
      bump();
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                lastKnownLat: data.lat ?? prev.lastKnownLat,
                lastKnownLng: data.lng ?? prev.lastKnownLng,
                progressPct: data.progressPct ?? prev.progressPct,
              }
            : prev,
        );
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener('temperature', (e) => {
      bump();
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setDetail((prev) => (prev ? { ...prev, lastTempC: data.tempC ?? prev.lastTempC } : prev));
        if (data.ts && typeof data.tempC === 'number') {
          setPoints((prev) => [...prev, { ts: data.ts, lat: data.lat ?? null, lng: data.lng ?? null, tempC: data.tempC }]);
        }
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener('excursion', (e) => {
      bump();
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setExcursions((prev) => {
          const idx = prev.findIndex((x) => x.id === data.id);
          if (idx === -1) return [data, ...prev];
          const next = [...prev];
          next[idx] = data;
          return next;
        });
        setDetail((prev) => (prev ? { ...prev, excursionCount: (prev.excursionCount ?? 0) + 1 } : prev));
      } catch {
        /* ignore malformed event */
      }
    });

    return () => {
      es.close();
    };
  }, [selectedId]);

  const inFlightFirst = [...shipments].sort((a, b) => {
    const aFlight = ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(a.status) ? 0 : 1;
    const bFlight = ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(b.status) ? 0 : 1;
    return aFlight - bFlight;
  });

  const openExcursion = excursions.find((e) => !e.endedAt) ?? null;
  const institutionName = detail?.supplyOrder?.institution?.name ?? '—';
  const shortId = detail ? detail.id.slice(0, 8).toUpperCase() : '';

  // KPI strip figures.
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const excursionsThisMonth = excursions.filter((e) => new Date(e.startedAt).getTime() >= monthAgo).length;
  const openCount = excursions.filter((e) => !e.endedAt).length;
  const coldChainCount = shipments.filter((s) => s.coldChain).length;
  const leadTimes = excursions
    .filter((e) => e.endedAt)
    .map((e) => (detail?.etaAt ? (new Date(detail.etaAt).getTime() - new Date(e.startedAt).getTime()) / 60000 : null))
    .filter((v): v is number => v != null && v > 0);
  const avgLead = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null;

  // By-severity bars, this shipment's excursions.
  const sevCounts = { MINOR: 0, MAJOR: 0, CRITICAL: 0 };
  excursions.forEach((e) => {
    sevCounts[e.severity] = (sevCounts[e.severity] ?? 0) + 1;
  });

  // Temperature bands from real excursion windows, as fractions of the telemetry window.
  const tempPoints = points.filter((p) => p.tempC != null) as Array<TelemetryPoint & { tempC: number }>;
  const seriesStart = tempPoints.length ? new Date(tempPoints[0].ts).getTime() : 0;
  const seriesEnd = tempPoints.length ? new Date(tempPoints[tempPoints.length - 1].ts).getTime() : 0;
  const seriesSpan = seriesEnd - seriesStart || 1;
  const bands = excursions.map((e) => {
    const from = (new Date(e.startedAt).getTime() - seriesStart) / seriesSpan;
    const to = (e.endedAt ? new Date(e.endedAt).getTime() : seriesEnd - seriesStart + seriesStart) - seriesStart;
    return { from: Math.max(0, Math.min(1, from)), to: Math.max(0, Math.min(1, to / seriesSpan)), label: `${e.severity} · ${fmtDuration(e.durationMin)}` };
  });
  const tickCount = 5;
  const ticks = tempPoints.length
    ? Array.from({ length: tickCount }, (_, i) => {
        const idx = Math.round((i / (tickCount - 1)) * (tempPoints.length - 1));
        return fmtClock(tempPoints[idx]!.ts);
      })
    : [];

  // Chain-of-custody steps from real lifecycle timestamps.
  const rawSteps: Array<{ label: string; time: string }> = detail
    ? [
        { label: 'Dispatched', time: fmtTime(detail.dispatchedAt) },
        ...(openExcursion
          ? [{ label: `Excursion · ${openExcursion.severity}`, time: fmtTime(openExcursion.startedAt) }]
          : []),
        {
          label:
            detail.status === 'DELIVERED'
              ? 'Delivered'
              : `In transit · ${Math.round((detail.progressPct ?? 0) * 100)}%`,
          time: detail.deliveredAt ? fmtTime(detail.deliveredAt) : 'now',
        },
      ]
    : [];
  const steps: Array<{ label: string; time: string; dot: string; line?: string; fg?: string }> = rawSteps.map(
    (s, i, arr) => {
      const isLast = i === arr.length - 1;
      const nextIsExcursion = arr[i + 1]?.label.startsWith('Excursion');
      const dot = s.label.startsWith('Excursion') ? C.amber : isLast && openExcursion ? C.blue : C.green;
      const line = nextIsExcursion ? C.amber : isLast ? 'transparent' : C.green;
      const fg = s.label.startsWith('Excursion') ? C.amber : C.ink;
      return { ...s, dot, line, fg };
    },
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ width: 250, flex: '0 0 250px', borderRight: `1px solid ${C.border}`, overflowY: 'auto', background: C.surface }}>
        <CardTitle>Shipments</CardTitle>
        {listError ? (
          <div style={{ padding: 14 }}>
            <ApiError error={listError} />
          </div>
        ) : inFlightFirst.length === 0 ? (
          <Empty>No shipments.</Empty>
        ) : (
          <div>
            {inFlightFirst.map((s) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: `1px solid ${C.borderSoft}`,
                    background: active ? C.accentTint : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mono color={active ? C.accent : C.ink}>{s.id.slice(0, 8).toUpperCase()}</Mono>
                    {s.excursionCount > 0 && (
                      <span style={{ width: 6, height: 6, background: C.red, display: 'inline-block' }} />
                    )}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Pill label={s.status} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedId ? (
          <div style={{ padding: 26 }}>
            <Empty>Select a shipment.</Empty>
          </div>
        ) : detailError ? (
          <div style={{ padding: 26 }}>
            <ApiError error={detailError} />
          </div>
        ) : !detail ? (
          <div style={{ padding: 26 }}>
            <Empty>Loading…</Empty>
          </div>
        ) : (
          <>
            {openExcursion && (
              <div style={{ borderBottom: '1px solid #E9C9C4', background: '#FDF6F5', animation: rise(0) }}>
                <div style={{ height: 2, background: C.red, transformOrigin: 'left', animation: 'mtGrow .15s ease-out both' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 20px' }}>
                  <span
                    style={{
                      font: `600 10px/1 ${MONO}`,
                      letterSpacing: '.12em',
                      background: C.red,
                      color: '#FDF6F5',
                      padding: '5px 7px',
                    }}
                  >
                    ALARM
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `600 15px/1.5 ${FONT}`, color: C.ink }}>
                      {shortId} out of band
                      {openExcursion.maxTempC != null ? ` — ${openExcursion.maxTempC.toFixed(1)} °C peak` : ''}
                      {openExcursion.durationMin != null ? `, ${fmtDuration(openExcursion.durationMin)} above ${MAX_C} °C` : ''}
                    </div>
                    <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 3 }}>
                      Hysteresis fired {fmtClock(openExcursion.startedAt)} · {institutionName}
                    </div>
                  </div>
                  <span style={{ font: `500 11px/1 ${MONO}`, color: C.amber }}>OPEN {fmtOpenDuration(openExcursion.startedAt)}</span>
                  <button
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      font: `500 12px/1 ${FONT}`,
                      color: C.ink,
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Notify institution
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 24, padding: '26px 26px 0' }}>
              <Card style={{ overflow: 'hidden', animation: rise(0) }}>
                <CardTitle
                  right={
                    openExcursion && (
                      <span
                        style={{
                          font: `600 10px/1 ${FONT}`,
                          letterSpacing: '.06em',
                          background: C.amberTint,
                          color: C.amber,
                          padding: '3px 7px',
                          borderRadius: 3,
                        }}
                      >
                        EXCURSION OPEN
                      </span>
                    )
                  }
                >
                  {shortId} · live route
                </CardTitle>
                <RouteMap
                  progress={detail.progressPct ?? 0}
                  origin={`ORIGIN · ${fmtClock(detail.dispatchedAt)}`}
                  destination={institutionName.toUpperCase()}
                  now={`NOW · ${Math.round((detail.progressPct ?? 0) * 100)}%`}
                  incident={openExcursion ? `EXCURSION ${fmtClock(openExcursion.startedAt)}` : undefined}
                  stats={[
                    { label: 'Progress', value: `${Math.round((detail.progressPct ?? 0) * 100)}%` },
                    { label: 'ETA', value: detail.etaAt ? fmtClock(detail.etaAt) : '—' },
                    { label: 'Points today', value: points.length.toLocaleString('en-IN') },
                  ]}
                />
              </Card>

              <Card style={{ animation: rise(60) }}>
                <CardTitle
                  right={
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...LABEL }}>Last reading</span>
                      <div style={{ marginTop: 5 }}>
                        <span
                          key={detail.lastTempC ?? 'none'}
                          style={{
                            font: `600 26px/1 ${MONO}`,
                            letterSpacing: '-.03em',
                            color: C.ink,
                            display: 'inline-block',
                            fontVariantNumeric: 'tabular-nums',
                            animation: 'mtPop .45s cubic-bezier(.16,1,.3,1) both',
                          }}
                        >
                          {detail.coldChain ? (detail.lastTempC != null ? `${detail.lastTempC.toFixed(1)} °C` : '—') : 'ambient'}
                        </span>
                      </div>
                    </div>
                  }
                >
                  Chain of custody
                </CardTitle>
                <div style={{ padding: '20px 20px 6px' }}>
                  {steps.length === 0 ? <Empty>No lifecycle data.</Empty> : <StepRail steps={steps} />}
                </div>
              </Card>
            </div>

            <div style={{ padding: '26px 26px 0' }}>
              <Card style={{ animation: rise(100) }}>
                <CardTitle
                  right={
                    <Legend
                      items={[
                        { label: 'Reading', color: C.accent },
                        { label: 'Out of band', color: C.red, kind: 'thin' },
                        { label: 'In band', color: C.bandFill, kind: 'band' },
                      ]}
                    />
                  }
                >
                  Temperature · {MIN_C}–{MAX_C} °C band
                </CardTitle>
                <div style={{ padding: 20 }}>
                  {tempPoints.length === 0 ? (
                    <Empty>No temperature readings yet.</Empty>
                  ) : (
                    <TemperatureChart
                      readings={tempPoints.map((p) => ({ ts: p.ts, tempC: p.tempC }))}
                      minC={MIN_C}
                      maxC={MAX_C}
                      bands={bands}
                      ticks={ticks}
                    />
                  )}
                </div>
              </Card>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4,1fr)',
                background: C.surface,
                borderTop: `1px solid ${C.border}`,
                borderBottom: `1px solid ${C.border}`,
                marginTop: 24,
              }}
            >
              <Kpi label="Open excursions" value={openCount} deltaColor={openCount ? C.amber : C.grey} note={detail.id.slice(0, 8).toUpperCase()} />
              <Kpi label="This month" value={excursionsThisMonth} deltaColor={excursionsThisMonth ? C.red : C.grey} note="Excursions on this shipment" />
              <Kpi label="Cold-chain shipments" value={coldChainCount} deltaColor={C.accent} note={`of ${shipments.length} total`} />
              <Kpi label="Avg warning lead" value={avgLead != null ? fmtDuration(avgLead) : '—'} deltaColor={C.green} note="Detection to arrival" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, padding: '26px 26px 52px' }}>
              <Card style={{ overflowX: 'auto', animation: rise(0) }}>
                <CardTitle>Excursions</CardTitle>
                {excursions.length === 0 ? (
                  <Empty>No excursions recorded for this shipment.</Empty>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                    <thead>
                      <tr>
                        {['Shipment', 'Institution', 'Window', 'Peak', 'Duration', 'Severity', 'Warned'].map((h, i) => (
                          <th
                            key={h}
                            style={{
                              textAlign: i >= 2 && i <= 4 ? 'right' : 'left',
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
                      {excursions.map((e) => {
                        const sc = statusColors(e.severity);
                        return (
                          <tr key={e.id}>
                            <td style={cellMono}>{detail.id.slice(0, 8).toUpperCase()}</td>
                            <td style={cellText}>{institutionName}</td>
                            <td style={{ ...cellMono, color: C.inkMuted, fontWeight: 400 }}>
                              {fmtClock(e.startedAt)}–{e.endedAt ? fmtClock(e.endedAt) : 'open'}
                            </td>
                            <td style={{ ...cellNum }}>{e.maxTempC != null ? `${e.maxTempC.toFixed(1)} °C` : '—'}</td>
                            <td style={{ ...cellNum, color: C.inkMuted, fontWeight: 400 }}>{fmtDuration(e.durationMin)}</td>
                            <td style={cellText}>
                              <span
                                style={{
                                  font: `600 11px/1 ${FONT}`,
                                  letterSpacing: '.07em',
                                  padding: '5px 9px',
                                  borderRadius: 4,
                                  background: sc.tint,
                                  color: sc.color,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {e.severity}
                              </span>
                            </td>
                            <td style={{ ...cellText, color: C.inkMuted }}>{e.acknowledged ? 'Acknowledged' : e.endedAt ? 'Closed' : 'Pending'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card style={{ alignSelf: 'start', animation: rise(60) }}>
                <CardTitle>By severity · this shipment</CardTitle>
                <div style={{ padding: 20 }}>
                  <ColumnChart
                    bars={[
                      { label: 'MINOR', count: sevCounts.MINOR, color: C.grey },
                      { label: 'MAJOR', count: sevCounts.MAJOR, color: C.amber },
                      { label: 'CRITICAL', count: sevCounts.CRITICAL, color: C.red },
                    ]}
                    footnote={
                      excursions.length === 0
                        ? 'No excursions recorded for this shipment.'
                        : `${excursions.length} excursion${excursions.length === 1 ? '' : 's'} recorded on ${detail.id.slice(0, 8).toUpperCase()}.`
                    }
                  />
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const cellText = {
  padding: '15px 18px',
  font: `400 14px/1.6 ${FONT}`,
  color: C.ink,
  borderBottom: `1px solid ${C.borderSoft}`,
  verticalAlign: 'top' as const,
};

const cellMono = {
  padding: '15px 18px',
  font: `500 13px/1.5 ${MONO}`,
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

export default function TelemetryPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
