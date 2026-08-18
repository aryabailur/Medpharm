'use client';

/**
 * Tracking + Excursions — live position and temperature for a selected
 * incoming shipment, streamed over SSE from dhanvantari-api.
 *
 * Next 15 requires useSearchParams to sit inside a Suspense boundary, so all
 * hooks live in <Inner/> and this file's default export is just the wrapper.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { getIncoming, streamShipment, type IncomingShipment } from '../../lib/api';
import { C, FONT, MONO, VIZ } from '../../lib/theme';
import { ApiError, EmptyState, LiveChip, Mono, PageHeader, Panel, PanelTitle, Pill, Table, Td } from '../../components/ui';
import { ColumnChart, Legend, RouteMap, StepRail, TemperatureChart } from '../../components/charts';

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
  startTs?: string;
  endTs?: string;
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Excursion duration in the coarsest unit that still says something.
 *
 * The simulator compresses a multi-hour journey into seconds, so a real
 * excursion can last well under a minute. Rounding those to "0 min" reads as a
 * broken field, so anything below a minute is reported in seconds.
 */
function fmtDuration(mins: number | null | undefined): string {
  if (mins == null) return '—';
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))} s`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h} h ${m} m` : `${m} min`;
}

/**
 * An excursion's duration, preferring its own timestamps over `durationMin`.
 *
 * The API rounds `durationMin` to whole minutes, so a sub-minute excursion
 * arrives as a literal 0. Recomputing from the event's start/end recovers the
 * real span; `durationMin` is the fallback when the window isn't reported.
 */
