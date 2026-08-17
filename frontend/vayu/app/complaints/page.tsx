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
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, Empty, Kpi, KpiBand, PageHeader, Pill, Segmented } from '../../components/ui';
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
        right={<Segmented options={FILTERS} value={filter} onChange={setFilter} />}
      />

      <KpiBand columns={4}>
        <Kpi label="Open" value={open} deltaColor={open ? C.amber : C.grey} />
        <Kpi label="Investigating" value={investigating} deltaColor={C.accent} />
        <Kpi label="Resolved" value={resolved} deltaColor={C.green} />
        <Kpi label="With RCA" value={withRca} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} />}

        <RcaDashboard summary={rcaSummary} insights={rcaInsights} loading={rcaLoading} />

        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <Card style={{ flex: '1 1 380px', minWidth: 320, maxWidth: 440, animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
            <CardTitle>Complaints</CardTitle>
            {complaints.length === 0 ? (
              <Empty>No complaints match this filter.</Empty>
            ) : (
              <div style={{ maxHeight: 640, overflowY: 'auto' }}>
                {complaints.map((c) => {
                  const active = c.id === selectedId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Pill label={c.category} />
                        <span style={{ font: `400 10px/1 ${MONO}`, color: C.inkGhost }}>
                          {new Date(c.filedAt).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      <div style={{ font: `600 13px/1.4 ${FONT}`, color: C.ink, marginTop: 6 }}>{drugName(c)}</div>
                      <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkSoft, marginTop: 2 }}>
                        {c.institution?.name ?? 'Unknown institution'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card style={{ flex: '2 1 480px', minWidth: 340 }}>
            <CardTitle>Detail</CardTitle>
            {!selected ? (
              <Empty>Select a complaint.</Empty>
            ) : (
              <div style={{ padding: 18, display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Pill label={selected.category} />
                  <Pill label={selected.status} />
                  <span style={{ font: `500 15px/1.3 ${FONT}`, color: C.ink }}>{drugName(selected)}</span>
                </div>

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
          </Card>
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
