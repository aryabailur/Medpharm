'use client';

/**
 * Complaints + RCA — institution-filed issues, pre-linked to batch and shipment.
 */

import { useCallback, useEffect, useState } from 'react';

import { getComplaints, setComplaintStatus, type Complaint } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, Empty, Kpi, KpiBand, PageHeader, Pill, Segmented } from '../../components/ui';

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

  const selected = complaints.find((c) => c.id === selectedId) ?? null;

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

                {selected.rcaJson != null && (
                  <div>
                    <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost, marginBottom: 6 }}>
                      Evidence
                    </div>
                    <pre
                      style={{
                        font: `400 11px/1.5 ${MONO}`,
                        background: C.greyTint,
                        padding: 12,
                        borderRadius: 4,
                        maxHeight: 320,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(selected.rcaJson, null, 2)}
                    </pre>
                    <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 8 }}>
                      The model never queries the database. It narrates a JSON evidence bundle assembled by code.
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
