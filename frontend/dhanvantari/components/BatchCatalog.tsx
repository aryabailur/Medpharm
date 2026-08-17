'use client';

/**
 * BatchCatalog — Dhanvantari edition.
 *
 * Column layout mirrors Vayu's BatchCatalog exactly:
 *
 * DrugRow:   [▶][Drug name + generic + cold chain][Category chip][Batch count][Qty received][Last scanned][Status][—]
 * BatchSubRow:[01][Batch ID / lot][Batch ID + 🖨 QrCode icons][Qty expected→received][Scanned date][Condition][Scanned by]
 *
 * Col 3 ("Category" in parent rows) doubles as "Batch ref + print actions" in sub-rows,
 * identical to how Vayu uses it for "QR payload + icons".
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import type { ReceivedBatch } from '../lib/api';
import { C, FONT, MONO, statusColors } from '../lib/theme';
import { Empty, Mono, Pill, Table, Td } from './ui';
import { PrintBarcodeButton } from './PrintBarcodeButton';

// ─── helpers ─────────────────────────────────────────────────────────────────

function overallStatus(batches: ReceivedBatch[], hasAnomaly: boolean): string {
  if (hasAnomaly) return 'EXCURSION';
  const total = batches.length;
  if (total === 0) return 'NO DATA';
  const accepted = batches.filter((b) => b.accepted).length;
  if (accepted === 0) return 'ALL REJECTED';
  if (accepted < total) return 'PARTIAL';
  return 'ACCEPTED';
}

function latestScan(batches: ReceivedBatch[]): string | null {
  const dates = batches.map((b) => b.scannedAt).filter(Boolean);
  if (dates.length === 0) return null;
  return dates.sort().reverse()[0] ?? null;
}

// ─── types ────────────────────────────────────────────────────────────────────

export interface BatchGroup {
  drugRef: string;
  genericName?: string | null;
  category?: string | null;
  coldChain?: boolean;
  hasAnomaly?: boolean;
  batches: ReceivedBatch[];
}

// ─── DrugRow ─────────────────────────────────────────────────────────────────

function DrugRow({
  group,
  isOpen,
  onToggle,
}: {
  group: BatchGroup;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const totalReceived = group.batches.reduce((s, b) => s + (b.qtyReceived ?? 0), 0);
  const status = overallStatus(group.batches, group.hasAnomaly ?? false);
  const nearest = latestScan(group.batches);
  const { color: statusColor, tint: statusTint } = statusColors(status);

  return (
    <tr
      onClick={onToggle}
      style={{
        background: isOpen ? C.raised : C.surface,
        cursor: 'pointer',
        transition: 'background .15s',
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      {/* col 1 — expand chevron */}
      <Td style={{ width: 36, paddingLeft: 14, paddingRight: 4 }}>
        <button
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.inkGhost,
          }}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </Td>

      {/* col 2 — drug name + generic + cold chain */}
      <Td>
        <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>{group.drugRef}</div>
        {group.genericName && group.genericName !== group.drugRef && (
          <div style={{ font: `400 11px/1.3 ${FONT}`, color: C.inkGhost, marginTop: 1 }}>
            {group.genericName}
          </div>
        )}
        {group.coldChain && (
          <div style={{ font: `600 10px/1.3 ${FONT}`, color: C.accent, marginTop: 2 }}>
            cold chain
          </div>
        )}
      </Td>

      {/* col 3 — category chip */}
      <Td>
        {group.category ? (
          <span
            style={{
              font: `600 10px/1.2 ${FONT}`,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: C.inkMuted,
              background: C.raised,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '2px 8px',
              display: 'inline-block',
            }}
          >
            {group.category}
          </span>
        ) : (
          '—'
        )}
      </Td>

      {/* col 4 — batch count */}
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.inkMuted }}>
          <Layers size={13} style={{ color: C.inkGhost }} />
          <span style={{ font: `500 12px/1 ${MONO}` }}>{group.batches.length}</span>
          <span style={{ font: `400 11px/1 ${FONT}`, color: C.inkGhost }}>
            batch{group.batches.length !== 1 ? 'es' : ''}
          </span>
        </div>
      </Td>

      {/* col 5 — total qty received */}
      <Td>
        <Mono>{totalReceived.toLocaleString('en-IN')}</Mono>
      </Td>

      {/* col 6 — latest scan date */}
      <Td>
        {nearest ? (
          <span style={{ font: `500 12px/1 ${FONT}`, color: C.inkMuted }}>
            {new Date(nearest).toLocaleDateString('en-GB')}
          </span>
        ) : (
          '—'
        )}
      </Td>

      {/* col 7 — status pill */}
      <Td>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: 5,
            background: statusTint,
            color: statusColor,
            font: `600 10px/1.4 ${MONO}`,
            letterSpacing: '.04em',
          }}
        >
          {status}
        </span>
      </Td>

      {/* col 8 — spacer (aligns with sub-row last col) */}
      <Td />
    </tr>
  );
}

