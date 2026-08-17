'use client';

/**
 * Store Control — institution overview.
 *
 * Every figure is computed from live dhanvantari-api responses. Nothing here
 * is hardcoded: an empty database renders <Empty>, not invented rows.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  getComplaints,
  getExpiring,
  getIncoming,
  getInventory,
  type IncomingShipment,
  type InventoryRow,
  type LocalComplaint,
} from '../lib/api';
import { C, FONT, MONO, rupees } from '../lib/theme';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Meter, Mono, PageHeader, Pill } from '../components/ui';

export default function StoreControl() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [expiring, setExpiring] = useState<{ items: InventoryRow[]; valueAtRisk: number } | null>(null);
  const [complaints, setComplaints] = useState<LocalComplaint[]>([]);
  const [incoming, setIncoming] = useState<IncomingShipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [inv, exp, comp, inc] = await Promise.all([
          getInventory('?take=200'),
          getExpiring(90),
          getComplaints(),
          getIncoming(),
        ]);
        setInventory(inv.items);
        setExpiring(exp);
        setComplaints(comp.items);
        setIncoming(inc.items);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Store Control" />
        <div style={{ padding: 26 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  const stockValue = inventory.reduce((sum, r) => sum + r.qtyOnHand * (r.drug.unitPrice ?? 0), 0);
  const lowItems = inventory.filter((r) => r.lowStock);
  const criticalItems = inventory.filter((r) => r.qtyOnHand === 0);

  const withCover = lowItems
    .map((r) => ({ row: r, cover: r.reorderPoint > 0 ? r.qtyOnHand / r.reorderPoint : 0 }))
    .sort((a, b) => a.cover - b.cover);
  const thinnest = withCover[0]?.row ?? lowItems[0];

  const openComplaints = complaints.filter((c) => c.remoteStatus !== 'RESOLVED');
  const withRca = openComplaints.filter((c) => c.rcaSummary);

  const oldestExpiring = expiring?.items.slice().sort((a, b) => (a.daysToExpiry ?? Infinity) - (b.daysToExpiry ?? Infinity))[0];

  const lowSorted = withCover.slice(0, 8);

  return (
    <>
      <PageHeader title="Store Control" />

      <KpiBand columns={4}>
        <Kpi
          label="Stock value"
          value={rupees(stockValue)}
          note={`${inventory.length} line items`}
        />
        <Kpi
          label="Below reorder point"
          value={lowItems.length}
          delta={criticalItems.length > 0 ? `${criticalItems.length} critical` : undefined}
          deltaColor={C.red}
          note={thinnest ? `${thinnest.drug.name} thinnest` : 'No low-stock lines'}
        />
        <Kpi
          label="Expiring ≤ 90 days"
          value={expiring?.items.length ?? 0}
          delta={expiring ? rupees(expiring.valueAtRisk) : undefined}
          deltaColor={C.amber}
          note={
            oldestExpiring
              ? `${oldestExpiring.drug.name} · ${oldestExpiring.daysToExpiry}d`
              : 'Nothing expiring soon'
          }
        />
        <Kpi
          label="Open complaints"
          value={openComplaints.length}
          delta={withRca.length > 0 ? `${withRca.length} with RCA` : undefined}
          deltaColor={C.accent}
          note={`${complaints.length} total filed`}
        />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 24 }}>
        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <CardTitle
            right={
              <Link href="/inventory" style={{ font: `600 12px/1 ${FONT}`, color: C.accent, textDecoration: 'none' }}>
                Inventory →
              </Link>
            }
          >
            Low stock
          </CardTitle>
          {lowSorted.length === 0 ? (
            <Empty>Nothing is below its reorder point.</Empty>
          ) : (
            <div>
              {lowSorted.map(({ row }) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: `1px solid ${C.borderSoft}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>{row.drug.name}</div>
                    <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 2 }}>
                      {row.drug.nlemCode ?? ''} · {row.drug.packSize ?? ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Mono>
                      {row.qtyOnHand} / {row.reorderPoint}
                    </Mono>
                    <Meter pct={row.reorderPoint > 0 ? (row.qtyOnHand / row.reorderPoint) * 100 : 0} color={C.red} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle
            right={
              <Link href="/shipments" style={{ font: `600 12px/1 ${FONT}`, color: C.accent, textDecoration: 'none' }}>
                Shipments →
              </Link>
            }
          >
            Inbound
          </CardTitle>
          {incoming.length === 0 ? (
            <Empty>Nothing inbound.</Empty>
          ) : (
            <div>
              {incoming.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '11px 16px',
                    borderBottom: `1px solid ${C.borderSoft}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Mono>{s.id.slice(0, 12)}</Mono>
                    <Pill label={s.status} />
                    {s.anomalyFlag && <Pill label="EXCURSION" color={C.red} tint={C.redTint} />}
                  </div>
                  <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkFaint, whiteSpace: 'nowrap' }}>
                    {s.etaAt ? new Date(s.etaAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
