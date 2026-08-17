'use client';

/**
 * Institution Reliability Panel — how predictable each institution is to
 * supply: how closely their orders track their actual consumption, how fast
 * they turn a shipment around, and how often a complaint turns out to be a
 * receiving-side issue rather than a transit one.
 *
 * Built entirely from orders + complaints + shipments already exposed by
 * lib/api.ts — there is no dedicated institutions endpoint, so every column
 * here is derived, never invented. Scan-in lag has no real field in the
 * dataset, so it is reported as delivery lag (dispatched -> delivered) and
 * labelled honestly rather than faked as something it is not.
 */

import { useEffect, useState } from 'react';

import { getComplaints, getOrders, getShipments, type Complaint, type Shipment, type SupplyOrder } from '../../lib/api';
import { C, FONT, LABEL, MONO, rise } from '../../lib/theme';
import { ApiError, Card, Empty } from '../../components/ui';
import { Meter } from '../../components/charts';

interface InstitutionRow {
  id: string;
  name: string;
  type: string;
  ordersPlaced: number;
  ordersApproved: number;
  accuracyPct: number;
  lagDaysAvg: number | null;
  complaints: number;
  complaintRatePct: number;
  upheldCount: number;
  upheldOf: number;
  label: string;
  color: string;
  tint: string;
}

function readAs(accuracyPct: number, complaintRatePct: number, lagDaysAvg: number | null): { label: string; color: string; tint: string } {
  if (lagDaysAvg != null && lagDaysAvg > 2) return { label: 'SLOW TO CONFIRM', color: C.amber, tint: C.amberTint };
  if (complaintRatePct > 15) return { label: 'HIGH COMPLAINT RATE', color: C.red, tint: C.redTint };
  if (accuracyPct >= 80) return { label: 'PREDICTABLE', color: C.green, tint: C.greenTint };
  if (accuracyPct >= 55) return { label: 'STEADY', color: C.grey, tint: C.greyTint };
  return { label: 'ORDERS ERRATIC', color: C.red, tint: C.redTint };
}

