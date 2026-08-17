'use client';

/**
 * Telemetry Console — live position and temperature from the cold chain.
 *
 * Client Component: opens a per-shipment SSE stream (lib/api#streamShipment)
 * and renders it as an inline SVG chart. useSearchParams() requires a
 * Suspense boundary in Next 15, so the exported page is a thin wrapper and
 * all hooks live in Inner.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { getShipments, getTelemetry, streamShipment, type Shipment, type TelemetryPoint } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, Mono, PageHeader, Pill } from '../../components/ui';

const IN_FLIGHT = ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];
const BAND_LOW = 2;
const BAND_HIGH = 8;
const MAX_POINTS = 120;

interface SeriesPoint {
  ts: string;
  tempC: number | null;
}

interface ExcursionBanner {
  severity?: string;
  startedAt?: string;
  tempC?: number | null;
  closed?: boolean;
  endedAt?: string;
}

function TelemetryChart({ points }: { points: SeriesPoint[] }) {
  const width = 640;
  const height = 180;
  const padX = 8;
  const padY = 14;

  const values = points.map((p) => p.tempC).filter((v): v is number => v != null);
  const lo = Math.min(BAND_LOW - 2, ...(values.length ? values : [BAND_LOW - 2]));
  const hi = Math.max(BAND_HIGH + 2, ...(values.length ? values : [BAND_HIGH + 2]));
  const span = hi - lo || 1;

  const xFor = (i: number) =>
    padX + (points.length > 1 ? (i / (points.length - 1)) * (width - padX * 2) : 0);
  const yFor = (t: number) => padY + (1 - (t - lo) / span) * (height - padY * 2);

  const linePoints = points
    .map((p, i) => (p.tempC != null ? `${xFor(i)},${yFor(p.tempC)}` : null))
    .filter(Boolean)
    .join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {/* Cold-chain band guide lines: readings should stay between 2°C and 8°C */}
      <line x1={padX} x2={width - padX} y1={yFor(BAND_LOW)} y2={yFor(BAND_LOW)} stroke={C.blue} strokeDasharray="4 4" strokeWidth={1} />
      <line x1={padX} x2={width - padX} y1={yFor(BAND_HIGH)} y2={yFor(BAND_HIGH)} stroke={C.blue} strokeDasharray="4 4" strokeWidth={1} />

      {linePoints && <polyline points={linePoints} fill="none" stroke={C.steel} strokeWidth={2} />}

      {points.map((p, i) => {
        if (p.tempC == null) return null;
        const outOfBand = p.tempC < BAND_LOW || p.tempC > BAND_HIGH;
        if (!outOfBand) return null;
        return <circle key={i} cx={xFor(i)} cy={yFor(p.tempC)} r={3.5} fill={C.red} />;
      })}
    </svg>
  );
}

