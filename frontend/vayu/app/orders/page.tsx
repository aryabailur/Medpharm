'use client';

/**
 * Supply-order approval queue — the Phase 3 hard gate, manufacturer side.
 *
 * Approving here fires `order.status_changed` to Dhanvantari via the
 * OutboundEvent retry queue (§5.1), which is what flips the institution's view.
 *
 * Client Component: approve/reject are interactive and must refresh in place.
 */

import { useCallback, useEffect, useState } from 'react';

import { approveOrder, getOrders, rejectOrder, type SupplyOrder } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Button, Card, Empty, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

const FILTERS = ['PENDING', 'APPROVED', 'PARTIAL', 'REJECTED', ''] as const;

export default function OrdersPage() {
  const [filter, setFilter] = useState<string>('PENDING');
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}&take=100` : '?take=100';
      setOrders((await getOrders(q)).items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    try {
      if (action === 'approve') await approveOrder(id);
      else await rejectOrder(id, 'Rejected from approval queue');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Supply-order Approval Queue"
        subtitle="Institutions request; the supplier approves, cuts, or rejects"
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

      <div style={{ padding: 28 }}>
        {error ? (
          <ApiError error={error} />
        ) : (
          <Card>
            {orders.length === 0 ? (
              <Empty>No orders with status {filter || 'any'}.</Empty>
            ) : (
              <Table head={['Order', 'Institution', 'Lines', 'Age', 'Status', '']}>
                {orders.map((o) => (
                  <>
                    <tr key={o.id}>
                      <Td>
                        <button
                          onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                        >
                          <Mono>{o.id.slice(0, 8)}</Mono>
                        </button>
                      </Td>
                      <Td>
                        <div style={{ color: C.ink, fontWeight: 500 }}>{o.institution?.name}</div>
                        <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkGhost }}>
                          {o.institution?.district}
                        </div>
                      </Td>
                      <Td>
                        {o.lines.length} line{o.lines.length === 1 ? '' : 's'}
                        <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkGhost }}>
                          {o.lines.map((l) => l.drug?.name).filter(Boolean).slice(0, 2).join(', ')}
                          {o.lines.length > 2 ? '…' : ''}
                        </div>
                      </Td>
                      <Td>
                        <span style={{ font: `500 12px/1 ${MONO}`, color: (o.ageHours ?? 0) >= 4 ? C.amber : C.inkFaint }}>
                          {o.ageHours}h
                        </span>
                      </Td>
                      <Td>
                        <Pill label={o.status} />
                      </Td>
                      <Td style={{ textAlign: 'right' }}>
                        {o.status === 'PENDING' && (
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            <Button onClick={() => act(o.id, 'approve')} disabled={busy === o.id}>
                              {busy === o.id ? '…' : 'Approve'}
                            </Button>
                            <Button variant="danger" onClick={() => act(o.id, 'reject')} disabled={busy === o.id}>
                              Reject
                            </Button>
                          </span>
                        )}
                      </Td>
                    </tr>
                    {expanded === o.id && (
                      <tr key={`${o.id}-detail`}>
                        <Td style={{ background: '#FAFBFB' }} />
                        <td colSpan={5} style={{ background: '#FAFBFB', padding: '10px 16px', borderBottom: `1px solid ${C.borderSoft}` }}>
                          {o.lines.map((l) => (
                            <div
                              key={l.id}
                              style={{
                                display: 'flex',
                                gap: 16,
                                font: `400 12px/1.7 ${FONT}`,
                                color: C.inkMuted,
                              }}
                            >
                              <span style={{ minWidth: 200 }}>{l.drug?.name ?? l.drugId}</span>
                              <span>requested {l.qtyRequested.toLocaleString()}</span>
                              {l.qtyApproved != null && (
                                <span style={{ color: l.qtyApproved < l.qtyRequested ? C.amber : C.green }}>
                                  approved {l.qtyApproved.toLocaleString()}
                                </span>
                              )}
                            </div>
                          ))}
                          {o.rejectionReason && (
                            <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.red, marginTop: 6 }}>
                              Reason: {o.rejectionReason}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
