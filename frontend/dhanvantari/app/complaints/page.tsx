'use client';

/**
 * Complaints + RCA — every complaint this institution has filed, and the
 * supplier's root-cause reply where one has come back over the signed
 * contract.
 */

import { useEffect, useMemo, useState } from 'react';

import { fileComplaint, getComplaints, getIncoming, type IncomingShipment, type LocalComplaint } from '../../lib/api';
import { C, FONT, MONO, VIZ } from '../../lib/theme';
import { ApiError, Button, EmptyState, KpiHero, Mono, PageHeader, Panel, PanelTitle, Pill, Segmented } from '../../components/ui';
import { PieChart, BarChart } from '../../components/charts';

const PALETTE = [VIZ.violet, VIZ.amber, VIZ.rose, VIZ.blue, VIZ.green, VIZ.slate];

// This app's convention for "this institution, calling about itself" — the
// same literal `scanin/page.tsx` and `orders/page.tsx` (SELF_INSTITUTION_ID)
// already use for self-referential institutionId. There is no per-institution
// session/config in this single-institution-scope app, so this is the only
// real source; reused verbatim rather than inventing a new literal.
const SELF_INSTITUTION_ID = 'self';

/** The six `ComplaintCategory` enum values the backend accepts, paired with a
 * human-readable label for the picker. Submitting always sends the raw enum
 * string on the left, never the label. */
