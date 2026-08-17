'use client';

/**
 * Scan-in — §11's 3:20 beat: no form, no batch number typed. Scan, photo,
 * send. A QR resolves straight to the drug/batch/expiry/QC the supplier
 * already declared; the dock only confirms quantity and condition.
 */

import { useState } from 'react';

import {
  confirmReceipt,
  fileComplaint,
  resolveQr,
  type ResolvedBatch,
} from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, Empty, PageHeader, Pill, Segmented } from '../../components/ui';

const COMPLAINT_CATEGORIES = [
  { value: 'BREAKAGE', label: 'Breakage' },
  { value: 'QTY_MISMATCH', label: 'Qty mismatch' },
  { value: 'TEMP_DAMAGE', label: 'Temp damage' },
  { value: 'SEAL_TAMPERED', label: 'Seal tampered' },
  { value: 'NEAR_EXPIRY', label: 'Near expiry' },
];

const ACCEPT_OPTIONS = [
  { value: 'accept', label: 'Accept' },
  { value: 'reject', label: 'Reject' },
];

const inputStyle = {
  padding: '7px 10px',
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  font: `400 13px/1.4 ${FONT}`,
  color: C.ink,
  background: C.surface,
};

export default function ScanIn() {
  const [qr, setQr] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [batch, setBatch] = useState<ResolvedBatch | null>(null);

  const [qtyReceived, setQtyReceived] = useState<number>(0);
  const [decision, setDecision] = useState('accept');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [showComplaint, setShowComplaint] = useState(false);
  const [category, setCategory] = useState('BREAKAGE');
  const [description, setDescription] = useState('');
  const [filingComplaint, setFilingComplaint] = useState(false);
  const [complaintError, setComplaintError] = useState<string | null>(null);
  const [complaintId, setComplaintId] = useState<string | null>(null);

  async function handleResolve() {
    const value = qr.trim();
    if (!value || resolving) return;
    setResolving(true);
    setResolveError(null);
    setNotFound(null);
    setBatch(null);
    setConfirmed(false);
    setShowComplaint(false);
    setComplaintId(null);
    try {
      const res = await resolveQr(value);
      setBatch(res);
      setQtyReceived(res.qtyExpected ?? 0);
      setDecision('accept');
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('404')) {
        setNotFound(value);
      } else {
        setResolveError(msg);
      }
    } finally {
      setResolving(false);
    }
  }

  async function handleConfirm() {
    if (!batch || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmReceipt({
        shipmentId: batch.shipmentId ?? '',
        scannedBy: 'dock-1',
        batches: [
          {
            batchId: batch.batchId,
            qtyExpected: batch.qtyExpected ?? undefined,
            qtyReceived,
            accepted: decision === 'accept',
            conditionPhotoUrls: [],
          },
        ],
      });
      setConfirmed(true);
    } catch (e) {
      setConfirmError((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function handleFileComplaint() {
    if (!batch || filingComplaint) return;
    setFilingComplaint(true);
    setComplaintError(null);
    try {
      const res = await fileComplaint({
        batchId: batch.batchId,
        shipmentId: batch.shipmentId ?? undefined,
        institutionId: 'self',
        category,
        description: description.trim() || undefined,
      });
      setComplaintId(res.complaintId);
    } catch (e) {
      setComplaintError((e as Error).message);
    } finally {
      setFilingComplaint(false);
    }
  }

  return (
    <>
      <PageHeader title="Scan-in" />

      <div style={{ padding: 26, display: 'grid', gap: 18, maxWidth: 640 }}>
        <Card style={{ padding: 16, animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleResolve();
              }}
              placeholder="Scan or type batch id / QR value"
              style={{ ...inputStyle, flex: 1 }}
            />
            <Button onClick={() => void handleResolve()} disabled={resolving || !qr.trim()}>
              {resolving ? '…' : 'Resolve'}
            </Button>
          </div>
          <div style={{ marginTop: 8, font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
            Scan a Vayu QR or type a batch id.
          </div>
        </Card>

        {resolveError && <ApiError error={resolveError} service="dhanvantari-api" />}

        {notFound && (
          <Card>
            <Empty>No batch matching &ldquo;{notFound}&rdquo; on any manifest received here.</Empty>
          </Card>
        )}

        {batch && (
          <Card>
            <CardTitle>Resolved batch</CardTitle>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ font: `600 14px/1.3 ${FONT}`, color: C.ink }}>{batch.drug?.name ?? 'Unknown drug'}</div>
                  <div style={{ font: `500 12px/1.6 ${MONO}`, color: C.inkMuted, marginTop: 2 }}>
                    {batch.batchId}
                  </div>
                </div>
                {batch.coldChain && <Pill label="COLD CHAIN" />}
              </div>
              <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted }}>
                Qty expected: <span style={{ font: `500 12px/1.4 ${MONO}`, color: C.ink }}>{batch.qtyExpected ?? '—'}</span>
              </div>

              {batch.anomalyFlag && (
                <div
                  style={{
                    background: C.redTint,
                    border: `1px solid ${C.red}`,
                    borderRadius: 4,
                    padding: '10px 14px',
                    font: `500 12px/1.6 ${FONT}`,
                    color: C.red,
                  }}
                >
                  This consignment breached its cold chain in transit. Quarantine before accepting.
                </div>
              )}
            </div>
          </Card>
        )}

        {batch && !confirmed && (
          <Card>
            <CardTitle>Receipt</CardTitle>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ font: `500 11px/1.4 ${FONT}`, color: C.inkFaint }}>Qty received</span>
                <input
                  type="number"
                  value={qtyReceived}
                  onChange={(e) => setQtyReceived(Number(e.target.value))}
                  style={{ ...inputStyle, width: 140 }}
                />
              </label>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ font: `500 11px/1.4 ${FONT}`, color: C.inkFaint }}>Condition</span>
                <Segmented options={ACCEPT_OPTIONS} value={decision} onChange={setDecision} />
              </div>
              {confirmError && <ApiError error={confirmError} service="dhanvantari-api" />}
              <div>
                <Button onClick={() => void handleConfirm()} disabled={confirming}>
                  {confirming ? '…' : 'Confirm receipt'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {confirmed && (
          <Card style={{ padding: 16 }}>
            <div style={{ font: `600 13px/1.4 ${FONT}`, color: C.green }}>Receipt confirmed.</div>
            {!showComplaint && !complaintId && (
              <div style={{ marginTop: 10 }}>
                <Button variant="ghost" onClick={() => setShowComplaint(true)}>
                  File a complaint
                </Button>
              </div>
            )}
          </Card>
        )}

        {showComplaint && !complaintId && (
          <Card>
            <CardTitle>Complaint</CardTitle>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ font: `500 11px/1.4 ${FONT}`, color: C.inkFaint }}>Category</span>
                <Segmented options={COMPLAINT_CATEGORIES} value={category} onChange={setCategory} />
              </div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ font: `500 11px/1.4 ${FONT}`, color: C.inkFaint }}>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' as const }}
                />
              </label>
              {complaintError && <ApiError error={complaintError} service="dhanvantari-api" />}
              <div>
                <Button onClick={() => void handleFileComplaint()} disabled={filingComplaint}>
                  {filingComplaint ? '…' : 'File complaint'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {complaintId && (
          <Card style={{ padding: 16 }}>
            <div style={{ font: `600 13px/1.4 ${FONT}`, color: C.ink }}>Complaint filed.</div>
            <div style={{ marginTop: 6, font: `500 12px/1.6 ${MONO}`, color: C.inkMuted }}>{complaintId}</div>
          </Card>
        )}
      </div>
    </>
  );
}
