'use client';

/**
 * Complaints + RCA — institution-filed issues, pre-linked to batch and shipment.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  generateComplaintRca,
  getComplaints,
  getComplaintsRcaSummary,
  setComplaintStatus,
  type Complaint,
  type RcaInsights,
  type RcaSummary,
} from '../../lib/api';
import { C, FONT, MONO, rise, statusColors, VIZ } from '../../lib/theme';
import {
  ApiError,
  Button,
  EmptyState,
  KpiHero,
  PageHeader,
  Panel,
  PanelTitle,
  Pill,
  Segmented,
  Trend,
} from '../../components/ui';
import { StepRail } from '../../components/charts';
import { RcaDashboard } from './RcaCharts';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'INVESTIGATING', label: 'Investigating' },
  { value: 'RESOLVED', label: 'Resolved' },
];

function drugName(c: Complaint): string {
  return c.drug?.name ?? c.batch?.drug.name ?? 'Unknown drug';
}

export default function ComplaintsPage() {
  const [filter, setFilter] = useState('');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rcaSummary, setRcaSummary] = useState<RcaSummary | null>(null);
  const [rcaInsights, setRcaInsightsState] = useState<RcaInsights | null>(null);
  const [rcaLoading, setRcaLoading] = useState(true);
  const [rcaGenerating, setRcaGenerating] = useState(false);

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
    if (selectedId && !complaints.some((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [complaints, selectedId]);

  useEffect(() => {
    let cancelled = false;
    setRcaLoading(true);
    getComplaintsRcaSummary()
      .then((r) => {
        if (cancelled) return;
        setRcaSummary(r.summary);
        setRcaInsightsState(r.insights);
      })
      .catch(() => {
        /* dashboard is a bonus panel — the complaint list above already reported the error */
      })
      .finally(() => {
        if (!cancelled) setRcaLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-narrate once per mount; status-change refetches above don't need to re-trigger Groq.
  }, []);

  const selected = complaints.find((c) => c.id === selectedId) ?? null;

  async function runRca(id: string) {
    setRcaGenerating(true);
    try {
      const rca = await generateComplaintRca(id);
      setComplaints((prev) => prev.map((c) => (c.id === id ? { ...c, rcaJson: rca } : c)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRcaGenerating(false);
    }
  }

  const open = complaints.filter((c) => c.status === 'OPEN').length;
  const investigating = complaints.filter((c) => c.status === 'INVESTIGATING').length;
  const resolved = complaints.filter((c) => c.status === 'RESOLVED').length;
  const withRca = complaints.filter((c) => c.rcaJson != null).length;
  const linkedToShipment = complaints.filter((c) => c.shipment != null).length;

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

  return (
    <>
      <PageHeader
        title="Complaints + Root Cause"
        subtitle="Institution-filed issues, pre-linked to batch and shipment — zero manual ID entry."
        right={<Segmented options={FILTERS} value={filter} onChange={setFilter} />}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero
          index={0}
          label="Open"
          value={open}
          accent={C.amber}
          trend={<Trend value={open} goodDirection="down" />}
        />
        <KpiHero
          index={1}
          label="Investigating"
          value={investigating}
          accent={C.accent}
          sub="Currently under review"
        />
        <KpiHero index={2} label="Resolved" value={resolved} accent={C.green} sub="Closed this window" />
        <KpiHero
          index={3}
          label="Pre-linked to shipment"
          value={`${linkedToShipment}/${complaints.length || 0}`}
          accent={VIZ.violet}
          sub="Zero manual ID entry"
        />
      </div>

      <div style={{ padding: '26px 26px 52px', display: 'grid', gap: 24 }}>
        {error && <ApiError error={error} />}

        <RcaDashboard summary={rcaSummary} insights={rcaInsights} loading={rcaLoading} />

        {/* The handoff pairs the queue against the root cause: a narrow list on
            the left, the evidence and narration filling the right. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1.25fr)',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <Panel accent={C.ink} delayMs={0} style={{ animation: rise(0) }}>
            <PanelTitle dot={C.ink}>Complaints</PanelTitle>
            {complaints.length === 0 ? (
              <EmptyState title="No complaints" hint="No complaints match this filter." />
            ) : (
              <div style={{ maxHeight: 640, overflowY: 'auto' }}>
                {complaints.map((c, i) => {
                  const active = c.id === selectedId;
                  const sc = statusColors(c.status);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '17px 18px',
                        border: 0,
                        borderLeft: `2px solid ${active ? C.ink : 'transparent'}`,
                        borderBottom: `1px solid ${C.borderSoft}`,
                        background: active ? C.bg : 'transparent',
                        cursor: 'pointer',
                        animation: rise(i * 30),
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
                        <span
                          style={{
                            font: `500 12px/1 ${MONO}`,
                            color: C.ink,
                            borderBottom: `1px dotted ${C.inkGhost}`,
                          }}
                        >
                          {c.id.slice(0, 8)}
                        </span>
                        {c.shipment && (
                          <span
                            style={{
                              font: `600 9px/1 ${MONO}`,
                              letterSpacing: '.06em',
                              padding: '3px 6px',
                              borderRadius: 3,
                              background: C.accentTint,
                              color: C.accent,
                              whiteSpace: 'nowrap',
                            }}
                            title="Auto-linked to shipment — no manual ID entry"
                          >
                            ⛓ LINKED
                          </span>
                        )}
                        <div style={{ flex: 1 }} />
                        <span style={{ font: `400 10px/1 ${MONO}`, color: C.inkSoft }}>
                          {new Date(c.filedAt).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      <div style={{ font: `500 13px/1.45 ${FONT}`, color: C.ink, marginTop: 8 }}>
                        {c.category} · {drugName(c)}
                      </div>
                      <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.inkFaint, marginTop: 4 }}>
                        {c.institution?.name ?? 'Unknown institution'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel accent={C.accent} delayMs={40} style={{ flex: '2 1 480px', minWidth: 340 }}>
            <PanelTitle dot={C.accent}>Detail</PanelTitle>
            {!selected ? (
              <EmptyState title="Nothing selected" hint="Select a complaint from the queue to see its evidence." />
            ) : (
              <div style={{ padding: 18, display: 'grid', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Pill label={selected.category} />
                  <Pill label={selected.status} />
                  <span style={{ font: `500 15px/1.3 ${FONT}`, color: C.ink }}>{drugName(selected)}</span>
                </div>

                {selected.shipment && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 13px',
                      background: C.accentTint,
                      border: `1px solid ${C.accent}33`,
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ font: `600 13px/1 ${MONO}`, color: C.accent }}>⛓</span>
                    <div>
                      <div style={{ font: `600 11px/1.4 ${FONT}`, color: C.ink }}>
                        Pre-linked to shipment {selected.shipment.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkFaint }}>
                        {selected.shipment.status.replace(/_/g, ' ')} · {selected.shipment.excursionCount} excursion
                        {selected.shipment.excursionCount === 1 ? '' : 's'} · matched automatically, no manual entry.
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Assigned team" value={selected.assignedTeam ?? '—'} />
                  <Field label="Institution" value={selected.institution?.name ?? '—'} />
                  <Field label="Lot number" value={selected.batch?.lotNumber ?? '—'} />
                  <Field label="Photos" value={String(selected.photoUrls?.length ?? 0)} />
                </div>

                <div>
                  <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost, marginBottom: 6 }}>
                    Description
                  </div>
                  <div style={{ font: `400 13px/1.6 ${FONT}`, color: C.inkMuted }}>
                    {selected.description ?? 'No description provided.'}
                  </div>
                </div>

                {/* Custody rail — the evidence bundle beside the narrative prose. */}
                <div>
                  <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost, marginBottom: 8 }}>
                    Evidence chain
                  </div>
                  <StepRail
                    steps={[
                      { label: 'Complaint filed', time: new Date(selected.filedAt).toLocaleString('en-GB'), dot: C.ink },
                      ...(selected.batch
                        ? [{ label: `Batch ${selected.batch.lotNumber}`, time: selected.batch.drug.name, dot: C.accent }]
                        : []),
                      ...(selected.shipment
                        ? [
                            {
                              label: `Shipment ${selected.shipment.status.replace(/_/g, ' ')}`,
                              time: `${selected.shipment.excursionCount} excursion(s) recorded`,
                              dot: selected.shipment.excursionCount > 0 ? C.amber : C.green,
                            },
                          ]
                        : []),
                      {
                        label: selected.status === 'RESOLVED' ? 'Resolved' : selected.status === 'INVESTIGATING' ? 'Under investigation' : 'Awaiting triage',
                        time: selected.assignedTeam ?? 'Unassigned',
                        dot: statusColors(selected.status).color,
                      },
                    ]}
                  />
                </div>

                {selected.rcaJson == null ? (
                  <div>
                    <Button onClick={() => runRca(selected.id)} disabled={rcaGenerating}>
                      {rcaGenerating ? 'Analysing…' : 'Generate root-cause analysis'}
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost }}>
                        Root cause
                      </div>
                      <button
                        onClick={() => runRca(selected.id)}
                        disabled={rcaGenerating}
                        style={{
                          border: 0,
                          background: 'transparent',
                          color: C.accent,
                          font: `600 11px/1.2 ${FONT}`,
                          cursor: rcaGenerating ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {rcaGenerating ? '…' : 'Regenerate'}
                      </button>
                    </div>
                    <div style={{ font: `400 13px/1.6 ${FONT}`, color: C.inkMuted }}>
                      {selected.rcaJson.probable_cause}
                    </div>
                    {selected.rcaJson.contributing_pattern && (
                      <div style={{ font: `400 12.5px/1.6 ${FONT}`, color: C.amber, background: C.amberTint, padding: '8px 12px', borderRadius: 3 }}>
                        {selected.rcaJson.contributing_pattern}
                      </div>
                    )}
                    <div>
                      <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost, marginBottom: 6 }}>
                        Recommended actions
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 5 }}>
                        {selected.rcaJson.recommended_actions.map((a, i) => (
                          <li key={i} style={{ font: `400 12.5px/1.5 ${FONT}`, color: C.inkMuted }}>
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ font: `400 10.5px/1.4 ${MONO}`, color: C.inkGhost }}>
                      narration: {selected.rcaJson.source} · the model never queries the database — it narrates a JSON
                      evidence bundle assembled by code.
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  {selected.status === 'OPEN' && (
                    <Button onClick={() => transition(selected.id, 'INVESTIGATING')} disabled={busy}>
                      Start investigation
                    </Button>
                  )}
                  {selected.status === 'INVESTIGATING' && (
                    <Button onClick={() => transition(selected.id, 'RESOLVED')} disabled={busy}>
                      Mark resolved
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ font: `500 13px/1.4 ${FONT}`, color: C.ink }}>{value}</div>
    </div>
  );
}
