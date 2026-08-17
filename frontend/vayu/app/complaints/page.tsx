'use client';

/**
 * Complaints + RCA — institution-filed issues, pre-linked to batch and shipment.
 */

import { useCallback, useEffect, useState } from 'react';

import { getComplaints, setComplaintStatus, type Complaint } from '../../lib/api';
import { C, FONT, MONO, rise, statusColors } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, KpiBand, Kpi, PageHeader, Segmented } from '../../components/ui';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'INVESTIGATING', label: 'Investigating' },
  { value: 'RESOLVED', label: 'Resolved' },
];

function drugName(c: Complaint): string {
  return c.drug?.name ?? c.batch?.drug.name ?? 'Unknown drug';
}

function links(c: Complaint): string {
  const parts: string[] = [];
  if (c.batch?.lotNumber) parts.push(c.batch.lotNumber);
  if (c.shipment?.id) parts.push(c.shipment.id.slice(0, 8).toUpperCase());
  if (c.institution?.name) parts.push(c.institution.name);
  if (c.photoUrls?.length) parts.push(`${c.photoUrls.length} photo${c.photoUrls.length === 1 ? '' : 's'}`);
  return parts.join(' · ') || '—';
}

interface Rca {
  narrative?: string;
  narrative2?: string;
  summary?: string;
  cause?: string;
  assigned?: string;
  assignedTeam?: string;
  replacement?: string;
  vehicle?: string;
  vehicleStatus?: string;
  [k: string]: unknown;
}

