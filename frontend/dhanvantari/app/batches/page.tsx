'use client';

/**
 * Batch Catalogue — institution view of all received batches.
 *
 * Fetches incoming shipments (which carry receivedBatches) and the inventory
 * drug catalogue to enrich each group with category, genericName, coldChain.
 * Layout mirrors Vayu's /batches page: KPIs · charts · grouped collapsible table.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { getIncoming, getInventory, type IncomingShipment, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import {
  ApiError,
  Card,
  CardTitle,
  Empty,
  Kpi,
  KpiBand,
  PageHeader,
} from '../../components/ui';
import { BarChart, PieChart } from '../../components/charts';
import BatchCatalog, { type BatchGroup } from '../../components/BatchCatalog';

export default function Batches() {
  const [shipments, setShipments] = useState<IncomingShipment[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [inc, inv] = await Promise.all([
          getIncoming(),
          getInventory('?take=300'),
        ]);
        setShipments(inc.items);
        setInventory(inv.items);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Build a drugRef → Drug lookup from inventory
  const drugByRef = useMemo(() => {
    const map = new Map<string, InventoryRow['drug']>();
    for (const row of inventory) {
      map.set(row.drug.name, row.drug);
      if (row.drug.genericName) map.set(row.drug.genericName, row.drug);
    }
    return map;
  }, [inventory]);

  // Flatten all received batches with shipment metadata
  const allBatches = useMemo(
    () =>
      shipments.flatMap((s) =>
        (s.receivedBatches ?? []).map((b) => ({
          ...b,
          _anomalyFlag: s.anomalyFlag,
          _coldChain: s.coldChain,
        })),
      ),
    [shipments],
  );

  // Group batches by drugRef, enriched with drug info from inventory
  const groups: BatchGroup[] = useMemo(() => {
    const map = new Map<string, BatchGroup>();
    for (const b of allBatches) {
      const key = b.drugRef ?? b.id.slice(0, 12);
      if (!map.has(key)) {
        const drug = drugByRef.get(key);
        map.set(key, {
          drugRef: key,
          genericName: drug?.genericName ?? null,
          category: drug?.category ?? null,
          coldChain: b._coldChain,
          hasAnomaly: b._anomalyFlag,
          batches: [],
        });
      }
      const g = map.get(key)!;
      // propagate anomaly/coldChain flags to the group level
      if (b._anomalyFlag) g.hasAnomaly = true;
      if (b._coldChain) g.coldChain = true;
      g.batches.push(b);
    }
    return [...map.values()].sort((a, b) => a.drugRef.localeCompare(b.drugRef));
  }, [allBatches, drugByRef]);

  // KPIs
  const totalBatches = allBatches.length;
  const accepted = allBatches.filter((b) => b.accepted).length;
  const rejected = totalBatches - accepted;
  const coldChainCount = shipments.filter((s) => s.coldChain).length;
  const withAnomaly = shipments.filter((s) => s.anomalyFlag).length;

  // Pie: acceptance breakdown
  const pieData = [
    { label: 'Accepted', value: accepted, color: C.green },
    { label: 'Rejected', value: rejected, color: C.red },
  ];

  // Bar: shipments by status
  const shipmentStatusBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of shipments) {
      map.set(s.status, (map.get(s.status) ?? 0) + 1);
    }
    const colorOf = (status: string) => {
      if (status === 'DELIVERED') return C.green;
      if (status === 'IN_TRANSIT' || status === 'DISPATCHED') return C.accent;
      if (status === 'WAREHOUSED' || status === 'PARTIAL') return C.amber;
      return C.grey;
    };
    return Array.from(map.entries()).map(([status, count]) => ({
      label: status.replace(/_/g, ' '),
      value: count,
      color: colorOf(status),
    }));
  }, [shipments]);

  return (
    <>
      <PageHeader
        title="Batch Catalogue"
        right={
          <Link
            href="/scanin"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 5,
              background: C.accent,
              color: '#fff',
              font: `600 12px/1 ${FONT}`,
              textDecoration: 'none',
              letterSpacing: '.02em',
            }}
          >
            ▣&nbsp;Scan in batch
          </Link>
        }
      />

      <KpiBand columns={4}>
        <Kpi label="Batches received" value={loading ? '…' : totalBatches} />
        <Kpi label="Accepted" value={loading ? '…' : accepted} deltaColor={C.green} />
        <Kpi
          label="Rejected"
          value={loading ? '…' : rejected}
          deltaColor={rejected > 0 ? C.red : C.grey}
        />
        <Kpi
          label="Cold-chain shipments"
          value={loading ? '…' : coldChainCount}
          deltaColor={C.accent}
        />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error && <ApiError error={error} service="dhanvantari-api" />}

        {!loading && totalBatches > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {/* Acceptance pie */}
            <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
              <CardTitle>Batch acceptance</CardTitle>
              <div style={{ padding: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
                <PieChart data={pieData} size={130} centre={String(pieData.reduce((a, d) => a + d.value, 0))} />
                <div style={{ display: 'grid', gap: 8 }}>
                  {pieData.map((d) => (
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
                        <span style={{ font: `500 11px/1.3 ${MONO}`, color: C.ink }}>
                          {d.value}
                        </span>
                      </span>
                    </div>
                  ))}
                  {withAnomaly > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        font: `500 11px/1.4 ${FONT}`,
                        color: C.red,
                        background: C.redTint,
                        borderRadius: 4,
                        padding: '4px 8px',
                      }}
                    >
                      ⚠ {withAnomaly} excursion{withAnomaly !== 1 ? 's' : ''} flagged
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Shipment status bar */}
            <Card>
              <CardTitle>Shipments by status</CardTitle>
              <div style={{ padding: 16 }}>
                {shipmentStatusBars.length === 0 ? (
                  <Empty>No shipment data.</Empty>
                ) : (
                  <BarChart data={shipmentStatusBars} />
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Catalogue */}
        <Card style={{ animation: 'mtRise .55s cubic-bezier(.16,1,.3,1) both' }}>
          {/* search bar */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${C.borderSoft}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Search size={14} style={{ color: C.inkGhost, flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drug name, lot number, or QR payload…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                font: `400 13px/1 ${FONT}`,
                color: C.ink,
                background: 'transparent',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  font: `400 11px/1 ${FONT}`,
                  color: C.inkGhost,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>

          {loading ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                font: `400 13px/1.5 ${FONT}`,
                color: C.inkGhost,
              }}
            >
              Loading batches…
            </div>
          ) : error ? null : (
            <BatchCatalog groups={groups} searchQuery={search} />
          )}
        </Card>
      </div>
    </>
  );
}
