'use client';

/**
 * Complaints + Root Cause — institution-filed issues, pre-linked to batch
 * and shipment.
 *
 * Client Component: the status filter and the OPEN → INVESTIGATING →
 * RESOLVED transitions are interactive and must refetch in place.
 */

import { useCallback, useEffect, useState } from 'react';

import { getComplaints, setComplaintStatus, type Complaint } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, Empty, Kpi, Mono, PageHeader, Pill } from '../../components/ui';

const FILTERS = ['OPEN', 'INVESTIGATING', 'RESOLVED', ''] as const;

export default function ComplaintsPage() {
  const [filter, setFilter] = useState<string>('');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}&take=100` : '?take=100';
      const c = await getComplaints(q);
      setComplaints(c.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedComplaint = complaints.find((c) => c.id === selected) ?? null;

  async function transition(id: string, status: string) {
    setBusy(true);
    try {
      await setComplaintStatus(id, status);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const open = complaints.filter((c) => c.status === 'OPEN').length;
  const investigating = complaints.filter((c) => c.status === 'INVESTIGATING').length;
  const resolved = complaints.filter((c) => c.status === 'RESOLVED').length;
  const withRca = complaints.filter((c) => c.rcaJson != null).length;

  return (
    <>
      <PageHeader
        title="Complaints + Root Cause"
        subtitle="Institution-filed issues, pre-linked to batch and shipment"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f || 'ALL'}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 11px',
                  borderRadius: 7,
                  border: `1px solid ${filter === f ? C.steel : C.border}`,
                  background: filter === f ? C.steelTint : C.surface,
                  color: filter === f ? C.steel : C.inkFaint,
                  font: `600 11px/1.2 ${FONT}`,
                  cursor: 'pointer',
                }}
              >
                {f || 'All'}
              </button>
            ))}
          </div>
        }
      />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        {error ? (
          <ApiError error={error} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Kpi label="Open" value={open} deltaColor={C.steel} />
              <Kpi label="Investigating" value={investigating} deltaColor={C.amber} />
              <Kpi label="Resolved" value={resolved} deltaColor={C.green} />
              <Kpi label="With RCA" value={withRca} note={complaints.length ? `of ${complaints.length}` : undefined} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 18 }}>
              <Card style={{ maxHeight: 640, overflow: 'auto' }}>
                <CardTitle>Complaints</CardTitle>
                {complaints.length === 0 ? (
                  <Empty>No complaints with status {filter || 'any'}.</Empty>
                ) : (
                  <div>
                    {complaints.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '11px 16px',
                          border: 0,
                          borderBottom: `1px solid ${C.borderSoft}`,
                          background: selected === c.id ? C.steelTint : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Pill label={c.category} />
                          <span style={{ font: `400 11px/1 ${MONO}`, color: C.inkGhost }}>
                            {new Date(c.filedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ font: `500 13px/1.5 ${FONT}`, color: C.ink, marginTop: 5 }}>
                          {c.batch?.drug.name ?? 'Unknown drug'}
                        </div>
                        <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkGhost, marginTop: 2 }}>
                          {c.institution?.name ?? '—'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardTitle>Detail</CardTitle>
                {!selectedComplaint ? (
                  <Empty>Select a complaint.</Empty>
                ) : (
                  <div style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <Pill label={selectedComplaint.category} />
                      <Pill label={selectedComplaint.status} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, font: `400 12px/1.6 ${FONT}`, color: C.inkMuted }}>
                      <div>
                        <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          Assigned team
                        </div>
                        {selectedComplaint.assignedTeam ?? '—'}
                      </div>
                      <div>
                        <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          Institution
                        </div>
                        {selectedComplaint.institution?.name ?? '—'}
                      </div>
                      <div>
                        <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          Batch lot
                        </div>
                        <Mono>{selectedComplaint.batch?.lotNumber ?? '—'}</Mono>
                      </div>
                      <div>
                        <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          Photos
                        </div>
                        {selectedComplaint.photoUrls?.length ?? 0}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Description
                      </div>
                      <div style={{ font: `400 13px/1.6 ${FONT}`, color: C.inkMuted, marginTop: 4 }}>
                        {selectedComplaint.description ?? '—'}
                      </div>
                    </div>

                    {selectedComplaint.status === 'OPEN' && (
                      <Button onClick={() => transition(selectedComplaint.id, 'INVESTIGATING')} disabled={busy}>
                        {busy ? '…' : 'Start investigation'}
                      </Button>
                    )}
                    {selectedComplaint.status === 'INVESTIGATING' && (
                      <Button onClick={() => transition(selectedComplaint.id, 'RESOLVED')} disabled={busy}>
                        {busy ? '…' : 'Mark resolved'}
                      </Button>
                    )}

                    {selectedComplaint.rcaJson != null && (
                      <div>
                        <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                          Evidence
                        </div>
                        <pre
                          style={{
                            font: `400 11px/1.5 ${MONO}`,
                            background: C.greyTint,
                            padding: 12,
                            borderRadius: 8,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            margin: 0,
                          }}
                        >
                          {JSON.stringify(selectedComplaint.rcaJson, null, 2)}
                        </pre>
                        <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 6 }}>
                          The model never queries the database. It narrates a JSON evidence bundle assembled
                          by code.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
