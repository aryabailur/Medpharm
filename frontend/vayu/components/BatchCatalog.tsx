'use client';

/**
 * BatchCatalog — groups flat batches by drug, renders collapsible rows.
 *
 * Pattern mirrors the outer Dhanvantari InventoryTable:
 *   ▶ Drug row      — name · generic · category · batch count (Layers icon) · total qty · nearest expiry · status
 *   ▼ Batch sub-row — lot # · QR payload · qty · mfg · expiry · QC · status · print icons (Printer / QrCode)
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import type { Batch } from '../lib/api';
import { C, FONT, MONO } from '../lib/theme';
import { Mono, Pill, Table, Td, Empty } from './ui';
import { PrintBarcodeButton } from './PrintBarcodeButton';

// ─── helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function expiryColor(isoDate: string, now: number): string {
  const d = (new Date(isoDate).getTime() - now) / DAY_MS;
  return d < 0 ? C.red : d <= 90 ? C.amber : C.inkMuted;
}

function expiryWeight(isoDate: string, now: number): number {
  const d = (new Date(isoDate).getTime() - now) / DAY_MS;
  return d <= 90 ? 600 : 400;
}

function nearestExpiry(batches: Batch[]): string | null {
  const future = batches
    .filter((b) => new Date(b.expiryDate).getTime() > Date.now())
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  return future[0]?.expiryDate ?? batches[0]?.expiryDate ?? null;
}

function overallStatus(batches: Batch[], now: number): string {
  const totalQty = batches.reduce((s, b) => s + b.quantity, 0);
  if (totalQty === 0) return 'OUT OF STOCK';
  const expiringSoon = batches.some((b) => {
    const d = (new Date(b.expiryDate).getTime() - now) / DAY_MS;
    return d >= 0 && d <= 90;
  });
  if (expiringSoon) return 'EXPIRING SOON';
  const hasQcApproved = batches.some((b) => b.status === 'QC_APPROVED');
  if (hasQcApproved) return 'QC APPROVED';
  return batches[0]?.status ?? '—';
}

// ─── types ────────────────────────────────────────────────────────────────────

interface DrugGroup {
  drugId: string;
  drugName: string;
  genericName: string | null;
  category: string | null;
  coldChain: boolean;
  batches: Batch[];
}

// ─── sub-components ──────────────────────────────────────────────────────────

function DrugRow({
  group,
  isOpen,
  onToggle,
  now,
}: {
  group: DrugGroup;
  isOpen: boolean;
  onToggle: () => void;
  now: number;
}) {
  const nearest = nearestExpiry(group.batches);
  const totalQty = group.batches.reduce((s, b) => s + b.quantity, 0);
  const status = overallStatus(group.batches, now);

  const statusColor =
    status === 'OUT OF STOCK' ? C.red
    : status === 'EXPIRING SOON' ? C.amber
    : status === 'QC APPROVED' ? C.green
    : C.grey;
  const statusTint =
    status === 'OUT OF STOCK' ? C.redTint
    : status === 'EXPIRING SOON' ? C.amberTint
    : status === 'QC APPROVED' ? C.greenTint
    : C.greyTint;

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
      {/* expand chevron */}
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

      {/* drug name + generic name */}
      <Td>
        <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>{group.drugName}</div>
        {group.genericName && group.genericName !== group.drugName && (
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

      {/* category */}
      <Td>
        {group.category ? (
          <span style={{
            font: `600 10px/1.2 ${FONT}`,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: C.inkMuted,
            background: C.raised,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: '2px 8px',
            display: 'inline-block',
          }}>
            {group.category}
          </span>
        ) : '—'}
      </Td>

      {/* batch count with Layers symbol */}
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.inkMuted }}>
          <Layers size={13} style={{ color: C.inkGhost }} />
          <span style={{ font: `500 12px/1 ${MONO}` }}>{group.batches.length}</span>
          <span style={{ font: `400 11px/1 ${FONT}`, color: C.inkGhost }}>
            batch{group.batches.length !== 1 ? 'es' : ''}
          </span>
        </div>
      </Td>

      {/* total qty */}
      <Td>
        <Mono>{totalQty.toLocaleString('en-IN')}</Mono>
      </Td>

      {/* nearest expiry */}
      <Td>
        {nearest ? (
          <span style={{
            font: `500 12px/1 ${FONT}`,
            color: expiryColor(nearest, now),
            fontWeight: expiryWeight(nearest, now),
          }}>
            {new Date(nearest).toLocaleDateString('en-GB')}
          </span>
        ) : '—'}
      </Td>

      {/* status */}
      <Td>
        <span style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: 5,
          background: statusTint,
          color: statusColor,
          font: `600 10px/1.4 ${MONO}`,
          letterSpacing: '.04em',
        }}>
          {status}
        </span>
      </Td>

      {/* spacer for alignment with sub-row actions */}
      <Td />
    </tr>
  );
}