const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'BREAKAGE', label: 'Breakage' },
  { value: 'QTY_MISMATCH', label: 'Quantity mismatch' },
  { value: 'SEAL_TAMPERED', label: 'Seal tampered' },
  { value: 'TEMP_DAMAGE', label: 'Temperature damage' },
  { value: 'WRONG_ITEM', label: 'Wrong item' },
  { value: 'NEAR_EXPIRY', label: 'Near expiry' },
];

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function Complaints() {
  const [items, setItems] = useState<LocalComplaint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shipments, setShipments] = useState<IncomingShipment[]>([]);

  // File-a-complaint panel state.
  const [formOpen, setFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<string>('');
  const [formDescription, setFormDescription] = useState('');
  const [formShipmentId, setFormShipmentId] = useState('');
  const [formBatchId, setFormBatchId] = useState('');
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ complaintId: string; status: string } | null>(null);

  const loadComplaints = async () => {
    try {
      const res = await getComplaints();
      setItems(res.items);
      setError(null);
      if (res.items.length > 0) setSelectedId((cur) => cur ?? res.items[0].id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    loadComplaints();
    // Recent incoming shipments — already-exported read endpoint, used here so
    // the complaint form can offer a real shipment/batch picker instead of a
    // free-text ID field. Never fabricated: if this list is empty, the picker
    // options are simply omitted.
    (async () => {
      try {
        const res = await getIncoming();
        setShipments(res.items);
      } catch {
        // Non-fatal — pre-linking is a bonus, not a requirement of the page.
      }
    })();
  }, []);

  // Batches available to link, drawn from whichever shipment is selected.
  const batchOptions = useMemo(() => {
    const shipment = shipments.find((s) => s.id === formShipmentId);
    return shipment?.receivedBatches ?? [];
  }, [shipments, formShipmentId]);

  function resetForm() {
    setFormCategory('');
    setFormDescription('');
    setFormShipmentId('');
    setFormBatchId('');
    setFormValidationError(null);
  }

  function closeForm() {
    setFormOpen(false);
    resetForm();
  }

  async function handleSubmitComplaint() {
    if (!formCategory) {
      setFormValidationError('Choose a category before submitting.');
      return;
    }
    setFormValidationError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fileComplaint({
        institutionId: SELF_INSTITUTION_ID,
        category: formCategory,
        description: formDescription.trim() || undefined,
        shipmentId: formShipmentId || undefined,
        batchId: formBatchId || undefined,
      });
      setSubmitResult({ complaintId: res.complaintId, status: res.status });
      resetForm();
      setFormOpen(false);
      await loadComplaints();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Complaints + RCA" />
        <div style={{ padding: 26 }}>
          <ApiError error={error} service="dhanvantari-api" />
        </div>
      </>
    );
  }

  const open = items.filter((c) => c.remoteStatus !== 'RESOLVED').length;
  const withRca = items.filter((c) => c.rcaSummary != null).length;
  const pendingSync = items.filter((c) => c.remoteStatus === 'PENDING_SYNC').length;
  const selected = items.find((c) => c.id === selectedId) ?? null;

  // Pie chart — complaints by category
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of items) {
      map.set(c.category, (map.get(c.category) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([cat, count], i) => ({
      label: cat,
      value: count,
      color: PALETTE[i % PALETTE.length],
    }));
  }, [items]);

  // Bar chart — complaints by status
  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of items) {
      const status = c.remoteStatus ?? 'PENDING';
      map.set(status, (map.get(status) ?? 0) + 1);
    }
    const statusColor = (s: string) => {
      if (s === 'RESOLVED') return C.green;
      if (s === 'INVESTIGATING') return C.accent;
      if (s === 'OPEN') return C.amber;
      return C.grey;
    };
    return Array.from(map.entries()).map(([status, count]) => ({
      label: status,
      value: count,
      color: statusColor(status),
    }));
  }, [items]);

  return (
    <>
      <PageHeader
        title="Complaints + RCA"
        right={
          <Button
            variant={formOpen ? 'ghost' : 'primary'}
            onClick={() => {
              if (formOpen) {
                closeForm();
              } else {
                setSubmitResult(null);
                setSubmitError(null);
                setFormOpen(true);
              }
            }}
          >
            {formOpen ? 'Cancel' : '+ File a complaint'}
          </Button>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero index={0} label="Total filed" value={items.length} accent={VIZ.violet} />
        <KpiHero index={1} label="Open" value={open} accent={C.amber} />
        <KpiHero index={2} label="With RCA" value={withRca} accent={VIZ.teal} />
        <KpiHero index={3} label="Pending sync" value={pendingSync} accent={C.grey} />
      </div>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {submitResult && (
          <Panel delayMs={0} accent={C.green}>
            <div style={{ padding: 16, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pill label="FILED" color={C.green} tint={C.greenTint} />
                <span style={{ font: `600 13px/1.4 ${FONT}`, color: C.ink }}>
                  Complaint <Mono>{submitResult.complaintId}</Mono> sent to the manufacturer
                </span>
              </div>
              <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted }}>
                It will appear in their queue once synced. Local status right now:{' '}
                <Pill label={submitResult.status} />
                {submitResult.status === 'PENDING_SYNC' && (
                  <span style={{ marginLeft: 6 }}>
                    — filed here, syncing to the supplier's system over webhook.
                  </span>
                )}
              </div>
              <div>
                <Button variant="ghost" onClick={() => setSubmitResult(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {formOpen && (
          <Panel delayMs={0} accent={C.accent}>
            <PanelTitle>File a complaint</PanelTitle>
            <div style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div>
                <div style={{ font: `600 11px/1.5 ${FONT}`, color: C.inkFaint, letterSpacing: '.06em', marginBottom: 6 }}>
                  CATEGORY <span style={{ color: C.red }}>*</span>
                </div>
                <Segmented
                  options={[{ value: '', label: 'Choose…' }, ...CATEGORY_OPTIONS]}
                  value={formCategory}
                  onChange={(v) => {
                    setFormCategory(v);
                    if (v) setFormValidationError(null);
                  }}
                />
              </div>

              {shipments.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ font: `600 11px/1.5 ${FONT}`, color: C.inkFaint, letterSpacing: '.06em', marginBottom: 6 }}>
                      RELATED SHIPMENT (optional)
                    </div>
                    <select
                      value={formShipmentId}
                      onChange={(e) => {
                        setFormShipmentId(e.target.value);
                        setFormBatchId('');
                      }}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: 4,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        font: `500 12px/1.4 ${FONT}`,
                        color: C.ink,
                      }}
                    >
                      <option value="">None</option>
                      {shipments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id.slice(0, 10)} · {s.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ font: `600 11px/1.5 ${FONT}`, color: C.inkFaint, letterSpacing: '.06em', marginBottom: 6 }}>
                      RELATED BATCH (optional)
                    </div>
                    <select
                      value={formBatchId}
                      onChange={(e) => setFormBatchId(e.target.value)}
                      disabled={batchOptions.length === 0}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: 4,
                        border: `1px solid ${C.border}`,
                        background: batchOptions.length === 0 ? C.raised : C.surface,
                        font: `500 12px/1.4 ${FONT}`,
                        color: C.ink,
                        cursor: batchOptions.length === 0 ? 'not-allowed' : 'auto',
                      }}
                    >
                      <option value="">
                        {batchOptions.length === 0 ? 'Pick a shipment first' : 'None'}
                      </option>
                      {batchOptions.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.id.slice(0, 10)} {b.drugRef ? `· ${b.drugRef}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <div style={{ font: `600 11px/1.5 ${FONT}`, color: C.inkFaint, letterSpacing: '.06em', marginBottom: 6 }}>
                  DESCRIPTION (optional)
                </div>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What's wrong — e.g. 4 of 20 vials arrived cracked, seal intact on the rest."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    background: C.surface,
                    font: `400 12px/1.6 ${FONT}`,
                    color: C.ink,
                    resize: 'vertical',
                  }}
                />
              </div>

              {formValidationError && (
                <div style={{ font: `500 12px/1.5 ${FONT}`, color: C.red }}>{formValidationError}</div>
              )}
              {submitError && <ApiError error={submitError} service="dhanvantari-api" />}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={handleSubmitComplaint} disabled={submitting}>
                  {submitting ? 'Filing…' : 'Submit complaint'}
                </Button>
                <Button variant="ghost" onClick={closeForm} disabled={submitting}>
                  Discard
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {/* Summary charts row */}
        {items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Panel delayMs={0}>
              <PanelTitle>By category</PanelTitle>
              <div style={{ padding: 16, display: 'flex', gap: 18, alignItems: 'center' }}>
                <PieChart data={byCategory} size={130} centre={String(byCategory.reduce((a, d) => a + d.value, 0))} />
                <div style={{ display: 'grid', gap: 6 }}>
                  {byCategory.map((d) => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: d.color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ font: `500 11px/1.3 ${FONT}`, color: C.inkMuted }}>
                        {d.label}{' '}
                        <span style={{ font: `500 11px/1.3 ${MONO}`, color: C.ink }}>{d.value}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel delayMs={40}>
              <PanelTitle>By status</PanelTitle>
              <div style={{ padding: 16 }}>
                <BarChart data={byStatus} />
              </div>
            </Panel>
          </div>
        )}

        {/* List / detail split */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 24 }}>
          <Panel delayMs={60}>
            <PanelTitle>Complaints</PanelTitle>
            {items.length === 0 ? (
              <EmptyState title="No complaints filed yet" height={180} />
            ) : (
              <div>
                {items.map((c) => {
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Pill label={c.category} />
                        <Mono color={active ? C.accent : C.ink}>{c.batchId ? c.batchId.slice(0, 10) : '—'}</Mono>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost }}>{fmtDate(c.filedAt)}</span>
                        <Pill label={c.remoteStatus ?? 'PENDING'} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel delayMs={60}>
            <PanelTitle>Detail</PanelTitle>
            {!selected ? (
              <EmptyState title="Select a complaint" height={160} />
            ) : (
              <div style={{ padding: 16, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Pill label={selected.category} />
                  <Pill label={selected.remoteStatus ?? 'PENDING'} />
                </div>
                <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkMuted }}>
                  Batch: <Mono>{selected.batchId ?? '—'}</Mono>
                </div>
                <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkMuted }}>
                  Shipment: <Mono>{selected.shipmentId ?? '—'}</Mono>
                </div>
                <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkMuted }}>
                  Description: {selected.description ?? '—'}
                </div>
                <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkMuted }}>
                  Photos: <Mono>{selected.photoUrls.length}</Mono>
                </div>

                {selected.rcaSummary && (
                  <Panel delayMs={0} style={{ marginTop: 8 }}>
                    <PanelTitle>Supplier root cause</PanelTitle>
                    <div style={{ padding: 14 }}>
                      <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink }}>{selected.rcaSummary}</div>
                      <div style={{ marginTop: 8, font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
                        Pushed down from the supplier over the signed contract — this institution did not
                        compute it.
                      </div>
                    </div>
                  </Panel>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
