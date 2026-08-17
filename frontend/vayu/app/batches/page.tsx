'use client';

/**
 * Batches + QC — manufactured lots, QR payloads, inspection state.
 *
 * Groups batches by drug (mirrors outer Dhanvantari catalog pattern).
 * Click a drug row to expand and see per-batch detail + print buttons.
 */

import { useState, useEffect } from 'react';
import { getBatches, type Batch } from '../../lib/api';
import { C, FONT, MONO, rise, stagger } from '../../lib/theme';
import { Search } from 'lucide-react';
import { ApiError, Card, PageHeader } from '../../components/ui';
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

      {/* The handoff's secondary KPI strip: 32px figures, colour carrying the
          reading, flush to the page edges rather than sitting in cards. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {[
          { label: 'Total batches', value: batches.length, color: C.ink, note: 'Manufactured lots on record' },
          { label: 'QC approved', value: qcApproved.length, color: C.green, note: 'Cleared for allocation' },
          {
            label: 'Expiring ≤ 90 d',
            value: expiringSoon.length,
            color: expiringSoon.length ? C.amber : C.grey,
            note: 'Dispatch these first',
          },
          { label: 'Cold chain', value: coldChain.length, color: C.blue, note: 'Held at 2–8 °C' },
        ].map((k, i) => (
          <div
            key={k.label}
            style={{
              padding: '24px 26px',
              borderRight: i === 3 ? 'none' : `1px solid ${C.borderFaint}`,
              animation: stagger(i),
            }}
          >
            <div
              style={{
                font: `600 11px/1 ${FONT}`,
                letterSpacing: '.17em',
                textTransform: 'uppercase',
                color: C.inkFaint,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                font: `600 32px/1 ${MONO}`,
                letterSpacing: '-.03em',
                fontVariantNumeric: 'tabular-nums',
                color: k.color,
                marginTop: 12,
              }}
            >
              {loading ? '…' : k.value}
            </div>
            <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '26px 26px 52px', display: 'grid', gap: 24 }}>
        {error ? (
          <ApiError error={error} />
        ) : (
          <Card style={{ animation: rise(0) }}>
            {/* Card header strip, then the search row beneath it — the handoff
                always labels a card before its controls. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '17px 18px',
                borderBottom: `1px solid ${C.border}`,
                background: C.surfaceAlt,
              }}
            >
              <span
                style={{
                  font: `600 11px/1 ${FONT}`,
                  letterSpacing: '.17em',
                  textTransform: 'uppercase',
                  color: C.inkFaint,
                }}
              >
                Batches · {loading ? '…' : batches.length} lots
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ font: `500 11px/1 ${MONO}`, color: C.inkFaint }}>
                grouped by drug · click to expand
              </span>
            </div>

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