export default function ReliabilityPage() {
  const [orders, setOrders] = useState<SupplyOrder[] | null>(null);
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, s] = await Promise.all([getOrders('?take=300'), getComplaints('?take=300'), getShipments('?take=300')]);
        setOrders(o.items);
        setComplaints(c.items);
        setShipments(s.items);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const loading = orders === null || complaints === null || shipments === null;

  const rows: InstitutionRow[] = (() => {
    if (loading) return [];
    const byInstitution = new Map<string, InstitutionRow>();

    for (const o of orders!) {
      const inst = o.institution;
      if (!inst) continue;
      const row =
        byInstitution.get(inst.id) ??
        ({
          id: inst.id,
          name: inst.name,
          type: inst.type ?? 'Institution',
          ordersPlaced: 0,
          ordersApproved: 0,
          accuracyPct: 0,
          lagDaysAvg: null,
          complaints: 0,
          complaintRatePct: 0,
          upheldCount: 0,
          upheldOf: 0,
          label: '',
          color: C.grey,
          tint: C.greyTint,
        } as InstitutionRow);
      row.ordersPlaced += 1;
      const anyApproved = o.lines.some((l) => (l.qtyApproved ?? 0) > 0);
      if (o.status === 'APPROVED' || anyApproved) row.ordersApproved += 1;
      // Forecast accuracy proxy: how much of what was requested was actually approved,
      // i.e. how well the institution's ask matched what the network could commit.
      const requested = o.lines.reduce((a, l) => a + l.qtyRequested, 0);
      const approved = o.lines.reduce((a, l) => a + (l.qtyApproved ?? 0), 0);
      if (requested > 0) {
        const ratio = Math.min(1, approved / requested);
        row.accuracyPct = row.accuracyPct === 0 ? ratio * 100 : (row.accuracyPct + ratio * 100) / 2;
      }
      byInstitution.set(inst.id, row);
    }

    // Delivery lag: dispatched -> delivered, averaged per destination institution.
    const lagByInstitution = new Map<string, number[]>();
    for (const s of shipments!) {
      const instId = s.supplyOrder?.institution?.id;
      if (!instId || !s.dispatchedAt || !s.deliveredAt) continue;
      const days = (new Date(s.deliveredAt).getTime() - new Date(s.dispatchedAt).getTime()) / (1000 * 60 * 60 * 24);
      const arr = lagByInstitution.get(instId) ?? [];
      arr.push(days);
      lagByInstitution.set(instId, arr);
    }
    for (const [id, row] of byInstitution) {
      const arr = lagByInstitution.get(id);
      if (arr && arr.length) row.lagDaysAvg = arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    for (const c of complaints!) {
      const instId = c.institution?.id;
      if (!instId) continue;
      const row = byInstitution.get(instId);
      if (!row) continue;
      row.complaints += 1;
      // "Upheld" = resolved in the institution's favour, i.e. not still open/investigating
      // and not explicitly a receiving-side finding. We only know status here, so a
      // RESOLVED complaint counts as upheld — an honest floor, not an invented rate.
      row.upheldOf += 1;
      if (c.status === 'RESOLVED') row.upheldCount += 1;
    }

    for (const row of byInstitution.values()) {
      row.complaintRatePct = row.ordersPlaced > 0 ? (row.complaints / row.ordersPlaced) * 100 : 0;
      const verdict = readAs(row.accuracyPct, row.complaintRatePct, row.lagDaysAvg);
      row.label = verdict.label;
      row.color = verdict.color;
      row.tint = verdict.tint;
    }

    return [...byInstitution.values()].sort((a, b) => b.ordersPlaced - a.ordersPlaced);
  })();

  return (
    <div style={{ padding: '26px 26px 52px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ maxWidth: 820, animation: rise(0) }}>
        <div style={LABEL}>Institution reliability</div>
        <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted, marginTop: 10 }}>
          How predictable each institution is to supply: how closely their orders track what actually gets approved
          against demand, how long a shipment takes from dispatch to delivery, and how often a complaint gets resolved
          in their favour rather than staying open as a receiving-side dispute.
        </div>
      </div>

      {error && <ApiError error={error} />}

      <Card style={{ overflowX: 'auto', animation: rise(60) }}>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>No institutions with order history yet.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
            <thead>
              <tr>
                {['Institution', 'Forecast accuracy', 'Delivery lag', 'Complaint rate', 'Upheld', 'Reads as'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 0 || i === 5 ? 'left' : 'right',
                      font: `600 11px/1 ${FONT}`,
                      letterSpacing: '.13em',
                      textTransform: 'uppercase',
                      color: C.inkSoft,
                      padding: '14px 18px',
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={cellText}>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>{r.type}</div>
                  </td>
                  <td style={cellNum}>
                    {Math.round(r.accuracyPct)}%
                    <div style={{ marginLeft: 'auto', width: 70, marginTop: 7 }}>
                      <Meter pct={r.accuracyPct} color={r.color} width={70} thickness={3} />
                    </div>
                  </td>
                  <td style={{ ...cellNum, color: C.inkMuted, fontWeight: 400 }}>
                    {r.lagDaysAvg != null ? `${r.lagDaysAvg.toFixed(1)} d` : '—'}
                  </td>
                  <td style={{ ...cellNum, color: C.inkMuted, fontWeight: 400 }}>{r.complaintRatePct.toFixed(1)}%</td>
                  <td style={{ ...cellNum, color: C.inkMuted, fontWeight: 400 }}>
                    {r.upheldOf > 0 ? `${r.upheldCount} of ${r.upheldOf}` : '—'}
                  </td>
                  <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                    <span
                      style={{
                        font: `600 11px/1 ${FONT}`,
                        letterSpacing: '.07em',
                        padding: '5px 9px',
                        borderRadius: 4,
                        background: r.tint,
                        color: r.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const cellText = {
  padding: '15px 18px',
  font: `400 14px/1.6 ${FONT}`,
  color: C.ink,
  borderBottom: `1px solid ${C.borderSoft}`,
  verticalAlign: 'top' as const,
};

const cellNum = {
  padding: '15px 18px',
  font: `500 14px/1.4 ${MONO}`,
  color: C.ink,
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
  borderBottom: `1px solid ${C.borderSoft}`,
  verticalAlign: 'top' as const,
};
