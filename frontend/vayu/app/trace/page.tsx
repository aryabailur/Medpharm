'use client';

/**
 * Trace — full custody chain from manufacture to complaint.
 */

import { useState } from 'react';

import {
  getBatch,
  getShipment,
  getTelemetry,
  resolveQr,
  type Batch,
  type Drug,
  type Excursion,
  type Shipment,
  type TelemetryPoint,
} from '../../lib/api';
import { C, FONT, GRAD, MONO, rise, SHADOW } from '../../lib/theme';
import { EmptyState, Panel, PanelTitle } from '../../components/ui';
import { AxisStrip, RouteMap, TemperatureChart } from '../../components/charts';

type ShipmentBatchEntry = {
  shipmentId: string;
  shipment: { id: string; status: string; dispatchedAt: string | null; deliveredAt: string | null };
};

/** getBatch's full response nests the whole Drug row, not the narrow list-view pick. */
type FullBatch = Omit<Batch, 'drug'> & { drug?: Drug; shipmentBatch?: ShipmentBatchEntry[] };

function fmtDT(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtClock(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

interface Stage {
  idx: string;
  label: string;
  meta: string;
  state: 'done' | 'warn' | 'bad' | 'pending';
}

export default function Trace() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [batch, setBatch] = useState<FullBatch | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);

  const handleTrace = async () => {
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setNotFound(null);
    setBatch(null);
    setShipment(null);
    setExcursions([]);
    setPoints([]);
    try {
      const resolved = await resolveQr(value);
      const full = await getBatch(resolved.batchId);
      setBatch(full as FullBatch);

      const entries: ShipmentBatchEntry[] = (full as FullBatch).shipmentBatch ?? [];
      const latest = entries[entries.length - 1];
      if (latest) {
        try {
          const [ship, tel] = await Promise.all([getShipment(latest.shipmentId), getTelemetry(latest.shipmentId)]);
          setShipment(ship);
          setExcursions(ship.excursions);
          setPoints(tel.points);
        } catch {
          /* shipment detail is optional context */
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('404')) {
        setNotFound(value);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const shipmentEntries: ShipmentBatchEntry[] = batch?.shipmentBatch ?? [];
  const qcChronological = [...(batch?.qcRecords ?? [])].reverse();
  const openExcursion = excursions.find((e) => !e.endedAt) ?? excursions[0] ?? null;

  // Stage rail: manufacture -> QC -> shipments -> (excursion) -> current.
  const stages: Stage[] = batch
    ? [
        { idx: '01', label: 'Manufactured', meta: fmtDT(batch.mfgDate), state: 'done' as const },
        ...qcChronological.map((qc) => ({
          idx: '02',
          label: qc.result === 'FAIL' ? 'QC failed' : 'QC passed',
          meta: fmtDT(qc.testedAt),
          state: (qc.result === 'FAIL' ? 'bad' : 'done') as Stage['state'],
        })),
        ...shipmentEntries.map((entry) => ({
          idx: '03',
          label: `Shipment ${entry.shipment.status.replace(/_/g, ' ')}`,
          meta: entry.shipment.deliveredAt
            ? `delivered ${fmtDT(entry.shipment.deliveredAt)}`
            : entry.shipment.dispatchedAt
              ? `dispatched ${fmtDT(entry.shipment.dispatchedAt)}`
              : entry.shipmentId.slice(0, 8).toUpperCase(),
          state: (entry.shipment.status === 'RECALLED' ? 'bad' : 'done') as Stage['state'],
        })),
        ...(openExcursion
          ? [
              {
                idx: '04',
                label: `Excursion · ${openExcursion.severity}`,
                meta: `${fmtClock(openExcursion.startedAt)}${openExcursion.endedAt ? `–${fmtClock(openExcursion.endedAt)}` : ' open'}`,
                state: (openExcursion.severity === 'CRITICAL' ? 'bad' : 'warn') as Stage['state'],
              },
            ]
          : []),
      ]
    : [];

  const stageColor = (s: Stage['state']) => (s === 'bad' ? C.red : s === 'warn' ? C.amber : C.ink);

  // Temperature at the breach, from the linked shipment's telemetry.
  const tempPoints = points.filter((p) => p.tempC != null) as Array<TelemetryPoint & { tempC: number }>;
  const seriesStart = tempPoints.length ? new Date(tempPoints[0].ts).getTime() : 0;
  const seriesEnd = tempPoints.length ? new Date(tempPoints[tempPoints.length - 1].ts).getTime() : 0;
  const seriesSpan = seriesEnd - seriesStart || 1;
  const bands = excursions.map((e) => {
    const from = (new Date(e.startedAt).getTime() - seriesStart) / seriesSpan;
    const to = ((e.endedAt ? new Date(e.endedAt).getTime() : seriesEnd) - seriesStart) / seriesSpan;
    return { from: Math.max(0, Math.min(1, from)), to: Math.max(0, Math.min(1, to)) };
  });
  const breachTicks = tempPoints.length
    ? [tempPoints[0]!.ts, ...(openExcursion ? [openExcursion.startedAt] : []), tempPoints[tempPoints.length - 1]!.ts].map(fmtClock)
    : [];

  const traceMeta = batch
    ? [
        { k: 'Batch', v: batch.id.slice(0, 8).toUpperCase() },
        { k: 'Lot', v: batch.lotNumber },
        { k: 'Quantity', v: `${batch.quantity.toLocaleString('en-IN')} units` },
        { k: 'Destination', v: shipment?.supplyOrder?.institution?.name ?? '—' },
        { k: 'Status', v: batch.status.replace(/_/g, ' ') },
      ]
    : [];

  return (
    <>
      {batch && (
        <div style={{ background: GRAD.ink, borderBottom: `1px solid ${C.border}`, padding: '22px 26px', boxShadow: SHADOW.md }}>
          <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: '#B8B4AC' }}>
            Supply chain · {batch.lotNumber}
          </div>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 14, overflowX: 'auto' }}>
            {stages.map((s, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  minWidth: 104,
                  borderTop: `3px solid ${stageColor(s.state)}`,
                  padding: '11px 12px 0',
                  animation: rise(i * 60),
                }}
              >
                <div style={{ font: `500 9px/1 ${MONO}`, letterSpacing: '.1em', color: '#8B877F' }}>{s.idx}</div>
                <div
                  style={{
                    font: `600 11px/1.3 ${FONT}`,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    color: s.state === 'bad' ? '#F3928C' : s.state === 'warn' ? '#F0C179' : '#F7F6F3',
                    marginTop: 7,
                  }}
                >
                  {s.label}
                </div>
                <div style={{ font: `400 10px/1.4 ${MONO}`, color: '#9A968D', marginTop: 5 }}>{s.meta}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: batch ? '26px 26px 52px' : 26 }}>
        {!batch && (
          <div style={{ display: 'grid', gap: 18, maxWidth: 720, animation: rise(0) }}>
            <div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTrace();
                  }}
                  placeholder="QR payload or lot number"
                  style={{
                    flex: 1,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '9px 12px',
                    font: `400 13px/1.4 ${FONT}`,
                    color: C.ink,
                    background: C.surface,
                  }}
                />
                <button
                  onClick={handleTrace}
                  disabled={loading || !query.trim()}
                  style={{
                    border: 0,
                    background: C.ink,
                    color: C.bg,
                    font: `600 12px/1 ${FONT}`,
                    padding: '9px 16px',
                    borderRadius: 4,
                    cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                    boxShadow: SHADOW.sm,
                  }}
                >
                  {loading ? 'Tracing…' : 'Trace'}
                </button>
              </div>
              <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 6 }}>
                Scan or type a QR payload, or enter a lot number.
              </div>
            </div>

            {error && (
              <Panel accent={C.red} style={{ padding: 16, borderColor: '#E4C7C4', background: C.redTint }}>
                <div style={{ font: `600 12px/1.4 ${FONT}`, color: C.red }}>Cannot reach vayu-api</div>
                <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted, marginTop: 5 }}>{error}</div>
              </Panel>
            )}

            {notFound && (
              <Panel>
                <EmptyState glyph="◇" title="No match" hint={`No batch matching "${notFound}".`} />
              </Panel>
            )}

            {!error && !notFound && (
              <Panel>
                <EmptyState glyph="⛓" title="Trace a batch" hint="Trace a batch to see its full custody chain — manufacture through complaint." />
              </Panel>
            )}
          </div>
        )}

        {batch && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,0.95fr)', gap: 24 }}>
            <Panel accent={C.ink} delayMs={0}>
              <PanelTitle
                dot={C.ink}
                right={
                  <button
                    onClick={() => {
                      setBatch(null);
                      setQuery('');
                    }}
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      font: `500 12px/1 ${FONT}`,
                      color: C.ink,
                      padding: '6px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Export bundle
                  </button>
                }
              >
                Event spine
              </PanelTitle>
              <div style={{ padding: '16px 14px 4px' }}>
                <EventStep color={C.ink} label="Manufactured" time={fmtDT(batch.mfgDate)} detail={`Lot ${batch.lotNumber}, ${batch.quantity.toLocaleString('en-IN')} units.`} />
                {qcChronological.map((qc, i) => (
                  <EventStep
                    key={qc.id}
                    color={qc.result === 'FAIL' ? C.red : C.ink}
                    label={`QC ${qc.result}`}
                    time={fmtDT(qc.testedAt)}
                    detail={`${qc.inspector ?? 'Unknown inspector'}. ${qc.notes ?? ''}`}
                    isLast={i === qcChronological.length - 1 && shipmentEntries.length === 0 && !openExcursion}
                  />
                ))}
                {shipmentEntries.map((entry, i) => (
                  <EventStep
                    key={entry.shipmentId}
                    color={entry.shipment.status === 'RECALLED' ? C.red : C.ink}
                    label={`Shipment ${entry.shipment.status.replace(/_/g, ' ')}`}
                    time={entry.shipment.deliveredAt ? fmtDT(entry.shipment.deliveredAt) : fmtDT(entry.shipment.dispatchedAt)}
                    detail={entry.shipmentId.slice(0, 8).toUpperCase()}
                    isLast={i === shipmentEntries.length - 1 && !openExcursion}
                  />
                ))}
                {openExcursion && (
                  <EventStep
                    color={C.amber}
                    label={`Excursion · ${openExcursion.severity}`}
                    time={fmtDT(openExcursion.startedAt)}
                    detail={`Peak ${openExcursion.maxTempC?.toFixed(1) ?? '—'} °C${
                      openExcursion.durationMin != null ? `, ${openExcursion.durationMin} min above band` : ''
                    }.`}
                    isLast
                  />
                )}
              </div>
            </Panel>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {shipment && (
                <Panel accent={C.accent} delayMs={60} style={{ overflow: 'hidden' }}>
                  <PanelTitle
                    dot={C.accent}
                    right={
                      <span style={{ font: `400 11px/1 ${MONO}`, color: C.inkSoft }}>
                        {Math.round((shipment.progressPct ?? 0) * 100)}% · ETA {fmtClock(shipment.etaAt)}
                      </span>
                    }
                  >
                    Route · {shipment.id.slice(0, 8).toUpperCase()}
                  </PanelTitle>
                  <RouteMap
                    progress={shipment.progressPct ?? 0}
                    origin="ORIGIN"
                    destination={(shipment.supplyOrder?.institution?.name ?? 'DESTINATION').toUpperCase()}
                    now={`NOW · ${Math.round((shipment.progressPct ?? 0) * 100)}%`}
                    incident={openExcursion ? `EXCURSION ${fmtClock(openExcursion.startedAt)}` : undefined}
                    height={220}
                  />
                </Panel>
              )}

              <Panel accent={C.amber} delayMs={100}>
                <PanelTitle dot={C.amber}>Temperature at the breach</PanelTitle>
                <div style={{ padding: '18px 20px' }}>
                  {tempPoints.length === 0 ? (
                    <EmptyState height={140} title="No telemetry" hint="No temperature telemetry linked to this batch." />
                  ) : (
                    <>
                      <TemperatureChart readings={tempPoints.map((p) => ({ ts: p.ts, tempC: p.tempC }))} bands={bands} height={150} />
                      <AxisStrip labels={breachTicks} />
                    </>
                  )}
                </div>
              </Panel>

              <Panel accent={C.green} delayMs={140}>
                <PanelTitle dot={C.green}>Where it went</PanelTitle>
                <div style={{ padding: '6px 14px 14px' }}>
                  {traceMeta.map((m) => (
                    <div
                      key={m.k}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '9px 0',
                        borderBottom: `1px solid ${C.borderSoft}`,
                        font: `400 12px/1.4 ${FONT}`,
                      }}
                    >
                      <span style={{ color: C.inkFaint }}>{m.k}</span>
                      <span style={{ fontWeight: 500, textAlign: 'right', color: C.ink }}>{m.v}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      font: `600 11px/1 ${FONT}`,
                      letterSpacing: '.17em',
                      textTransform: 'uppercase',
                      color: C.inkFaint,
                      marginTop: 14,
                    }}
                  >
                    Same-vehicle exposure
                  </div>
                  <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted, marginTop: 8 }}>
                    {shipmentEntries.length > 1
                      ? `This batch rode ${shipmentEntries.length} shipments end to end.`
                      : 'No other shipments recorded for this batch.'}
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function EventStep({
  color,
  label,
  time,
  detail,
  isLast,
}: {
  color: string;
  label: string;
  time: string;
  detail: string;
  isLast?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10 }}>
        <span style={{ width: 10, height: 10, background: color, display: 'inline-block', boxShadow: `0 0 0 3px ${color}1A` }} />
        {!isLast && <span style={{ width: 1, flex: 1, background: C.border, minHeight: 24 }} />}
      </div>
      <div style={{ paddingBottom: 20, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
          <span style={{ font: `600 15px/1.4 ${FONT}`, color }}>{label}</span>
          <span style={{ font: `400 11px/1 ${MONO}`, color: C.inkFaint }}>{time}</span>
        </div>
        <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted, marginTop: 5, maxWidth: 620 }}>{detail}</div>
      </div>
    </div>
  );
}
