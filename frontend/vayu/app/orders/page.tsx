'use client';

/**
 * Approvals — institutions request; the supplier approves, cuts, or rejects.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';

import { approveOrder, getOrders, rejectOrder, type SupplyOrder } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import {
  ApiError,
  Button,
  Card,
  Empty,
  Kpi,
  Mono,
  PageHeader,
  Pill,
  Segmented,
  Table,
  Td,
} from '../../components/ui';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'REJECTED', label: 'Rejected' },
];

export default function Approvals() {
  const [filter, setFilter] = useState('');
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}&take=100` : '?take=100';
      const res = await getOrders(q);
      setOrders(res.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

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

  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const approved = orders.filter((o) => o.status === 'APPROVED').length;
  const partial = orders.filter((o) => o.status === 'PARTIAL').length;
  const rejected = orders.filter((o) => o.status === 'REJECTED').length;

  return (
    <>
      <PageHeader
        title="Supply-order Approvals"
        subtitle="Institutions request; the supplier approves, cuts, or rejects"
        right={<Segmented options={FILTERS} value={filter} onChange={setFilter} />}
      />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} />}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {filter === '' ? (
            <>
              <Kpi label="Pending" value={pending} deltaColor={C.accent} />
              <Kpi label="Approved" value={approved} deltaColor={C.green} />
              <Kpi label="Partial" value={partial} deltaColor={C.amber} />
              <Kpi label="Rejected" value={rejected} deltaColor={C.red} />
            </>
          ) : (
            <Kpi label={`${filter} total`} value={orders.length} />
          )}
        </div>

        <Card>
          {orders.length === 0 ? (
            <Empty>No orders match this filter.</Empty>
          ) : (
            <Table head={['Order', 'Institution', 'Lines', 'Age', 'Status', '']}>
              {orders.map((o) => {
                const isOpen = expanded === o.id;
                const busy = busyId === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr>
                      <Td>
                        <span
                          onClick={() => setExpanded(isOpen ? null : o.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <Mono color={C.accent}>{o.id.slice(0, 8)}</Mono>
                        </span>
                      </Td>
                      <Td>{o.institution?.name ?? 'Unknown institution'}</Td>
                      <Td>
                        <Mono>{o.lines.length}</Mono>
                      </Td>
                      <Td style={{ color: (o.ageHours ?? 0) >= 4 ? C.amber : C.inkMuted }}>
                        <Mono color={(o.ageHours ?? 0) >= 4 ? C.amber : C.inkMuted}>{o.ageHours}h</Mono>
                      </Td>
                      <Td>
                        <Pill label={o.status} />
                      </Td>
                      <Td>
                        {o.status === 'PENDING' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button
                              variant="primary"
                              disabled={busy}
                              onClick={() => handleApprove(o.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              disabled={busy}
                              onClick={() => handleReject(o.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </Td>
                    </tr>
                    {isOpen && (
                      <tr key={`${o.id}-detail`}>
                        <td colSpan={6} style={{ background: C.surfaceAlt, padding: 0, borderBottom: `1px solid ${C.borderSoft}` }}>
                          <div style={{ padding: '10px 16px 14px' }}>
                            {o.rejectionReason && (
                              <div style={{ font: `600 12px/1.5 ${FONT}`, color: C.red, marginBottom: 8 }}>
                                {o.rejectionReason}
                              </div>
                            )}
                            {o.lines.map((line) => {
                              const full =
                                line.qtyApproved != null && line.qtyApproved >= line.qtyRequested;
                              const cut =
                                line.qtyApproved != null && line.qtyApproved < line.qtyRequested;
                              return (
                                <div
                                  key={line.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '6px 0',
                                    borderBottom: `1px solid ${C.borderSoft}`,
                                    font: `400 12px/1.5 ${FONT}`,
                                    color: C.inkMuted,
                                  }}
                                >
                                  <span>{line.drug?.name ?? 'Unknown drug'}</span>
                                  <span style={{ display: 'flex', gap: 10 }}>
                                    <Mono>requested {line.qtyRequested}</Mono>
                                    <Mono color={cut ? C.amber : full ? C.green : C.inkGhost}>
                                      approved {line.qtyApproved ?? '—'}
                                    </Mono>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