// ─── BatchSubRow ──────────────────────────────────────────────────────────────

function BatchSubRow({
  batch,
  drugRef,
  idx,
}: {
  batch: ReceivedBatch;
  drugRef: string;
  idx: number;
}) {
  const condStatus = batch.accepted ? 'ACCEPTED' : 'REJECTED';
  const { color: condColor, tint: condTint } = statusColors(condStatus);

  return (
    <tr
      style={{
        background: C.raised,
        borderLeft: `3px solid ${C.accent}40`,
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      {/* col 1 — row index */}
      <Td style={{ paddingLeft: 14, paddingRight: 4, opacity: 0.4 }}>
        <span style={{ font: `600 10px/1 ${MONO}` }}>
          {(idx + 1).toString().padStart(2, '0')}
        </span>
      </Td>

      {/* col 2 — batch id (short, acts as lot #) */}
      <Td>
        <Mono>{batch.id.slice(0, 16)}</Mono>
      </Td>

      {/* col 3 — full batch ref + print icons (reuses "Category" slot, same as Vayu's QR payload slot) */}
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkMuted, wordBreak: 'break-all' }}>
            {batch.id}
          </span>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <PrintBarcodeButton
              institutionName="Dhanvantari"
              medicineName={drugRef}
              barcode={batch.id}
              batch={batch.id.slice(0, 18)}
            />
          </div>
        </div>
      </Td>

      {/* col 4 — qty expected → received */}
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Mono color={C.inkGhost}>{batch.qtyExpected ?? '—'}</Mono>
          <span style={{ font: `400 10px ${FONT}`, color: C.inkGhost }}>→</span>
          <Mono color={C.ink}>{batch.qtyReceived ?? '—'}</Mono>
        </div>
      </Td>

      {/* col 5 — scanned at */}
      <Td style={{ font: `400 12px/1.4 ${FONT}`, color: C.inkFaint }}>
        {batch.scannedAt
          ? new Date(batch.scannedAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: '2-digit',
            })
          : '—'}
      </Td>

      {/* col 6 — condition pill */}
      <Td>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: 5,
            background: condTint,
            color: condColor,
            font: `600 10px/1.4 ${MONO}`,
            letterSpacing: '.04em',
          }}
        >
          {condStatus}
        </span>
      </Td>

      {/* col 7 — scanned by */}
      <Td>
        {batch.scannedBy ? (
          <span style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkGhost }}>{batch.scannedBy}</span>
        ) : (
          <Pill label={batch.accepted ? 'ACCEPTED' : 'REJECTED'} />
        )}
      </Td>

      {/* col 8 — empty (mirrors DrugRow spacer) */}
      <Td />
    </tr>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────

interface BatchCatalogProps {
  groups: BatchGroup[];
  searchQuery?: string;
}

export default function BatchCatalog({ groups, searchQuery = '' }: BatchCatalogProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (ref: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(ref) ? next.delete(ref) : next.add(ref);
      return next;
    });

  const filtered = groups.filter((g) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.drugRef.toLowerCase().includes(q) ||
      (g.genericName?.toLowerCase().includes(q) ?? false) ||
      (g.category?.toLowerCase().includes(q) ?? false) ||
      g.batches.some((b) => b.id.toLowerCase().includes(q))
    );
  });

  if (filtered.length === 0) {
    return (
      <Empty>
        {searchQuery ? `No batches match "${searchQuery}".` : 'No scanned batches on record.'}
      </Empty>
    );
  }

  return (
    <Table head={['', 'Drug', 'Category', 'Batches', 'Qty Received', 'Last Scanned', 'Status', 'Actions']}>
      {filtered.map((group) => {
        const isOpen = expanded.has(group.drugRef);
        return (
          <>
            <DrugRow
              key={group.drugRef}
              group={group}
              isOpen={isOpen}
              onToggle={() => toggle(group.drugRef)}
            />
            {isOpen &&
              group.batches.map((batch, idx) => (
                <BatchSubRow
                  key={batch.id}
                  batch={batch}
                  drugRef={group.drugRef}
                  idx={idx}
                />
              ))}
          </>
        );
      })}
    </Table>
  );
}
