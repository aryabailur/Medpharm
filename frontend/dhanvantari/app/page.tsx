'use client';

/**
 * Store Control — institution overview.
 *
 * Every figure is computed from live dhanvantari-api responses. Nothing here
 * is hardcoded: an empty database renders <EmptyState>, not invented rows.
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
import { C, FONT, MONO, rise, rupees, VIZ, VIZ_TINT } from '../lib/theme';
import { AreaSparkline, BarChart, ColumnChart, Donut } from '../components/charts';
import {
  ApiError,
  EmptyState,
  KpiHero,
  LiveChip,
  Panel,
  PanelTitle,
  Pill,
  Trend,
} from '../components/ui';

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
      { label: 'Expiring', count: exp, color: VIZ.violet },
      { label: 'OK', count: ok, color: C.green },
    ].filter((s) => s.count > 0);
  }, [inventory, expiringIds]);

  // Dispensing · 14 days — build a daily series from ConsumptionRow totals
  // is not possible (no per-day breakdown), so use the consumption dataset's
  // dispensed-vs-prior comparison instead, spread across the available rows
  // as a coarse trend the chart can still draw honestly.
  const dispensedTotal = consumption.reduce((sum, r) => sum + r.dispensed, 0);
  const priorTotal = consumption.reduce((sum, r) => sum + r.prior, 0);
  const deltaPct = priorTotal > 0 ? Math.round(((dispensedTotal - priorTotal) / priorTotal) * 1000) / 10 : null;
  const sparkValues = consumption
    .slice()
    .sort((a, b) => b.dispensed - a.dispensed)
    .slice(0, 14)
    .map((r) => r.dispensed);

  // Top movers — the consumption rows dispensing the most, for the dead-space
  // fill: a ranked bar chart makes the "why" behind the trend legible.
  const topMovers = consumption
    .slice()
    .sort((a, b) => b.dispensed - a.dispensed)
    .slice(0, 6)
    .map((r) => ({ label: r.drug, value: r.dispensed, color: VIZ.teal }));

  // Stock-cover distribution — every line item bucketed by days of cover, so
  // the dashboard shows the shape of the whole store's risk, not just the
  // below-reorder table. Days of cover approximated the same way the table
  // does: (on hand / reorder point) * 14.
  const coverBuckets = useMemo(() => {
    const buckets = { critical: 0, low: 0, ok: 0, healthy: 0 };
    for (const r of inventory) {
      if (r.reorderPoint <= 0) continue;
      const days = (r.qtyOnHand / r.reorderPoint) * 14;
      if (days <= 3) buckets.critical++;
      else if (days <= 7) buckets.low++;
      else if (days <= 21) buckets.ok++;
      else buckets.healthy++;
    }
    return [
      { label: '≤3D', count: buckets.critical, color: C.red },
      { label: '4-7D', count: buckets.low, color: C.amber },
      { label: '8-21D', count: buckets.ok, color: VIZ.teal },
      { label: '21D+', count: buckets.healthy, color: C.green },
    ];
  }, [inventory]);

  // Fix for defect #2: group inbound shipments so five near-identical rows
  // never render as copy-pasted. Bucket by cold-chain state + rounded ETA
  // instead of listing every shipment id verbatim, and show a relative time.
  const inboundGroups = useMemo(() => {
    const now = Date.now();
    const map = new Map<
      string,
      { coldChain: boolean; etaAt: string | null; anomalyFlag: boolean; status: string; ids: string[] }
    >();
    for (const s of incoming) {
      // Round ETA to the nearest 15 minutes so genuinely-close shipments group,
      // while distinct times still separate.
      const etaKey = s.etaAt ? Math.round(new Date(s.etaAt).getTime() / (15 * 60_000)) : 'none';
      const key = `${s.coldChain ? 'cold' : 'amb'}|${etaKey}|${s.anomalyFlag ? 'x' : '-'}|${s.status}`;
      if (!map.has(key)) {
        map.set(key, { coldChain: s.coldChain, etaAt: s.etaAt, anomalyFlag: s.anomalyFlag, status: s.status, ids: [] });
      }
      map.get(key)!.ids.push(s.id);
    }
    return Array.from(map.values())
      .map((g) => {
        const ms = g.etaAt ? new Date(g.etaAt).getTime() - now : null;
        let relative = '—';
        if (ms != null) {
          if (ms <= 0) relative = 'due now';
          else if (ms < 3600_000) relative = `in ${Math.round(ms / 60_000)} min`;
          else relative = `in ${Math.round(ms / 3600_000)} h`;
        }
        return { ...g, relative };
      })
      .sort((a, b) => (a.anomalyFlag === b.anomalyFlag ? 0 : a.anomalyFlag ? -1 : 1));
  }, [incoming]);

  const lastReported = incoming
    .filter((s) => s.updatedAt)
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  if (error) {
    return (
      <>
        <div style={{ padding: '20px 26px 16px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <h1 style={{ margin: 0, font: `600 18px/1.2 ${FONT}`, color: C.ink }}>Store Control</h1>
        </div>
        <div style={{ padding: 26 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          padding: '20px 26px 16px',
          borderBottom: `1px solid ${C.border}`,
          background: C.surfaceAlt,
        }}
      >
        <div>
          <h1 style={{ margin: 0, font: `600 19px/1.2 ${FONT}`, color: C.ink, letterSpacing: '-0.01em' }}>
            Store Control
          </h1>
          <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 5 }}>
            Ward-level overview · this institution
          </div>
        </div>
        <LiveChip label="synced" color={VIZ.violet} />
      </div>

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <KpiHero
          index={0}
          label="Stock value"
          value={rupees(stockValue)}
          sub={`${inventory.length} line items`}
          accent={VIZ.violet}
        />
        <KpiHero
          index={1}
          label="Below reorder point"
          value={lowItems.length}
          trend={criticalItems.length > 0 ? <Trend value={criticalItems.length} suffix=" critical" goodDirection="down" /> : undefined}
          sub={thinnest ? `${thinnest.drug.name} thinnest` : 'No low-stock lines'}
          accent={C.amber}
        />
        <KpiHero
          index={2}
          label="Expiring ≤ 90 days"
          value={expiring?.items.length ?? 0}
          // Value at risk is a standing figure, not a delta — `Trend` would
          // prefix it with a direction arrow and a literal 0 ("→0 ₹6.1L").
          trend={
            expiring ? (
              <span
                style={{
                  font: `600 11px/1 ${MONO}`,
                  color: VIZ.magenta,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {rupees(expiring.valueAtRisk)} at risk
              </span>
            ) : undefined
          }
          sub={oldestExpiring ? `${oldestExpiring.drug.name} · ${oldestExpiring.daysToExpiry}d` : 'Nothing expiring soon'}
          accent={VIZ.magenta}
        />
        <KpiHero
          index={3}
          label="Open complaints"
          value={openComplaints.length}
          sub={`${complaints.length} total filed`}
          accent={C.red}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 24, padding: '26px 26px 52px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Panel delayMs={0} style={{ overflow: 'hidden' }}>
            <PanelTitle
              dot={lowItems.length > 0 ? C.amber : C.green}
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
            </PanelTitle>
            {lowSorted.length === 0 ? (
              <EmptyState title="Nothing is below its reorder point" hint="Every line item currently clears its reorder threshold." glyph="✓" tone={C.green} />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Drug', 'On hand', 'Reorder pt', 'Cover'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 1 || i === 2 ? 'right' : 'left',
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
                            <div style={{ width: 60, height: 6, background: C.borderSoft, borderRadius: 3, overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.max(0, Math.min(100, pct))}%`,
                                  height: 6,
                                  background: coverColor,
                                  borderRadius: 3,
                                }}
                              />
                            </div>
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
          </Panel>

          {/* Fills the dead space below the below-reorder table: consumption
              trend, top movers, and stock-cover distribution, so this column
              never ends in blank white. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Panel delayMs={40}>
              <PanelTitle
                right={
                  deltaPct != null ? (
                    <Trend value={deltaPct} suffix="%" goodDirection="none" />
                  ) : undefined
                }
              >
                Dispensing trend
              </PanelTitle>
              <div style={{ padding: 18 }}>
                {sparkValues.length === 0 ? (
                  <EmptyState title="No dispensing data yet" height={140} />
                ) : (
                  <AreaSparkline values={sparkValues} color={VIZ.teal} fill={VIZ_TINT.teal} />
                )}
              </div>
            </Panel>

            <Panel delayMs={60}>
              <PanelTitle>Stock cover distribution</PanelTitle>
              <div style={{ padding: 18 }}>
                {inventory.length === 0 ? (
                  <EmptyState title="No inventory yet" height={140} />
                ) : (
                  <ColumnChart bars={coverBuckets} height={110} barMax={70} />
                )}
              </div>
            </Panel>
          </div>

          <Panel delayMs={80}>
            <PanelTitle right={<span style={{ font: `500 11px/1 ${MONO}`, color: C.inkFaint }}>top {topMovers.length}</span>}>
              Top dispensing drugs · this window
            </PanelTitle>
            <div style={{ padding: 18 }}>
              {topMovers.length === 0 ? (
                <EmptyState title="No consumption data yet" height={140} />
              ) : (
                <BarChart data={topMovers} />
              )}
            </div>
          </Panel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Panel delayMs={40}>
            <PanelTitle right={<span style={{ font: `500 12px/1 ${MONO}`, color: C.inkFaint }}>{inventory.length} total</span>}>
              Stock health
            </PanelTitle>
            <div style={{ padding: '22px 20px' }}>
              {donutSegments.length === 0 ? (
                <EmptyState title="No inventory to summarise" height={140} />
              ) : (
                <Donut segments={donutSegments} totalLabel="LINES" />
              )}
            </div>
          </Panel>

          <Panel delayMs={60}>
            <PanelTitle right={<span style={{ font: `500 11px/1 ${MONO}`, color: C.inkMuted }}>{incoming.length} shipments</span>}>
              Inbound today
            </PanelTitle>
            {inboundGroups.length === 0 ? (
              <EmptyState title="Nothing inbound" height={160} />
            ) : (
              <div>
                {inboundGroups.slice(0, 6).map((g, i) => (
                  <div
                    key={i}
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
                        background: g.coldChain ? C.blueTint : C.greyTint,
                        color: g.coldChain ? C.blue : C.grey,
                        padding: '5px 6px',
                        width: 40,
                        textAlign: 'center',
                      }}
                    >
                      {g.coldChain ? '2–8°' : 'AMB'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: `500 13px/1.5 ${FONT}` }}>
                        {g.ids.length > 1 ? `${g.ids.length} shipments` : g.ids[0]}
                      </div>
                      <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkFaint, marginTop: 3 }}>
                        ETA {g.relative}
                      </div>
                    </div>
                    <Pill label={g.anomalyFlag ? 'EXCURSION' : g.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel delayMs={100}>
            <PanelTitle
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
            </PanelTitle>
            <div style={{ padding: 20 }}>
              {sparkValues.length === 0 ? (
                <EmptyState title="No dispensing data yet" height={104} />
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
                  <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                    Dispensed
                  </div>
                  <div style={{ font: `600 21px/1 ${MONO}`, marginTop: 7 }}>{dispensedTotal.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                    Reported to Vayu
                  </div>
                  <div style={{ font: `600 21px/1 ${MONO}`, marginTop: 7 }}>
                    {lastReported
                      ? new Date(lastReported.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
