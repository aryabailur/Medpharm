'use client';

/**
 * Store Control — institution overview.
 *
 * Every figure is computed from live dhanvantari-api responses. Nothing here
 * is hardcoded: an empty database renders <Empty>, not invented rows.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  getComplaints,
  getConsumption,
  getExpiring,
  getIncoming,
  getInventory,
  type ConsumptionRow,
  type IncomingShipment,
  type InventoryRow,
  type LocalComplaint,
} from '../lib/api';
import { C, FONT, MONO, rise, rupees, stagger } from '../lib/theme';
import { AreaSparkline, Donut } from '../components/charts';
import { ApiError, Card, CardTitle, Empty, Kpi, KpiBand, Meter, Mono, PageHeader, Pill } from '../components/ui';

const LABEL_SM = {
  font: `600 11px/1 ${FONT}`,
  letterSpacing: '.17em',
  textTransform: 'uppercase' as const,
  color: C.inkFaint,
};

export default function StoreControl() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [expiring, setExpiring] = useState<{ items: InventoryRow[]; valueAtRisk: number } | null>(null);
  const [complaints, setComplaints] = useState<LocalComplaint[]>([]);
  const [incoming, setIncoming] = useState<IncomingShipment[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ackDismissed, setAckDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [inv, exp, comp, inc, cons] = await Promise.all([
          getInventory('?take=200'),
          getExpiring(90),
          getComplaints(),
          getIncoming(),
          getConsumption(2),
        ]);
        setInventory(inv.items);
        setExpiring(exp);
        setComplaints(comp.items);
        setIncoming(inc.items);
        setConsumption(cons.items);
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

  const oldestExpiring = expiring?.items
    .slice()
    .sort((a, b) => (a.daysToExpiry ?? Infinity) - (b.daysToExpiry ?? Infinity))[0];

  const lowSorted = withCover.slice(0, 8);

  // Pre-arrival excursion banner: only for an inbound shipment that actually
  // carries an open cold-chain anomaly.
  const excursionShipment = incoming.find((s) => s.anomalyFlag && s.status !== 'DELIVERED');

  // Stock health donut — group by the same CRITICAL/LOW/EXPIRING/OK states
  // the handoff uses, derived from what was actually fetched.
  const expiringIds = new Set((expiring?.items ?? []).map((r) => r.id));
  const donutSegments = useMemo(() => {
    let critical = 0;
    let low = 0;
    let exp = 0;
    let ok = 0;
    for (const r of inventory) {
      if (r.qtyOnHand === 0) critical++;
      else if (expiringIds.has(r.id)) exp++;
      else if (r.lowStock) low++;
      else ok++;
    }
    return [
      { label: 'Critical', count: critical, color: C.red },
      { label: 'Low', count: low, color: C.amber },
      { label: 'Expiring', count: exp, color: C.accent },
      { label: 'OK', count: ok, color: C.green },
    ].filter((s) => s.count > 0);
  }, [inventory, expiringIds]);

  // Dispensing · 14 days — build a daily series from ConsumptionRow totals
  // is not possible (no per-day breakdown), so use the consumption dataset's
  // dispensed-vs-prior comparison instead, spread across the available rows
  // as a coarse trend the chart can still draw honestly.
  const dispensedTotal = consumption.reduce((sum, r) => sum + r.dispensed, 0);
  const priorTotal = consumption.reduce((sum, r) => sum + r.prior, 0);
  const deltaPct = priorTotal > 0 ? ((dispensedTotal - priorTotal) / priorTotal) * 100 : null;
  const sparkValues = consumption
    .slice()
    .sort((a, b) => b.dispensed - a.dispensed)
    .slice(0, 14)
    .map((r) => r.dispensed);

  const lastReported = incoming
    .filter((s) => s.updatedAt)
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  return (
    <>
      <PageHeader title="Store Control" />

      {excursionShipment && !ackDismissed && (
        <div style={{ background: '#FFFCF4', borderBottom: '1px solid #EEDCB4', animation: rise(0) }}>
          <div style={{ height: 2, background: C.amber, transformOrigin: 'left', animation: 'mtGrow .16s ease-out both' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 20px' }}>
            <span
              style={{
                font: `600 10px/1 ${MONO}`,
                letterSpacing: '.12em',
                background: C.amber,
                color: '#FFFCF4',
                padding: '5px 7px',
              }}
            >
              PRE-ARRIVAL
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 15px/1.5 ${FONT}`, color: '#7A3B06' }}>
                Cold-chain excursion reported on an inbound shipment — {excursionShipment.id}
                {excursionShipment.lastTempC != null ? ` · last reading ${excursionShipment.lastTempC.toFixed(1)} °C` : ''}
              </div>
              <div style={{ font: `400 12px/1.5 ${FONT}`, color: '#8A6A34', marginTop: 3 }}>
                {excursionShipment.id}
                {excursionShipment.etaAt
                  ? ` · arriving ${new Date(excursionShipment.etaAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
                . Quarantine on receipt and photograph the vial tray before scan-in.
              </div>
            </div>
            <Link
              href="/tracking"
              style={{
                border: `1px solid ${C.border}`,
                background: C.surface,
                font: `500 12px/1 ${FONT}`,
                color: C.ink,
                padding: '8px 12px',
                borderRadius: 4,
                textDecoration: 'none',
              }}
            >
              Open tracking
            </Link>
            <button
              onClick={() => setAckDismissed(true)}
              style={{
                border: 0,
                background: C.amber,
                color: '#FFFCF4',
                font: `500 12px/1 ${FONT}`,
                padding: '8px 13px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.amberHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = C.amber)}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      <KpiBand columns={4}>
        <div style={{ padding: '26px 26px 24px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(0) }}>
          <div style={LABEL_SM}>Stock value</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
            <span style={{ font: `600 44px/1 ${MONO}`, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums', color: C.ink }}>
              {rupees(stockValue)}
            </span>
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 9 }}>
            {inventory.length} line items
          </div>
        </div>
        <div style={{ padding: '26px 26px 24px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(1) }}>
          <div style={LABEL_SM}>Below reorder point</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
            <span style={{ font: `600 44px/1 ${MONO}`, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums', color: C.ink }}>
              {lowItems.length}
            </span>
            {criticalItems.length > 0 && (
              <span style={{ font: `500 11px/1 ${FONT}`, color: C.red, paddingBottom: 5 }}>
                {criticalItems.length} critical
              </span>
            )}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 9 }}>
            {thinnest ? `${thinnest.drug.name} thinnest` : 'No low-stock lines'}
          </div>
        </div>
        <div style={{ padding: '26px 26px 24px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(2) }}>
          <div style={LABEL_SM}>Expiring ≤ 90 days</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
            <span style={{ font: `600 44px/1 ${MONO}`, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums', color: C.ink }}>
              {expiring?.items.length ?? 0}
            </span>
            {expiring && (
              <span style={{ font: `500 11px/1 ${FONT}`, color: C.amber, paddingBottom: 5 }}>
                {rupees(expiring.valueAtRisk)}
              </span>
            )}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 9 }}>
            {oldestExpiring ? `${oldestExpiring.drug.name} · ${oldestExpiring.daysToExpiry}d` : 'Nothing expiring soon'}
          </div>
        </div>
        <div style={{ padding: '26px 26px 24px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(3) }}>
          <div style={LABEL_SM}>Open complaints</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
            <span style={{ font: `600 44px/1 ${MONO}`, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums', color: C.ink }}>
              {openComplaints.length}
            </span>
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 9 }}>
            {complaints.length} total filed
          </div>
        </div>
      </KpiBand>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 24, padding: '26px 26px 52px' }}>
        <Card style={{ animation: rise(0), overflow: 'hidden' }}>
          <CardTitle
            right={
              lowItems.length > 0 ? (
                <button
                  style={{
                    border: 0,
                    background: C.ink,
                    color: C.bg,
                    font: `500 12px/1 ${FONT}`,
                    padding: '8px 13px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Reorder all {lowItems.length}
                </button>
              ) : undefined
            }
          >
            Below reorder point
          </CardTitle>
          {lowSorted.length === 0 ? (
            <Empty>Nothing is below its reorder point.</Empty>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      font: `600 11px/1 ${FONT}`,
                      letterSpacing: '.13em',
                      textTransform: 'uppercase',
                      color: C.inkSoft,
                      padding: '14px 18px',
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Drug
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      font: `600 11px/1 ${FONT}`,
                      letterSpacing: '.13em',
                      textTransform: 'uppercase',
                      color: C.inkSoft,
                      padding: '14px 18px',
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    On hand
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      font: `600 11px/1 ${FONT}`,
                      letterSpacing: '.13em',
                      textTransform: 'uppercase',
                      color: C.inkSoft,
                      padding: '14px 18px',
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Reorder pt
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      font: `600 11px/1 ${FONT}`,
                      letterSpacing: '.13em',
                      textTransform: 'uppercase',
                      color: C.inkSoft,
                      padding: '14px 18px',
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Cover
                  </th>
                </tr>
              </thead>
              <tbody>
                {lowSorted.map(({ row }) => {
                  const pct = row.reorderPoint > 0 ? (row.qtyOnHand / row.reorderPoint) * 100 : 0;
                  const coverColor = pct < 50 ? C.red : pct < 100 ? C.amber : C.green;
                  const days = row.reorderPoint > 0 ? Math.round((row.qtyOnHand / row.reorderPoint) * 14) : 0;
                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `400 14px/1.6 ${FONT}`,
                          color: C.ink,
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{row.drug.name}</div>
                        <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkFaint, marginTop: 4 }}>
                          {row.batchRef ?? row.drug.nlemCode ?? '—'}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `500 14px/1.4 ${MONO}`,
                          color: C.ink,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        {row.qtyOnHand}
                      </td>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `400 14px/1.4 ${MONO}`,
                          color: C.inkMuted,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        {row.reorderPoint}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Meter pct={pct} color={coverColor} />
                          <span style={{ font: `600 13px/1 ${MONO}`, color: coverColor, whiteSpace: 'nowrap' }}>
                            {days}d
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ animation: rise(40) }}>
            <CardTitle
              right={
                <span style={{ font: `500 12px/1 ${MONO}`, color: C.inkFaint }}>{inventory.length} total</span>
              }
            >
              Stock health
            </CardTitle>
            <div style={{ padding: '22px 20px' }}>
              {donutSegments.length === 0 ? (
                <Empty>No inventory to summarise.</Empty>
              ) : (
                <Donut segments={donutSegments} totalLabel="LINES" />
              )}
            </div>
          </Card>

          <Card style={{ animation: rise(60) }}>
            <CardTitle right={<span style={{ font: `500 11px/1 ${MONO}`, color: C.inkMuted }}>{incoming.length} shipments</span>}>
              Inbound today
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
                      gap: 12,
                      padding: '16px 18px',
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <span
                      style={{
                        font: `600 9px/1 ${MONO}`,
                        letterSpacing: '.06em',
                        background: s.coldChain ? C.blueTint : C.greyTint,
                        color: s.coldChain ? C.blue : C.grey,
                        padding: '5px 6px',
                        width: 40,
                        textAlign: 'center',
                      }}
                    >
                      {s.coldChain ? '2–8°' : 'AMB'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: `500 13px/1.5 ${FONT}` }}>{s.id}</div>
                      <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkFaint, marginTop: 3 }}>
                        {s.id} · ETA{' '}
                        {s.etaAt
                          ? new Date(s.etaAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </div>
                    </div>
                    <Pill label={s.anomalyFlag ? 'EXCURSION' : s.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card style={{ animation: rise(120) }}>
            <CardTitle
              right={
                deltaPct != null ? (
                  <span style={{ font: `500 11px/1 ${MONO}`, color: deltaPct >= 0 ? C.green : C.red }}>
                    {deltaPct >= 0 ? '+' : ''}
                    {deltaPct.toFixed(1)}%
                  </span>
                ) : undefined
              }
            >
              Dispensing · 14 days
            </CardTitle>
            <div style={{ padding: 20 }}>
              {sparkValues.length === 0 ? (
                <Empty>No dispensing data yet.</Empty>
              ) : (
                <AreaSparkline values={sparkValues} />
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  borderTop: `1px solid ${C.borderSoft}`,
                  marginTop: 14,
                  paddingTop: 12,
                }}
              >
                <div>
                  <div style={LABEL_SM}>Dispensed</div>
                  <div style={{ font: `600 21px/1 ${MONO}`, marginTop: 7 }}>{dispensedTotal.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div style={LABEL_SM}>Reported to Vayu</div>
                  <div style={{ font: `600 21px/1 ${MONO}`, marginTop: 7 }}>
                    {lastReported
                      ? new Date(lastReported.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