function excursionDuration(e: ExcursionEvent): string {
  if (e.startTs && e.endTs) {
    const ms = new Date(e.endTs).getTime() - new Date(e.startTs).getTime();
    if (Number.isFinite(ms) && ms >= 0) return fmtDuration(ms / 60000);
  }
  return fmtDuration(e.durationMin);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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
          startTs: data.startTs,
          endTs: data.endTs,
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

  // Derive excursion bands as 0..1 fractions across the live telemetry series.
  const bands = useMemo(() => {
    if (!excursion || points.length === 0) return [];
    const t0 = new Date(points[0]!.ts).getTime();
    const t1 = new Date(points[points.length - 1]!.ts).getTime();
    const span = t1 - t0 || 1;
    const startT = excursion.startTs ? new Date(excursion.startTs).getTime() : t0;
    const endT = excursion.endTs ? new Date(excursion.endTs).getTime() : t1;
    const from = Math.max(0, Math.min(1, (startT - t0) / span));
    const to = Math.max(0, Math.min(1, (endT - t0) / span));
    return [{ from, to, label: `${excursion.severity} · ${excursionDuration(excursion)}` }];
  }, [excursion, points]);

  const ticks = useMemo(() => {
    if (points.length === 0) return [];
    const n = points.length;
    const idxs = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
    const seen = new Set<number>();
    // Below a couple of minutes every tick renders the same HH:MM, so the axis
    // switches to seconds — the simulator's compressed clock makes that common.
    const span = new Date(points[n - 1]!.ts).getTime() - new Date(points[0]!.ts).getTime();
    const shortWindow = span < 2 * 60 * 1000;
    return idxs
      .filter((i) => !seen.has(i) && seen.add(i))
      .map((i) =>
        shortWindow
          ? new Date(points[i]!.ts).toLocaleTimeString('en-GB', {
              minute: '2-digit',
              second: '2-digit',
            })
          : fmtTime(points[i]!.ts),
      );
  }, [points]);

  // Lifecycle steps derived from real shipment/excursion state.
  const steps = useMemo(() => {
    if (!detail) return [];
    const hasExcursion = !!excursion || detail.anomalyFlag;
    const delivered = detail.status === 'DELIVERED';
    const outForDelivery = detail.status === 'OUT_FOR_DELIVERY' || delivered;

    const rows: Array<{ label: string; time: string; dot: string; line?: string; fg?: string; done: boolean }> = [
      { label: 'Order approved', time: detail.supplyOrderId ? detail.supplyOrderId.slice(0, 12) : '—', dot: C.green, done: true },
      { label: 'Dispatched', time: 'manifest received', dot: C.green, done: true },
      {
        label: hasExcursion ? 'Cold-chain excursion' : 'In transit',
        time: hasExcursion
          ? `${excursion?.severity ?? 'EXCURSION'}${excursion ? ` · ${excursionDuration(excursion)}` : ''}`
          : `${Math.round((detail.progressPct ?? 0) * 100)}% of route`,
        dot: hasExcursion ? C.amber : C.blue,
        done: true,
      },
      {
        label: 'Out for delivery',
        time: outForDelivery ? 'under way' : `expected ${fmtDate(detail.etaAt)}`,
        dot: outForDelivery ? C.blue : '#C9C2BD',
        done: outForDelivery,
      },
      {
        label: 'Delivered',
        time: delivered ? 'received at dock' : `ETA ${fmtDate(detail.etaAt)}`,
        dot: delivered ? C.green : '#C9C2BD',
        done: delivered,
      },
    ];

    // Colour each connector with the NEXT step's state; dim rows not yet reached.
    return rows.map((r, i) => {
      const next = rows[i + 1];
      const nextDone = next ? next.done : true;
      return {
        label: r.label,
        time: r.time,
        dot: r.done ? r.dot : C.inkGhost,
        fg: r.done ? C.ink : '#A89F9B',
        line: i < rows.length - 1 ? (nextDone ? (rows[i + 1]!.dot === '#C9C2BD' ? C.inkGhost : rows[i + 1]!.dot) : C.borderSoft) : undefined,
      };
    });
  }, [detail, excursion]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { MINOR: 0, MAJOR: 0, CRITICAL: 0 };
    if (excursion && counts[excursion.severity] != null) counts[excursion.severity]! += 1;
    return counts;
  }, [excursion]);

  const excursionHistoryRows = useMemo(() => {
    if (!excursion || !detail) return [];
    return [
      {
        shipmentId: detail.id,
        window: excursion.startTs && excursion.endTs ? `${fmtTime(excursion.startTs)}–${fmtTime(excursion.endTs)}` : '—',
        peak: excursion.peakTempC != null ? `${excursion.peakTempC.toFixed(1)} °C` : '—',
        duration: excursionDuration(excursion),
        severity: excursion.severity,
        outcome: 'Awaiting arrival · quarantine on receipt',
      },
    ];
  }, [excursion, detail]);

  return (
    <>
      <PageHeader title="Tracking + Excursions" />

      <div style={{ display: 'flex' }}>
        <div style={{ width: 220, flex: '0 0 220px', borderRight: `1px solid ${C.border}`, overflowY: 'auto' }}>
          <PanelTitle>Shipments</PanelTitle>
          {listError ? (
            <div style={{ padding: 14 }}>
              <ApiError error={listError} service="dhanvantari-api" />
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState title="No shipments" height={140} />
          ) : (
            <div>
              {sorted.map((s) => {
                const activeRow = s.id === selectedId;
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
                      background: activeRow ? C.accentTint : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Mono color={activeRow ? C.accent : C.ink}>{s.id.slice(0, 12)}</Mono>
                      {s.anomalyFlag && (
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
          {!selectedId || !detail ? (
            <div style={{ padding: 26 }}>
              <EmptyState title="Select a shipment" hint="Pick a shipment from the list to see its live route, temperature and custody chain." height={200} />
            </div>
          ) : (
            <>
              {/* Block 1: route + status */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)',
                  gap: 24,
                  padding: '26px 26px 0',
                }}
              >
                <Panel delayMs={0} style={{ overflow: 'hidden' }}>
                  <PanelTitle
                    dot={detail.anomalyFlag || excursion ? C.amber : C.green}
                    right={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {live && <LiveChip label="live" color={VIZ.violet} />}
                        {(detail.anomalyFlag || excursion) && (
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
                            EXCURSION
                          </span>
                        )}
                      </div>
                    }
                  >
                    {detail.id.slice(0, 12)} · inbound
                  </PanelTitle>
                  <RouteMap
                    progress={detail.progressPct ?? 0}
                    origin="ORIGIN"
                    destination="THIS INSTITUTION"
                    now={live ? `NOW · ${Math.round((detail.progressPct ?? 0) * 100)}%` : undefined}
                    incident={excursion ? `EXCURSION ${excursionDuration(excursion)}` : undefined}
                    stats={[
                      { label: 'ETA', value: detail.etaAt ? fmtDate(detail.etaAt) : '—' },
                      {
                        label: 'Arrives in',
                        value:
                          detail.etaAt
                            ? (() => {
                                const ms = new Date(detail.etaAt).getTime() - Date.now();
                                if (ms <= 0) return 'due';
                                const h = Math.floor(ms / 3600000);
                                const m = Math.round((ms % 3600000) / 60000);
                                return h > 0 ? `${h}h ${m}m` : `${m}m`;
                              })()
                            : '—',
                      },
                    ]}
                  />
                </Panel>

                <Panel delayMs={60}>
                  <PanelTitle
                    right={
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                          Last temp
                        </div>
                        <div
                          key={detail.lastTempC ?? 'none'}
                          style={{
                            font: `600 26px/1 ${MONO}`,
                            color: C.ink,
                            marginTop: 4,
                            display: 'inline-block',
                            fontVariantNumeric: 'tabular-nums',
                            animation: 'mtPop .45s cubic-bezier(.16,1,.3,1) both',
                          }}
                        >
                          {detail.coldChain
                            ? detail.lastTempC != null
                              ? `${detail.lastTempC.toFixed(1)} °C`
                              : '—'
                            : 'ambient'}
                        </div>
                      </div>
                    }
                  >
                    Status
                  </PanelTitle>
                  <div style={{ padding: '20px 20px 6px' }}>
                    {steps.length === 0 ? <EmptyState title="No lifecycle data" height={120} /> : <StepRail steps={steps} />}
                  </div>
                </Panel>
              </div>

              {/* Block 2: temperature */}
              <div style={{ padding: '26px 26px 0' }}>
                <Panel delayMs={100}>
                  <PanelTitle
                    dot={bands.length > 0 ? C.red : C.green}
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
                    Temperature · 2–8 °C band
                  </PanelTitle>
                  <div style={{ padding: 20 }}>
                    {points.length === 0 ? (
                      <EmptyState title="Waiting for the first telemetry reading" hint="Temperature updates arrive live over SSE as the shipment moves." height={180} />
                    ) : (
                      <TemperatureChart readings={points} minC={MIN_C} maxC={MAX_C} bands={bands} ticks={ticks} />
                    )}
                  </div>
                </Panel>
              </div>

              {/* Block 3: excursion history + by severity */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 300px',
                  gap: 24,
                  padding: '26px 26px 52px',
                }}
              >
                <Panel delayMs={120}>
                  <PanelTitle>Excursion history</PanelTitle>
                  {excursionHistoryRows.length === 0 ? (
                    <EmptyState title="No excursions recorded for this shipment" height={140} glyph="✓" tone={C.green} />
                  ) : (
                    <Table head={['Shipment', 'Window', 'Peak', 'Duration', 'Severity', 'Outcome']}>
                      {excursionHistoryRows.map((r, i) => (
                        <tr key={i}>
                          <Td>
                            <Mono>{r.shipmentId.slice(0, 12)}</Mono>
                          </Td>
                          <Td>{r.window}</Td>
                          <Td>
                            <Mono color={C.red}>{r.peak}</Mono>
                          </Td>
                          <Td>{r.duration}</Td>
                          <Td>
                            <Pill label={r.severity} />
                          </Td>
                          <Td>{r.outcome}</Td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </Panel>

                <Panel delayMs={140} style={{ alignSelf: 'start' }}>
                  <PanelTitle>By severity</PanelTitle>
                  <div style={{ padding: 18 }}>
                    <ColumnChart
                      bars={[
                        { label: 'MINOR', count: severityCounts.MINOR ?? 0, color: C.grey },
                        { label: 'MAJOR', count: severityCounts.MAJOR ?? 0, color: C.amber },
                        { label: 'CRITICAL', count: severityCounts.CRITICAL ?? 0, color: C.red },
                      ]}
                      footnote="Counted from excursion events observed live on this shipment's stream."
                    />
                  </div>
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
