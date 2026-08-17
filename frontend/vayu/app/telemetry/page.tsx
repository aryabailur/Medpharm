'use client';

/**
 * Telemetry + Excursions — live position and temperature from the cold chain.
 *
 * Merges what used to be two screens: the live telemetry feed and the
 * excursion ledger for the selected shipment. Next 15 requires useSearchParams
 * to sit inside a Suspense boundary, so all hooks live in <Inner/> and this
 * file's default export is just the wrapper.
 */

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Pill } from '../../components/ui';

const MIN_C = 2;
const MAX_C = 8;

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

  return (
    <>
      <PageHeader title="Telemetry + Excursions" />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 73px)' }}>
        <div style={{ width: 250, flex: '0 0 250px', borderRight: `1px solid ${C.border}`, overflowY: 'auto' }}>
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
                      <Mono color={active ? C.accent : C.ink}>{s.id.slice(0, 8)}</Mono>
                      {s.excursionCount > 0 && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
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

        <div style={{ flex: 1, display: 'grid', alignContent: 'start' }}>
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
              <KpiBand columns={4}>
                <Kpi
                  label="Current temp"
                  value={detail.coldChain ? (detail.lastTempC != null ? `${detail.lastTempC.toFixed(1)}°C` : '—') : 'ambient'}
                  deltaColor={
                    detail.lastTempC != null && (detail.lastTempC < MIN_C || detail.lastTempC > MAX_C) ? C.red : C.accent
                  }
                />
                <Kpi label="Progress" value={detail.progressPct != null ? `${Math.round(detail.progressPct * 100)}%` : '—'} />
                <Kpi label="Status" value={detail.status} />
                <Kpi
                  label="Excursions"
                  value={detail.excursionCount}
                  deltaColor={detail.excursionCount > 0 ? C.red : C.grey}
                />
              </KpiBand>

              <div style={{ padding: '26px 26px 0', display: 'flex', justifyContent: 'flex-end' }}>
                {live && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, background: C.green, display: 'inline-block' }} />
                    <span style={{ font: `600 10px/1 ${MONO}`, color: C.green, letterSpacing: '.06em' }}>LIVE</span>
                    <span style={{ font: `400 10px/1 ${MONO}`, color: C.inkGhost }}>{eventCount} events</span>
                  </div>
                )}
              </div>

              <div style={{ padding: 26, display: 'grid', gap: 18 }}>
              <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
                <CardTitle>Temperature trace</CardTitle>
                <div style={{ padding: 14 }}>
                  <TemperatureChart points={points} />
                </div>
              </Card>

              <Card>
                <CardTitle>Excursions</CardTitle>
                {excursions.length === 0 ? (
                  <Empty>No excursions recorded for this shipment.</Empty>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Severity', 'Duration', 'Min °C', 'Max °C', 'Started', 'State'].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: 'left',
                              padding: '8px 14px',
                              font: `600 10px/1 ${FONT}`,
                              letterSpacing: '.14em',
                              textTransform: 'uppercase',
                              color: C.inkGhost,
                              borderBottom: `1px solid ${C.borderSoft}`,
                              background: C.surfaceAlt,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {excursions.map((ex) => (
                        <tr key={ex.id}>
                          <td style={td}>
                            <Pill label={ex.severity} />
                          </td>
                          <td style={td}>
                            <Mono>{ex.durationMin != null ? `${ex.durationMin} min` : '—'}</Mono>
                          </td>
                          <td style={td}>
                            <Mono>{ex.minTempC != null ? ex.minTempC.toFixed(1) : '—'}</Mono>
                          </td>
                          <td style={td}>
                            <Mono>{ex.maxTempC != null ? ex.maxTempC.toFixed(1) : '—'}</Mono>
                          </td>
                          <td style={td}>{new Date(ex.startedAt).toLocaleString('en-GB')}</td>
                          <td style={td}>
                            <Pill label={ex.endedAt ? 'CLOSED' : 'OPEN'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const td: CSSProperties = {
  padding: '10px 14px',
  font: `400 13px/1.45 ${FONT}`,
  color: '#55524C',
  borderBottom: '1px solid #EAE7E1',
  verticalAlign: 'middle',
};

function TemperatureChart({ points }: { points: TelemetryPoint[] }) {
  const withTemp = points.filter((p) => p.tempC != null) as Array<{ ts: string; tempC: number }>;

  if (withTemp.length === 0) {
    return <Empty>No temperature readings yet.</Empty>;
  }

  const W = 900;
  const H = 200;
  const padL = 34;
  const padR = 14;
  const padT = 14;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = withTemp.map((p) => p.tempC);
  const dataMin = Math.min(...values, MIN_C);
  const dataMax = Math.max(...values, MAX_C);
  const span = dataMax - dataMin || 1;
  const scaleY = (v: number) => padT + innerH - ((v - dataMin) / span) * innerH;

  const n = withTemp.length;
  const xAt = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);

  const linePoints = withTemp.map((p, i) => `${xAt(i)},${scaleY(p.tempC)}`).join(' ');

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line
        x1={padL}
        x2={padL + innerW}
        y1={scaleY(MIN_C)}
        y2={scaleY(MIN_C)}
        stroke={C.accent}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <line
        x1={padL}
        x2={padL + innerW}
        y1={scaleY(MAX_C)}
        y2={scaleY(MAX_C)}
        stroke={C.accent}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <text x={padL + innerW} y={scaleY(MIN_C) - 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.accent }}>
        2°C
      </text>
      <text x={padL + innerW} y={scaleY(MAX_C) - 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.accent }}>
        8°C
      </text>

      {n === 1 ? (
        <circle cx={xAt(0)} cy={scaleY(withTemp[0].tempC)} r={3} fill={C.ink} />
      ) : (
        <polyline points={linePoints} fill="none" stroke={C.ink} strokeWidth={1.5} />
      )}

      {withTemp.map((p, i) =>
        p.tempC < MIN_C || p.tempC > MAX_C ? (
          <circle key={i} cx={xAt(i)} cy={scaleY(p.tempC)} r={3.5} fill={C.red} />
        ) : null,
      )}

      <text x={padL} y={H - 4} style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
        {new Date(withTemp[0].ts).toLocaleTimeString('en-GB')}
      </text>
      <text x={padL + innerW} y={H - 4} textAnchor="end" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
        {new Date(withTemp[n - 1].ts).toLocaleTimeString('en-GB')}
      </text>
    </svg>
  );
}

export default function TelemetryPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
