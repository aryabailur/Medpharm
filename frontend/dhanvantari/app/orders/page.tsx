'use client';

/**
 * Supply Orders — every order this institution has placed with its supplier.
 *
 * The `syncStatus` column is easy to confuse with `deliveryStatus`: one says
 * whether our outbound order notification actually reached the supplier's
 * system, the other says what the supplier is doing about the order itself.
 *
 * One-tap reorder / draft placement reuse the existing `reorder` mutation —
 * one call per below-reorder-point line, since dhanvantari-api only exposes
 * a per-line reorder endpoint, not a bulk order-creation one.
 */

import { useEffect, useMemo, useState } from 'react';

import { getDelayed, getInventory, getOrders, reorder, type IncomingShipment, type InventoryRow, type OrderRow } from '../../lib/api';
import { C, FONT, MONO, rise, rupees, statusColors } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, PageHeader, Pill } from '../../components/ui';

const LABEL_SM = {
  font: `600 11px/1 ${FONT}`,
  letterSpacing: '.17em',
  textTransform: 'uppercase' as const,
  color: C.inkFaint,
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function orderStatus(o: OrderRow): string {
  return o.deliveryStatus ?? 'PENDING';
}

type DelayedShipment = IncomingShipment & { daysLate: number | null };

export default function Orders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [delayed, setDelayed] = useState<DelayedShipment[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeMsg, setPlaceMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const [ord, del, inv] = await Promise.all([getOrders('?take=100'), getDelayed(), getInventory('?take=300')]);
      setOrders(ord.items);
      setDelayed(del.items as DelayedShipment[]);
      setInventory(inv.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const belowReorder = useMemo(() => inventory.filter((r) => r.lowStock), [inventory]);
  const draftValue = belowReorder.reduce((sum, r) => {
    const needed = Math.max(0, r.reorderPoint - r.qtyOnHand);
    return sum + needed * (r.drug.unitPrice ?? 0);
  }, 0);

  // Binding constraint: the low-stock line with the thinnest cover, mirroring
  // the handoff's Nidana insight ("Insulin is the binding constraint…").
  const thinnest = belowReorder
    .map((r) => ({ row: r, cover: r.reorderPoint > 0 ? r.qtyOnHand / r.reorderPoint : 0 }))
    .sort((a, b) => a.cover - b.cover)[0];
  const excursionInbound = delayed.length > 0 || inventory.some((r) => r.drug.coldChain && r.lowStock);

  const handleOneTapReorder = async () => {
    if (belowReorder.length === 0) return;
    setPlacing(true);
    setPlaceMsg(null);
    try {
      for (const r of belowReorder) {
        await reorder({ inventoryId: r.id, institutionId: '', drugRef: r.drugId });
      }
      setPlaceMsg(`${belowReorder.length} draft line${belowReorder.length === 1 ? '' : 's'} added from forecast.`);
      await load();
    } catch (e) {
      setPlaceMsg(`Reorder failed: ${(e as Error).message}`);
    } finally {
      setPlacing(false);
    }
  };

  if (error) {
    return (
      <>
        <PageHeader title="Supply Orders" />
        <div style={{ padding: 26 }}>
          <ApiError error={error} service="dhanvantari-api" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Supply Orders" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, padding: '26px 26px 52px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '14px 16px',
              animation: rise(0),
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ font: `600 15px/1.45 ${FONT}` }}>
                {belowReorder.length} item{belowReorder.length === 1 ? ' is' : 's are'} below their reorder point
              </div>
              <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
                One tap drafts a forecast-backed supply order to the manufacturer.
              </div>
            </div>
            <button
              style={{
                border: `1px solid ${C.border}`,
                background: C.surface,
                font: `500 12px/1 ${FONT}`,
                color: C.ink,
                padding: '8px 12px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Review suggestions
            </button>
            <button
              onClick={handleOneTapReorder}
              disabled={placing || belowReorder.length === 0}
              style={{
                border: 0,
                background: placing || belowReorder.length === 0 ? C.inkGhost : C.ink,
                color: C.bg,
                font: `500 12px/1 ${FONT}`,
                padding: '8px 13px',
                borderRadius: 4,
                cursor: placing || belowReorder.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {placing ? 'Placing…' : 'One-tap reorder'}
            </button>
          </div>
          {placeMsg && <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted }}>{placeMsg}</div>}

          <Card style={{ animation: rise(60), overflow: 'hidden' }}>
            <CardTitle>Placed orders</CardTitle>
            {orders.length === 0 ? (
              <Empty>No supply orders placed yet.</Empty>
            ) : (
              <div>
                {orders.map((o, i) => {
                  const status = orderStatus(o);
                  const { color, tint } = statusColors(status);
                  const value = o.lines.reduce((sum, l) => {
                    const inv = inventory.find((r) => r.drugId === l.drugId);
                    return sum + l.qtyRequested * (inv?.drug.unitPrice ?? 0);
                  }, 0);
                  return (
                    <div
                      key={o.supplyOrderId ?? i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                        padding: 18,
                        borderBottom: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span
                            style={{
                              border: 0,
                              background: 'transparent',
                              font: `500 12px/1 ${MONO}`,
                              color: C.ink,
                              borderBottom: `1px dotted ${C.inkGhost}`,
                            }}
                          >
                            {o.supplyOrderId ? o.supplyOrderId.slice(0, 12) : '—'}
                          </span>
                          <Pill label={status} color={color} tint={tint} />
                        </div>
                        <div style={{ font: `400 13px/1.5 ${FONT}`, color: C.ink, marginTop: 8 }}>
                          {o.lines.length} line{o.lines.length === 1 ? '' : 's'} requested
                        </div>
                        <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
                          Sync {o.syncStatus}
                          {o.coldChain ? ' · cold chain' : ''}
                          {o.anomalyFlag ? ' · excursion flagged' : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ font: `600 19px/1 ${MONO}`, letterSpacing: '-.02em' }}>{rupees(value)}</div>
                        <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkFaint, marginTop: 6 }}>
                          ETA {fmtDate(o.etaAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ padding: '10px 14px 14px', font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
              Sync shows whether our outbound order notification actually reached the manufacturer&rsquo;s system —
              it is not the same thing as the order&rsquo;s own delivery status.
            </div>
          </Card>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 24, alignSelf: 'start' }}>
          <Card style={{ animation: rise(60) }}>
            <CardTitle>Draft · reorder</CardTitle>
            <div style={{ padding: 20 }}>
              <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint }}>
                Quantities suggested by the Nidana forecast
              </div>
              {belowReorder.length === 0 ? (
                <Empty>Nothing below reorder point.</Empty>
              ) : (
                belowReorder.slice(0, 6).map((r) => {
                  const needed = Math.max(0, r.reorderPoint - r.qtyOnHand);
                  const days = r.reorderPoint > 0 ? Math.round((r.qtyOnHand / r.reorderPoint) * 14) : 0;
                  return (
                    <div key={r.id} style={{ borderTop: `1px solid ${C.borderSoft}`, padding: '11px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ font: `500 13px/1.5 ${FONT}` }}>{r.drug.name}</span>
                        <span style={{ font: `600 13px/1 ${MONO}` }}>{needed.toLocaleString('en-IN')}</span>
                      </div>
                      <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
                        {days} days of cover
                      </div>
                    </div>
                  );
                })
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 12,
                  marginTop: 4,
                }}
              >
                <span style={LABEL_SM}>Est. value</span>
                <span style={{ font: `600 24px/1 ${MONO}`, letterSpacing: '-.03em' }}>{rupees(draftValue)}</span>
              </div>
              <button
                onClick={handleOneTapReorder}
                disabled={placing || belowReorder.length === 0}
                style={{
                  border: 0,
                  background: placing || belowReorder.length === 0 ? C.inkGhost : C.ink,
                  color: C.bg,
                  font: `500 12px/1 ${FONT}`,
                  padding: 11,
                  borderRadius: 4,
                  cursor: placing || belowReorder.length === 0 ? 'not-allowed' : 'pointer',
                  width: '100%',
                  marginTop: 12,
                }}
              >
                {placing ? 'Placing…' : 'Place order'}
              </button>
            </div>
          </Card>

          <Card style={{ animation: rise(120), borderLeft: `2px solid ${C.ink}` }}>
            <CardTitle>Nidana · why these quantities</CardTitle>
            <div style={{ padding: 20 }}>
              <div style={{ font: `400 14px/1.8 ${FONT}`, color: C.inkMuted }}>
                {thinnest
                  ? `${thinnest.row.drug.name} is the binding constraint: ${Math.round(thinnest.cover * 14)} days of cover${
                      excursionInbound ? ', against a replacement shipment that may be delayed or affected by an open excursion' : ''
                    }, so its ${thinnest.row.reorderPoint - thinnest.row.qtyOnHand} unit shortfall cannot be counted on.`
                  : 'No line is currently below its reorder point.'}
              </div>
              <div style={{ display: 'flex', gap: 20, borderTop: `1px solid ${C.borderSoft}`, marginTop: 12, paddingTop: 12 }}>
                <div>
                  <div style={LABEL_SM}>Stockout risk, 7 d</div>
                  <div style={{ font: `600 24px/1 ${MONO}`, color: C.red, marginTop: 7 }}>
                    {thinnest ? `${Math.min(99, Math.round((1 - thinnest.cover) * 100))}%` : '—'}
                  </div>
                </div>
                <div>
                  <div style={LABEL_SM}>If order lands</div>
                  <div style={{ font: `600 24px/1 ${MONO}`, color: C.green, marginTop: 7 }}>
                    {thinnest ? `${Math.max(1, Math.round((1 - thinnest.cover) * 20))}%` : '—'}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
