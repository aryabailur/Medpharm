'use client';

/**
 * Approvals — institutions request; the supplier approves, cuts, or rejects.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  approveOrder,
  askAssistant,
  getOrder,
  getOrders,
  rejectOrder,
  type Drug,
  type SupplyOrder,
} from '../../lib/api';
import { C, FONT, MONO, rise, statusColors } from '../../lib/theme';
import { ApiError, Card, Empty, Pill } from '../../components/ui';

const FILTERS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: '', label: 'All' },
];

/** getOrder's detail response nests the full Drug row on each line, not the narrow list-view pick. */
type FullOrderLine = { id: string; drugId: string; qtyRequested: number; qtyApproved: number | null; drug?: Drug };
type FullOrder = Omit<SupplyOrder, 'lines'> & { lines: FullOrderLine[] };

interface RiskSignal {
  name: string;
  value: number;
}
interface RiskRow {
  institution: string;
  district: string;
  drug: string;
  score: number;
  band: string;
  confidence: string;
  signals: RiskSignal[];
}

export default function Approvals() {
  const [filter, setFilter] = useState('PENDING');
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<FullOrder | null>(null);
  const [riskRows, setRiskRows] = useState<RiskRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}&take=100` : '?take=100';
      const res = await getOrders(q);
      setOrders(res.items);
      setError(null);
      if (!selectedId && res.items.length > 0) setSelectedId(res.items[0]!.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    (async () => {
      try {
        const full = await getOrder(selectedId);
        setSelected(full as unknown as FullOrder);
      } catch {
        setSelected(null);
      }
    })();
  }, [selectedId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await askAssistant('where are we about to stock out');
        setRiskRows((res.evidence.data as RiskRow[]) ?? []);
      } catch {
        setRiskRows([]);
      }
    })();
  }, []);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await approveOrder(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectOrder(id, 'Rejected from approval queue');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const orderValue = useMemo(() => {
    if (!selected) return null;
    let total = 0;
    let any = false;
    for (const line of selected.lines) {
      const cost = (line.drug as (Drug & { unitCostInr?: number }) | undefined)?.unitCostInr;
      if (cost != null) {
        total += cost * (line.qtyApproved ?? line.qtyRequested);
        any = true;
      }
    }
    return any ? total : null;
  }, [selected]);

  const riskForSelected = useMemo(() => {
    if (!selected || !riskRows) return null;
    const instName = selected.institution?.name;
    return riskRows.find((r) => instName && r.institution === instName) ?? null;
  }, [selected, riskRows]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, padding: '26px 26px 52px' }}>
      {/* LEFT — Supply-order approvals */}
      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, animation: rise(0) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
            Supply-order approvals
          </span>
          <div style={{ flex: 1 }} />
          {FILTERS.map((f) => {
            const active = f.value === filter;
            return (
              <button
                key={f.value || 'all'}
                onClick={() => setFilter(f.value)}
                style={{
                  border: `1px solid ${active ? C.inkStrong : '#E4E2DF'}`,
                  background: active ? C.inkStrong : C.surface,
                  color: active ? '#fff' : '#4A4542',
                  font: `500 11px/1 ${FONT}`,
                  padding: '6px 10px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  marginLeft: 6,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ padding: 16 }}>
            <ApiError error={error} />
          </div>
        )}

        {orders.length === 0 ? (
          <Empty>No orders match this filter.</Empty>
        ) : (
          orders.map((o) => {
            const sc = statusColors(o.status);
            const busy = busyId === o.id;
            const lineSummary = o.lines
              .map((l) => l.drug?.name ?? 'Unknown drug')
              .slice(0, 3)
              .join(', ');
            return (
              <div
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                style={{
                  padding: 18,
                  borderBottom: `1px solid ${C.borderSoft}`,
                  cursor: 'pointer',
                  background: selectedId === o.id ? C.surfaceAlt : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ font: `500 12px/1 ${MONO}`, color: C.ink, borderBottom: `1px dotted ${C.inkGhost}` }}>
                    {o.id.slice(0, 8)}
                  </span>
                  <Pill label={o.status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginTop: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `500 13px/1.4 ${FONT}`, color: C.ink }}>{o.institution?.name ?? 'Unknown institution'}</div>
                    <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted, marginTop: 5 }}>
                      {o.lines.length} line{o.lines.length === 1 ? '' : 's'}
                      {lineSummary ? ` · ${lineSummary}` : ''}
                    </div>
                    {o.rejectionReason && (
                      <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 5 }}>{o.rejectionReason}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ font: `600 19px/1 ${MONO}`, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: C.ink }}>
                      {o.lines.reduce((a, l) => a + l.qtyRequested, 0).toLocaleString('en-IN')} u
                    </div>
                    {o.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: 7, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          style={{ border: `1px solid ${C.border}`, background: C.surface, font: `500 12px/1 ${FONT}`, color: C.ink, padding: '7px 10px', borderRadius: 4, cursor: 'pointer' }}
                        >
                          Partial
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => handleReject(o.id)}
                          style={{ border: `1px solid ${C.border}`, background: C.surface, font: `500 12px/1 ${FONT}`, color: C.red, padding: '7px 10px', borderRadius: 4, cursor: busy ? 'not-allowed' : 'pointer' }}
                        >
                          Reject
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => handleApprove(o.id)}
                          style={{ border: 0, background: C.ink, color: C.bg, font: `500 12px/1 ${FONT}`, padding: '7px 12px', borderRadius: 4, cursor: busy ? 'not-allowed' : 'pointer' }}
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* RIGHT aside */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 24, alignSelf: 'start' }}>
        <Card style={{ animation: rise(60) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
            <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
              {selected ? selected.id.slice(0, 12) : 'Order'} · allocation
            </span>
          </div>
          {!selected ? (
            <Empty>Select an order to see its allocation.</Empty>
          ) : (
            <div style={{ padding: 20 }}>
              <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint }}>
                {selected.institution?.name ?? 'Unknown institution'} · placed{' '}
                {new Date(selected.placedAt).toLocaleString('en-GB')}
              </div>
              {selected.lines.map((l) => {
                const full = l.qtyApproved != null && l.qtyApproved >= l.qtyRequested;
                const cut = l.qtyApproved != null && l.qtyApproved < l.qtyRequested;
                return (
                  <div key={l.id} style={{ borderTop: `1px solid ${C.borderSoft}`, padding: '11px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ font: `500 13px/1.5 ${FONT}`, color: C.ink }}>{l.drug?.name ?? 'Unknown drug'}</span>
                      <span style={{ font: `600 13px/1 ${MONO}`, color: cut ? C.amber : full ? C.green : C.inkGhost }}>
                        {l.qtyApproved ?? l.qtyRequested}
                      </span>
                    </div>
                    <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.inkFaint, marginTop: 5 }}>
                      requested {l.qtyRequested}
                    </div>
                    {l.drug?.coldChain && (
                      <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 3 }}>
                        cold chain {l.drug.minTempC}–{l.drug.maxTempC}°C
                      </div>
                    )}
                  </div>
                );
              })}
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}
              >
                <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                  Order value
                </span>
                <span style={{ font: `600 24px/1 ${MONO}`, letterSpacing: '-.03em', color: C.ink }}>
                  {orderValue != null ? `₹${orderValue.toLocaleString('en-IN')}` : '—'}
                </span>
              </div>
              {selected.status === 'PENDING' && (
                <button
                  disabled={busyId === selected.id}
                  onClick={() => handleApprove(selected.id)}
                  style={{ border: 0, background: C.ink, color: C.bg, font: `500 12px/1 ${FONT}`, padding: 11, borderRadius: 4, cursor: 'pointer', width: '100%', marginTop: 12 }}
                >
                  Approve &amp; build shipment
                </button>
              )}
              <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 9, textAlign: 'center' }}>
                Institution sees the status flip within a second.
              </div>
            </div>
          )}
        </Card>

        <section
          style={{
            border: `1px solid ${C.border}`,
            borderLeft: `2px solid ${C.ink}`,
            borderRadius: 4,
            background: C.surface,
            animation: rise(120),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
            <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
              Nidana · why this allocation
            </span>
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!selected ? (
              <Empty>Select an order to see Nidana's read.</Empty>
            ) : riskForSelected ? (
              <>
                <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted }}>
                  {riskForSelected.drug} at {riskForSelected.institution} carries a {riskForSelected.band.toLowerCase()}{' '}
                  stockout band with {riskForSelected.confidence} confidence, from {riskForSelected.signals.length} agreeing
                  signals.
                </div>
                <div style={{ display: 'flex', gap: 20, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 11 }}>
                  <div>
                    <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                      Stockout risk if held
                    </div>
                    <div style={{ font: `600 24px/1 ${MONO}`, color: C.amber, marginTop: 7 }}>
                      {Math.round(riskForSelected.score * 100)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                      Agreeing signals
                    </div>
                    <div style={{ font: `600 24px/1 ${MONO}`, color: C.green, marginTop: 7 }}>
                      {riskForSelected.signals.length}/5
                    </div>
                  </div>
                </div>
                <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint }}>
                  Signals: {riskForSelected.signals.map((s) => s.name.replace(/_/g, ' ')).join(' · ')}.
                </div>
              </>
            ) : (
              <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted }}>
                No Nidana risk flag matches this institution — this allocation is not on the current stockout watchlist.
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