function BatchSubRow({
  batch,
  drugName,
  idx,
  now,
}: {
  batch: Batch;
  drugName: string;
  idx: number;
  now: number;
}) {
  const latestQc = batch.qcRecords && batch.qcRecords.length > 0 ? batch.qcRecords[0] : null;
  const expColor = expiryColor(batch.expiryDate, now);
  const expWeight = expiryWeight(batch.expiryDate, now);

  return (
    <tr
      style={{
        background: C.raised,
        borderLeft: `3px solid ${C.accent}40`,
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      {/* index */}
      <Td style={{ paddingLeft: 14, paddingRight: 4, opacity: 0.4 }}>
        <span style={{ font: `600 10px/1 ${MONO}` }}>
          {(idx + 1).toString().padStart(2, '0')}
        </span>
      </Td>

      {/* lot number */}
      <Td>
        <Mono>{batch.lotNumber}</Mono>
      </Td>

      {/* QR / Barcode & Action symbols */}
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkMuted, wordBreak: 'break-all' }}>
            {batch.qrPayload ?? '—'}
          </span>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <PrintBarcodeButton
              supplierName="Bharat Biologicals"
              productName={drugName}
              barcode={batch.qrPayload || batch.lotNumber}
              lotNumber={batch.lotNumber}
            />
          </div>
        </div>
      </Td>

      {/* qty */}
      <Td>
        <Mono>{batch.quantity.toLocaleString('en-IN')}</Mono>
      </Td>

      {/* mfg date */}
      <Td style={{ font: `400 12px/1.4 ${FONT}`, color: C.inkFaint }}>
        {new Date(batch.mfgDate).toLocaleDateString('en-GB')}
      </Td>

      {/* expiry */}
      <Td style={{ color: expColor, fontWeight: expWeight, font: `500 12px/1.4 ${FONT}` }}>
        {new Date(batch.expiryDate).toLocaleDateString('en-GB')}
      </Td>

      {/* QC */}
      <Td>
        {latestQc ? <Pill label={latestQc.result} /> : <Pill label="AWAITING" />}
      </Td>

      {/* batch status */}
      <Td>
        <Pill label={batch.status} />
      </Td>
    </tr>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────

interface BatchCatalogProps {
  batches: Batch[];
  searchQuery?: string;
}

export default function BatchCatalog({ batches, searchQuery = '' }: BatchCatalogProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const now = Date.now();

  const toggle = (drugId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(drugId) ? next.delete(drugId) : next.add(drugId);
      return next;
    });

  // Group batches by drug
  const groups = new Map<string, DrugGroup>();
  for (const b of batches) {
    const key = b.drugId;
    if (!groups.has(key)) {
      groups.set(key, {
        drugId: b.drugId,
        drugName: b.drug?.name ?? b.drugId,
        genericName: b.drug?.genericName ?? null,
        category: b.drug?.category ?? null,
        coldChain: b.drug?.coldChain ?? false,
        batches: [],
      });
    }
    groups.get(key)!.batches.push(b);
  }

  // Filter by search (name, generic, category, lot, qr)
  const filtered = [...groups.values()].filter((g) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.drugName.toLowerCase().includes(q) ||
      (g.genericName && g.genericName.toLowerCase().includes(q)) ||
      (g.category && g.category.toLowerCase().includes(q)) ||
      g.batches.some(
        (b) =>
          b.lotNumber.toLowerCase().includes(q) ||
          b.qrPayload?.toLowerCase().includes(q)
      )
    );
  });

  if (filtered.length === 0) {
    return <Empty>{searchQuery ? `No batches match "${searchQuery}".` : 'No batches on record.'}</Empty>;
  }

  return (
    <Table head={['', 'Drug', 'Category', 'Batches', 'Total Qty', 'Nearest Expiry', 'Status', 'Actions']}>
      {filtered.map((group) => {
        const isOpen = expanded.has(group.drugId);
        return (
          <>
            <DrugRow
              key={`drug-${group.drugId}`}
              group={group}
              isOpen={isOpen}
              onToggle={() => toggle(group.drugId)}
              now={now}
            />
            {isOpen &&
              group.batches.map((batch, idx) => (
                <BatchSubRow
                  key={`batch-${batch.id}`}
                  batch={batch}
                  drugName={group.drugName}
                  idx={idx}
                  now={now}
                />
              ))}
          </>
        );
      })}
    </Table>
  );
}
