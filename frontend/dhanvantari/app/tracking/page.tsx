'use client';

/**
 * Tracking + Excursions — live position and temperature for a selected
 * incoming shipment, streamed over SSE from dhanvantari-api.
 *
 * Next 15 requires useSearchParams to sit inside a Suspense boundary, so all
 * hooks live in <Inner/> and this file's default export is just the wrapper.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { getIncoming, streamShipment, type IncomingShipment } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Pill } from '../../components/ui';

const MIN_C = 2;
const MAX_C = 8;

interface TempPoint {
  ts: string;
  tempC: number;
}

interface ExcursionEvent {
  severity: string;
  peakTempC: number | null;
  durationMin: number | null;
}

function Inner() {
  const params = useSearchParams();
  const preselect = params.get('shipment');

  const [shipments, setShipments] = useState<IncomingShipment[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(preselect);

  const [detail, setDetail] = useState<IncomingShipment | null>(null);
  const [points, setPoints] = useState<TempPoint[]>([]);
  const [excursion, setExcursion] = useState<ExcursionEvent | null>(null);
  const [live, setLive] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const eventCountRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await getIncoming();
        setShipments(res.items);
        setListError(null);
        if (!preselect && res.items.length > 0) {
          setSelectedId(res.items[0].id);
        }
      } catch (e) {
        setListError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const found = shipments.find((s) => s.id === selectedId);
    if (found) setDetail(found);
  }, [selectedId, shipments]);

  useEffect(() => {
    if (!selectedId) return;
    eventCountRef.current = 0;
    setEventCount(0);
    setLive(false);
    setPoints([]);
    setExcursion(null);

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
          setPoints((prev) => [...prev, { ts: data.ts, tempC: data.tempC }]);
        }
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener('excursion', (e) => {
      bump();
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setExcursion({
          severity: data.severity ?? 'UNKNOWN',
          peakTempC: data.peakTempC ?? data.maxTempC ?? null,
          durationMin: data.durationMin ?? null,
        });
        setDetail((prev) => (prev ? { ...prev, anomalyFlag: true } : prev));
      } catch {
        /* ignore malformed event */
      }
    });

    return () => {
      es.close();
    };
  }, [selectedId]);

  const sorted = [...shipments].sort((a, b) => {
    const aAnom = a.anomalyFlag ? 0 : 1;
    const bAnom = b.anomalyFlag ? 0 : 1;
    return aAnom - bAnom;
  });

  return (
    <>
      <PageHeader title="Tracking + Excursions" />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 73px)' }}>
        <div style={{ width: 250, flex: '0 0 250px', borderRight: `1px solid ${C.border}`, overflowY: 'auto' }}>
          <CardTitle>Shipments</CardTitle>
          {listError ? (
            <div style={{ padding: 14 }}>
              <ApiError error={listError} service="dhanvantari-api" />
            </div>
          ) : sorted.length === 0 ? (
            <Empty>No shipments.</Empty>
          ) : (
            <div>
              {sorted.map((s) => {
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
                      <Mono color={active ? C.accent : C.ink}>{s.id.slice(0, 12)}</Mono>
                      {s.anomalyFlag && (
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
          {!selectedId || !detail ? (
            <div style={{ padding: 26 }}>
              <Empty>Select a shipment.</Empty>
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
                <Kpi label="ETA" value={detail.etaAt ? new Date(detail.etaAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'} />
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
                {excursion && (
                  <Card style={{ padding: 14, background: C.redTint, borderColor: C.red }}>
                    <div style={{ font: `700 13px/1.4 ${FONT}`, color: C.red }}>Excursion detected</div>
                    <div style={{ marginTop: 6, font: `500 12px/1.6 ${MONO}`, color: C.red }}>
                      Severity {excursion.severity}
                      {excursion.peakTempC != null && ` · peak ${excursion.peakTempC.toFixed(1)}°C`}
                      {excursion.durationMin != null && ` · ${excursion.durationMin} min`}
                    </div>
                  </Card>
                )}

                <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
                  <CardTitle>Temperature trace</CardTitle>
                  <div style={{ padding: 14 }}>
                    <TemperatureChart points={points} />
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function TemperatureChart({ points }: { points: TempPoint[] }) {
  if (points.length === 0) {
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

  const values = points.map((p) => p.tempC);
  const dataMin = Math.min(...values, MIN_C);
  const dataMax = Math.max(...values, MAX_C);
  const span = dataMax - dataMin || 1;
  const scaleY = (v: number) => padT + innerH - ((v - dataMin) / span) * innerH;

  const n = points.length;
  const xAt = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);

  const linePoints = points.map((p, i) => `${xAt(i)},${scaleY(p.tempC)}`).join(' ');

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={padL} x2={padL + innerW} y1={scaleY(MIN_C)} y2={scaleY(MIN_C)} stroke={C.accent} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={padL} x2={padL + innerW} y1={scaleY(MAX_C)} y2={scaleY(MAX_C)} stroke={C.accent} strokeWidth={1} strokeDasharray="4 3" />
      <text x={padL + innerW} y={scaleY(MIN_C) - 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.accent }}>
        2°C
      </text>
      <text x={padL + innerW} y={scaleY(MAX_C) - 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.accent }}>
        8°C
      </text>

      {n === 1 ? (
        <circle cx={xAt(0)} cy={scaleY(points[0].tempC)} r={3} fill={C.ink} />
      ) : (
        <polyline points={linePoints} fill="none" stroke={C.ink} strokeWidth={1.5} />
      )}

      {points.map((p, i) =>
        p.tempC < MIN_C || p.tempC > MAX_C ? <circle key={i} cx={xAt(i)} cy={scaleY(p.tempC)} r={3.5} fill={C.red} /> : null,
      )}

      <text x={padL} y={H - 4} style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
        {new Date(points[0].ts).toLocaleTimeString('en-GB')}
      </text>
      <text x={padL + innerW} y={H - 4} textAnchor="end" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
        {new Date(points[n - 1].ts).toLocaleTimeString('en-GB')}
      </text>
    </svg>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
