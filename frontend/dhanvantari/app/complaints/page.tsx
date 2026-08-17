'use client';

/**
 * Complaints + RCA — every complaint this institution has filed, and the
 * manufacturer's root-cause reply where one has come back over the signed
 * contract.
 */

import { useEffect, useState } from 'react';

import { getComplaints, type LocalComplaint } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Mono, PageHeader, Pill } from '../../components/ui';

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Evidence rows synthesised from what a complaint actually carries — photos,
// telemetry window, and the manufacturer's RCA reply, never invented data.
function evidenceFor(c: LocalComplaint): Array<{ kind: string; label: string }> {
  const rows: Array<{ kind: string; label: string }> = [];
  if (c.shipmentId) rows.push({ kind: 'TEMP', label: `Telemetry for ${c.shipmentId.slice(0, 12)}` });
  if (c.photoUrls.length > 0) rows.push({ kind: 'PHOTO', label: `${c.photoUrls.length} condition photo${c.photoUrls.length === 1 ? '' : 's'}` });
  if (c.batchId) rows.push({ kind: 'QC', label: `Batch QC record — ${c.batchId.slice(0, 12)}` });
  if (c.rcaSummary) rows.push({ kind: 'RCA', label: 'Manufacturer root-cause reply' });
  return rows;
}

export default function Complaints() {
  const [items, setItems] = useState<LocalComplaint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getComplaints();
        setItems(res.items);
        setError(null);
        if (res.items.length > 0) setSelectedId(res.items[0].id);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

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

  const selected = items.find((c) => c.id === selectedId) ?? null;
  const rcaParagraphs = selected?.rcaSummary ? selected.rcaSummary.split(/\n{1,2}/).filter(Boolean) : [];
  const evidence = selected ? evidenceFor(selected) : [];

  return (
    <>
      <PageHeader title="Complaints + RCA" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1.2fr)', gap: 24, padding: '26px 26px 52px' }}>
        {/* LEFT — filed complaints */}
        <Card style={{ animation: rise(0) }}>
          <CardTitle>Filed complaints</CardTitle>
          {items.length === 0 ? (
            <Empty>No complaints filed yet.</Empty>
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
                      padding: '17px 18px',
                      border: 'none',
                      borderBottom: `1px solid ${C.borderSoft}`,
                      background: active ? C.accentTint : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Pill label={c.remoteStatus ?? 'PENDING'} />
                      <span
                        style={{
                          border: 0,
                          background: 'transparent',
                          font: `500 12px/1 ${MONO}`,
                          color: C.ink,
                          borderBottom: `1px dotted ${C.inkGhost}`,
                        }}
                      >
                        {c.id.slice(0, 12)}
                      </span>
                      <div style={{ flex: 1 }} />
                      <span style={{ font: `400 10px/1 ${MONO}`, color: C.inkSoft }}>{fmtDate(c.filedAt)}</span>
                    </div>
                    <div style={{ font: `500 13px/1.45 ${FONT}`, color: C.ink, marginTop: 8 }}>
                      {c.category} · {c.batchId ? c.batchId.slice(0, 12) : 'drug unknown'}
                    </div>
                    <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.inkFaint, marginTop: 6 }}>
                      {[c.batchId, c.shipmentId].filter(Boolean).map((v) => v!.slice(0, 12)).join(' · ') || '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* RIGHT — RCA + evidence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ borderLeft: `2px solid ${C.ink}`, animation: rise(60) }}>
            <CardTitle
              right={
                selected?.rcaSummary ? (
                  <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkMuted }}>RCA RECEIVED</span>
                ) : null
              }
            >
              Manufacturer root cause
            </CardTitle>
            {!selected ? (
              <Empty>Select a complaint.</Empty>
            ) : (
              <div style={{ padding: 18 }}>
                <div style={{ font: `600 17px/1.3 ${MONO}`, letterSpacing: '-.02em', color: C.ink }}>
                  {selected.id.slice(0, 12)} · {selected.category}
                </div>
                <div style={{ font: `400 11px/1.6 ${MONO}`, color: C.inkFaint, marginTop: 5 }}>
                  {[selected.batchId?.slice(0, 12), selected.shipmentId?.slice(0, 12), `filed ${fmtDate(selected.filedAt)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>

                {rcaParagraphs.length > 0 ? (
                  rcaParagraphs.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        font: `400 14px/1.8 ${FONT}`,
                        color: C.inkMuted,
                        marginTop: 14,
                        animation: `mtRise .5s cubic-bezier(.16,1,.3,1) ${i === 0 ? '.18s' : '.4s'} both`,
                      }}
                    >
                      {p}
                    </div>
                  ))
                ) : (
                  <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkFaint, marginTop: 14 }}>
                    No root-cause reply has come back from the manufacturer yet.
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card style={{ animation: rise(120) }}>
            <CardTitle right={<span style={{ font: `400 12px/1 ${MONO}`, color: C.inkFaint }}>{evidence.length} items</span>}>
              Evidence bundle
            </CardTitle>
            {evidence.length === 0 ? (
              <Empty>No evidence attached.</Empty>
            ) : (
              <div>
                {evidence.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '15px 18px',
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <span
                      style={{
                        width: 52,
                        flex: '0 0 52px',
                        textAlign: 'center',
                        font: `600 9px/1 ${MONO}`,
                        letterSpacing: '.08em',
                        background: C.borderSoft,
                        color: C.inkMuted,
                        padding: '5px 4px',
                      }}
                    >
                      {e.kind}
                    </span>
                    <span style={{ font: `400 14px/1.6 ${FONT}`, color: C.ink }}>{e.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
