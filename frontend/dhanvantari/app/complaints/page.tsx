'use client';

/**
 * Complaints + RCA — every complaint this institution has filed, and the
 * supplier's root-cause reply where one has come back over the signed
 * contract.
 */

import { useEffect, useMemo, useState } from 'react';

import { getComplaints, type LocalComplaint } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Pill } from '../../components/ui';
import { PieChart, BarChart } from '../../components/charts';

const PALETTE = [C.accent, C.amber, C.red, C.blue, C.green, C.grey];

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
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
      <PageHeader title="Complaints + RCA" />

      <KpiBand columns={4}>
        <Kpi label="Total filed" value={items.length} />
        <Kpi label="Open" value={open} deltaColor={C.amber} />
        <Kpi label="With RCA" value={withRca} deltaColor={C.accent} />
        <Kpi label="Pending sync" value={pendingSync} deltaColor={C.grey} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {/* Summary charts row */}
        {items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
              <CardTitle>By category</CardTitle>
              <div style={{ padding: 16, display: 'flex', gap: 18, alignItems: 'center' }}>
                <PieChart data={byCategory} size={130} />
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
            </Card>

            <Card>
              <CardTitle>By status</CardTitle>
              <div style={{ padding: 16 }}>
                <BarChart data={byStatus} />
              </div>
            </Card>
          </div>
        )}

        {/* List / detail split */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 24 }}>
          <Card>
            <CardTitle>Complaints</CardTitle>
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
          </Card>

          <Card>
            <CardTitle>Detail</CardTitle>
            {!selected ? (
              <Empty>Select a complaint.</Empty>
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
                  <Card style={{ marginTop: 8 }}>
                    <CardTitle>Supplier root cause</CardTitle>
                    <div style={{ padding: 14 }}>
                      <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink }}>{selected.rcaSummary}</div>
                      <div style={{ marginTop: 8, font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
                        Pushed down from the supplier over the signed contract — this institution did not
                        compute it.
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