function Inner() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get('shipment');

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [excursionCount, setExcursionCount] = useState(0);
  const [excursionBanner, setExcursionBanner] = useState<ExcursionBanner | null>(null);
  const [live, setLive] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const s = await getShipments('?take=100');
        const ordered = [...s.items].sort((a, b) => {
          const aFlight = IN_FLIGHT.includes(a.status) ? 0 : 1;
          const bFlight = IN_FLIGHT.includes(b.status) ? 0 : 1;
          return aFlight - bFlight;
        });
        setShipments(ordered);
        if (preselect) setSelected(preselect);
        else if (ordered.length) setSelected(ordered[0].id);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // preselect only applies once, on the URL that loaded the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    setSeries([]);
    setStatus(null);
    setProgressPct(null);
    setExcursionCount(0);
    setExcursionBanner(null);
    setEventCount(0);

    (async () => {
      try {
        const t = await getTelemetry(selected);
        if (cancelled) return;
        setSeries(t.points.slice(-MAX_POINTS).map((p: TelemetryPoint) => ({ ts: p.ts, tempC: p.tempC })));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();

    const es = streamShipment(selected);

    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    es.addEventListener('status', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setStatus(data.status);
      if (data.progressPct != null) setProgressPct(data.progressPct);
      if (Array.isArray(data.history)) {
        setSeries(data.history.slice(-MAX_POINTS).map((p: TelemetryPoint) => ({ ts: p.ts, tempC: p.tempC })));
      }
      setEventCount((n) => n + 1);
    });

    es.addEventListener('temperature', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setSeries((prev) => [...prev, { ts: data.ts, tempC: data.tempC }].slice(-MAX_POINTS));
      setEventCount((n) => n + 1);
    });

    es.addEventListener('position', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (data.progressPct != null) setProgressPct(data.progressPct);
      setEventCount((n) => n + 1);
    });

    es.addEventListener('excursion', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (data.closed) {
        setExcursionBanner({ closed: true, endedAt: data.endedAt });
      } else {
        setExcursionCount((n) => n + 1);
        setExcursionBanner({ severity: data.severity, startedAt: data.startedAt, tempC: data.tempC });
      }
      setEventCount((n) => n + 1);
    });

    // A leaked EventSource keeps polling the API forever — always close on
    // unmount / shipment change.
    return () => {
      cancelled = true;
      es.close();
      setLive(false);
    };
  }, [selected]);

  const lastTemp = series.length ? series[series.length - 1].tempC : null;

  if (error) {
    return (
      <>
        <PageHeader title="Telemetry Console" subtitle="Live position and temperature from the cold chain" />
        <div style={{ padding: 28 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Telemetry Console" subtitle="Live position and temperature from the cold chain" />

      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18 }}>
        <Card style={{ maxHeight: 640, overflow: 'auto' }}>
          <CardTitle>Shipments</CardTitle>
          {shipments.length === 0 ? (
            <Empty>No shipments.</Empty>
          ) : (
            <div>
              {shipments.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    border: 0,
                    borderBottom: `1px solid ${C.borderSoft}`,
                    background: selected === s.id ? C.steelTint : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Mono>{s.id.slice(0, 8)}</Mono>
                    <Pill label={s.status} />
                  </div>
                  <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkGhost, marginTop: 3 }}>
                    {s.supplyOrder?.institution?.name ?? '—'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div style={{ display: 'grid', gap: 18 }}>
          {!selected ? (
            <Card>
              <Empty>Select a shipment.</Empty>
            </Card>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Kpi label="Current temp" value={lastTemp != null ? `${lastTemp.toFixed(1)} °C` : '—'} deltaColor={C.blue} />
                <Kpi label="Progress" value={progressPct != null ? `${Math.round(progressPct * 100)}%` : '—'} deltaColor={C.steel} />
                <Kpi label="Status" value={status ?? '—'} />
                <Kpi
                  label="Excursions"
                  value={excursionCount}
                  deltaColor={excursionCount ? C.red : C.green}
                  note={excursionCount ? 'this session' : 'None this session'}
                />
              </div>

              {excursionBanner && (
                <Card
                  style={{
                    padding: '12px 16px',
                    borderColor: excursionBanner.closed ? C.border : '#E7C9C6',
                    background: excursionBanner.closed ? C.greenTint : C.redTint,
                  }}
                >
                  {excursionBanner.closed ? (
                    <span style={{ font: `600 12px/1.4 ${FONT}`, color: C.green }}>
                      Excursion closed at {excursionBanner.endedAt ? new Date(excursionBanner.endedAt).toLocaleTimeString() : '—'}
                    </span>
                  ) : (
                    <span style={{ font: `600 12px/1.4 ${FONT}`, color: C.red }}>
                      {excursionBanner.severity} excursion — {excursionBanner.tempC != null ? `${excursionBanner.tempC.toFixed(1)} °C` : ''} at{' '}
                      {excursionBanner.startedAt ? new Date(excursionBanner.startedAt).toLocaleTimeString() : '—'}
                    </span>
                  )}
                </Card>
              )}

              <Card>
                <CardTitle
                  right={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: live ? C.green : C.inkGhost,
                          boxShadow: live ? `0 0 0 3px ${C.greenTint}` : undefined,
                        }}
                      />
                      <span style={{ font: `600 11px/1 ${MONO}`, color: live ? C.green : C.inkGhost }}>
                        {live ? 'LIVE' : 'OFFLINE'}
                      </span>
                      <span style={{ font: `400 11px/1 ${MONO}`, color: C.inkFaint }}>{eventCount} events</span>
                    </div>
                  }
                >
                  Temperature
                </CardTitle>
                <div style={{ padding: '12px 16px' }}>
                  {series.length === 0 ? <Empty>No telemetry yet.</Empty> : <TelemetryChart points={series} />}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function TelemetryPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
