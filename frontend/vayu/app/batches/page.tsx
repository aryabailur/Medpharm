'use client';

/**
 * Batches + QC — manufactured lots, QR payloads, inspection state.
 *
 * Groups batches by drug (mirrors outer Dhanvantari catalog pattern).
 * Click a drug row to expand and see per-batch detail + print buttons.
 */

import { useState, useEffect, useMemo } from 'react';
import { getBatches, type Batch } from '../../lib/api';
import { C, FONT, MONO, statusColors } from '../../lib/theme';
import { Search } from 'lucide-react';
import { ApiError, Card, CardTitle, EmptyState, Kpi, KpiBand, PageHeader } from '../../components/ui';
import { BarChart, GaugeArc, PieChart } from '../../components/charts';
import BatchCatalog from '../../components/BatchCatalog';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Batches() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getBatches('?take=200')
      .then((res) => setBatches(res.items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const now = Date.now();
  const qcApproved = batches.filter((b) => b.status === 'QC_APPROVED');
  const expiringSoon = batches.filter((b) => {
    const days = (new Date(b.expiryDate).getTime() - now) / DAY_MS;
    return days >= 0 && days <= 90;
  });
  const coldChain = batches.filter((b) => b.drug?.coldChain);

  const qcStatusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of batches) {
      map.set(b.status, (map.get(b.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([status, count]) => ({
      label: status.replace(/_/g, ' '),
      value: count,
      color: statusColors(status).color,
    }));
  }, [batches]);

  // QC pass rate — computed only from real qcRecords on the fetched batches.
  // If none of the fetched batches carry inspection records, the gauge shows
  // an honest empty state rather than a fabricated percentage.
  const qcRecordResults = useMemo(
    () => batches.flatMap((b) => b.qcRecords ?? []).map((r) => r.result),
    [batches],
  );
  const qcPassRate = qcRecordResults.length
    ? Math.round((qcRecordResults.filter((r) => r === 'PASS').length / qcRecordResults.length) * 100)
    : null;

  const expiryWindowBars = useMemo(() => {
    const b = { expired: 0, d30: 0, d90: 0, d180: 0, over180: 0 };
    for (const batch of batches) {
      const days = (new Date(batch.expiryDate).getTime() - now) / DAY_MS;
      if (days <= 0) b.expired += 1;
      else if (days <= 30) b.d30 += 1;
      else if (days <= 90) b.d90 += 1;
      else if (days <= 180) b.d180 += 1;
      else b.over180 += 1;
    }
    return [
      { label: 'Expired', value: b.expired, color: C.red },
      { label: '≤30 d', value: b.d30, color: C.amber },
      { label: '31–90 d', value: b.d90, color: C.accent },
      { label: '91–180 d', value: b.d180, color: C.blue },
      { label: '>180 d', value: b.over180, color: C.green },
    ];
  }, [batches, now]);

  return (
    <>
      <PageHeader title="Batches + QC" />

      <KpiBand columns={4}>
        <Kpi label="Total batches" value={loading ? '…' : batches.length} />
        <Kpi label="QC approved" value={loading ? '…' : qcApproved.length} deltaColor={C.green} />
        <Kpi
          label="Expiring ≤90d"
          value={loading ? '…' : expiringSoon.length}
          deltaColor={expiringSoon.length ? C.amber : C.grey}
        />
        <Kpi label="Cold chain" value={loading ? '…' : coldChain.length} deltaColor={C.accent} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gap: 18 }}>
        {error ? (
          <ApiError error={error} />
        ) : (
          <>
            {!loading && batches.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
                <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
                  <CardTitle>QC pass rate</CardTitle>
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                    {qcPassRate == null ? (
                      <EmptyState
                        height={140}
                        glyph="◇"
                        title="No inspections on this page"
                        hint="QC records will populate the gauge once batches are inspected."
                      />
                    ) : (
                      <GaugeArc value={qcPassRate} label={`${qcRecordResults.length} inspections`} size={168} />
                    )}
                  </div>
                </Card>

                <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
                  <CardTitle>QC status distribution</CardTitle>
                  <div style={{ padding: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
                    <PieChart data={qcStatusData} size={140} centre={String(batches.length)} />
                    <div style={{ display: 'grid', gap: 6 }}>
                      {qcStatusData.map((d) => (
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
                              {d.value} batch{d.value === 1 ? '' : 'es'}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardTitle>Batches by expiry horizon</CardTitle>
                  <div style={{ padding: 16 }}>
                    <BarChart data={expiryWindowBars} />
                  </div>
                </Card>
              </div>
            )}

            <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
            {/* search bar */}
            <div style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${C.borderSoft}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
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
              <div style={{ padding: 40, textAlign: 'center', font: `400 13px/1.5 ${FONT}`, color: C.inkGhost }}>
                Loading batches…
              </div>
            ) : (
              <BatchCatalog batches={batches} searchQuery={search} />
            )}
          </Card>
        </>
        )}
      </div>
    </>
  );
}