export default function ComplaintsPage() {
  const [filter, setFilter] = useState('');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}&take=200` : '?take=200';
      const res = await getComplaints(q);
      setComplaints(res.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (complaints.length && !selectedId) {
      setSelectedId(complaints[0]!.id);
    }
    if (selectedId && !complaints.some((c) => c.id === selectedId)) {
      setSelectedId(complaints[0]?.id ?? null);
    }
  }, [complaints, selectedId]);

  const selected = complaints.find((c) => c.id === selectedId) ?? null;
  const rca = (selected?.rcaJson ?? null) as Rca | null;

  const open = complaints.filter((c) => c.status === 'OPEN').length;
  const investigating = complaints.filter((c) => c.status === 'INVESTIGATING').length;
  const resolved = complaints.filter((c) => c.status === 'RESOLVED').length;
  const withRca = complaints.filter((c) => c.rcaJson != null).length;

  const transition = async (id: string, status: string) => {
    setBusy(true);
    try {
      await setComplaintStatus(id, status);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const evidence = selected
    ? [
        selected.batch?.lotNumber && { kind: 'BATCH', label: `Batch ${selected.batch.lotNumber} linked to this complaint` },
        selected.shipment?.id && {
          kind: 'SHIP',
          label: `Shipment ${selected.shipment.id.slice(0, 8).toUpperCase()} · ${selected.shipment.status}${
            selected.shipment.excursionCount > 0 ? ` · ${selected.shipment.excursionCount} excursion(s)` : ''
          }`,
        },
        selected.photoUrls?.length && { kind: 'PHOTO', label: `${selected.photoUrls.length} institution photo(s) attached` },
        selected.description && { kind: 'DESC', label: selected.description },
        selected.institution?.name && { kind: 'INST', label: `Filed by ${selected.institution.name}` },
      ].filter((x): x is { kind: string; label: string } => Boolean(x))
    : [];

  return (
    <>
      <PageHeader title="Complaints + Root Cause" right={<Segmented options={FILTERS} value={filter} onChange={setFilter} />} />

      <KpiBand columns={4}>
        <Kpi label="Open" value={open} deltaColor={open ? C.amber : C.grey} />
        <Kpi label="Investigating" value={investigating} deltaColor={C.accent} />
        <Kpi label="Resolved" value={resolved} deltaColor={C.green} />
        <Kpi label="With RCA" value={withRca} />
      </KpiBand>

      {error && (
        <div style={{ padding: '18px 26px 0' }}>
          <ApiError error={error} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1.25fr)', gap: 24, padding: '26px 26px 52px' }}>
        <Card style={{ animation: rise(0) }}>
          <CardTitle>Complaints</CardTitle>
          {complaints.length === 0 ? (
            <Empty>No complaints match this filter.</Empty>
          ) : (
            <div>
              {complaints.map((c) => {
                const sc = statusColors(c.status);
                const active = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      padding: '17px 18px',
                      borderBottom: `1px solid ${C.borderSoft}`,
                      cursor: 'pointer',
                      background: active ? C.accentTint : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
                        {c.status}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(c.id);
                        }}
                        style={{
                          border: 0,
                          background: 'transparent',
                          padding: 0,
                          cursor: 'pointer',
                          font: `500 12px/1 ${MONO}`,
                          color: C.ink,
                          borderBottom: `1px dotted ${C.inkGhost}`,
                          textAlign: 'left',
                        }}
                      >
                        {c.id.slice(0, 8).toUpperCase()}
                      </button>
                      <div style={{ flex: 1 }} />
                      <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: '.06em', color: C.inkSoft }}>
                        {c.assignedTeam ?? 'UNASSIGNED'}
                      </span>
                    </div>
                    <div style={{ font: `500 13px/1.45 ${FONT}`, marginTop: 8, color: C.ink }}>
                      {c.category} · {drugName(c)}
                    </div>
                    <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.inkFaint, marginTop: 4 }}>{links(c)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ borderLeft: `2px solid ${C.ink}`, animation: rise(60) }}>
            <CardTitle right={<span style={{ font: `500 11px/1 ${MONO}`, color: C.inkMuted }}>CONFIDENCE 0.86</span>}>
              Nidana · root cause
            </CardTitle>
            {!selected ? (
              <div style={{ padding: 20 }}>
                <Empty>Select a complaint.</Empty>
              </div>
            ) : (
              <div style={{ padding: 20 }}>
                <div style={{ font: `600 17px/1.3 ${MONO}`, letterSpacing: '-.02em', color: C.ink }}>
                  {selected.id.slice(0, 8).toUpperCase()}
                </div>
                <div style={{ font: `400 11px/1.6 ${MONO}`, color: C.inkFaint, marginTop: 5 }}>
                  {selected.category} · {selected.batch?.lotNumber ?? '—'} · {selected.shipment?.id.slice(0, 8).toUpperCase() ?? '—'} ·{' '}
                  {selected.institution?.name ?? '—'}
                </div>

                {rca ? (
                  <>
                    <div
                      style={{
                        font: `400 14px/1.8 ${FONT}`,
                        color: C.inkMuted,
                        marginTop: 12,
                        animation: 'mtRise .5s cubic-bezier(.16,1,.3,1) .18s both',
                      }}
                    >
                      {rca.narrative ?? rca.summary ?? rca.cause ?? 'Root cause narrative unavailable for this complaint.'}
                    </div>
                    {rca.narrative2 && (
                      <div
                        style={{
                          font: `400 14px/1.8 ${FONT}`,
                          color: C.inkMuted,
                          marginTop: 10,
                          animation: 'mtRise .5s cubic-bezier(.16,1,.3,1) .4s both',
                        }}
                      >
                        {rca.narrative2}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 14,
                        borderTop: `1px solid ${C.borderSoft}`,
                        marginTop: 14,
                        paddingTop: 13,
                      }}
                    >
                      <RcaStat label="Assigned" value={rca.assignedTeam ?? rca.assigned ?? selected.assignedTeam ?? '—'} />
                      <RcaStat label="Replacement" value={rca.replacement ?? '—'} />
                      <RcaStat
                        label="Vehicle"
                        value={rca.vehicleStatus ?? rca.vehicle ?? '—'}
                        color={rca.vehicleStatus ? C.amber : undefined}
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted, marginTop: 12 }}>
                    {selected.description ?? 'No root-cause analysis has been attached to this complaint yet.'}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card style={{ animation: rise(120) }}>
            <CardTitle right={<span style={{ font: `400 11px/1 ${MONO}`, color: C.inkSoft }}>{evidence.length} items</span>}>
              Evidence bundle
            </CardTitle>
            {!selected ? (
              <Empty>Select a complaint.</Empty>
            ) : evidence.length === 0 ? (
              <Empty>No evidence attached.</Empty>
            ) : (
              evidence.map((ev, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}` }}
                >
                  <span
                    style={{
                      font: `600 9px/1 ${MONO}`,
                      letterSpacing: '.08em',
                      background: C.borderSoft,
                      color: C.inkMuted,
                      padding: '4px 6px',
                      width: 52,
                      textAlign: 'center',
                      flex: '0 0 52px',
                    }}
                  >
                    {ev.kind}
                  </span>
                  <span style={{ flex: 1, font: `400 12px/1.5 ${FONT}`, color: C.ink }}>{ev.label}</span>
                </div>
              ))
            )}
            <div style={{ padding: 20 }}>
              <button
                onClick={() => selected && transition(selected.id, selected.status === 'OPEN' ? 'INVESTIGATING' : 'RESOLVED')}
                disabled={busy || !selected}
                style={{
                  border: 0,
                  background: C.ink,
                  color: C.bg,
                  font: `500 12px/1 ${FONT}`,
                  padding: '11px 13px',
                  borderRadius: 4,
                  cursor: busy || !selected ? 'not-allowed' : 'pointer',
                  width: '100%',
                  opacity: busy || !selected ? 0.6 : 1,
                }}
              >
                Send RCA to institution
              </button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function RcaStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
        {label}
      </div>
      <div style={{ font: `600 13px/1 ${MONO}`, marginTop: 7, color: color ?? C.ink }}>{value}</div>
    </div>
  );
}
