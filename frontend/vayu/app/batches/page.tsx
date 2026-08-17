'use client';

/**
 * Batches + QC — manufactured lots, QR payloads, inspection state.
 *
 * Groups batches by drug (mirrors outer Dhanvantari catalog pattern).
 * Click a drug row to expand and see per-batch detail + print buttons.
 */

import { useState, useEffect } from 'react';
import { getBatches, type Batch } from '../../lib/api';
import { C, FONT } from '../../lib/theme';
import { Search } from 'lucide-react';
import { ApiError, Card, Kpi, KpiBand, PageHeader } from '../../components/ui';
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
        )}
      </div>
    </>
  );
}
