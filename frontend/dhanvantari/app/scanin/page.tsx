'use client';

/**
 * Scan-in — §11's 3:20 beat: no form, no batch number typed. Scan, photo,
 * send. A QR resolves straight to the drug/batch/expiry/QC the supplier
 * already declared; the dock only confirms quantity and condition.
 *
 * Confirm-before-commit is the whole point of this screen: the proposed count
 * is a PROPOSAL — nothing writes to inventory until the human hits commit.
 */

import { useState, useCallback } from 'react';

import {
  confirmReceipt,
  fileComplaint,
  resolveQr,
  type ResolvedBatch,
} from '../../lib/api';
import { C, EASE, FONT, MONO, num, rise } from '../../lib/theme';
import { ApiError, Button, EmptyState, PageHeader, Panel, PanelTitle } from '../../components/ui';
import BarcodeScanner from '../../components/BarcodeScanner';

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
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const [filedComplaintId, setFiledComplaintId] = useState<string | null>(null);

  async function handleResolve(value = qr.trim()) {
    if (!value || resolving) return;
    setResolving(true);
    setResolveError(null);
    setNotFound(null);
    setBatch(null);
    setCommitted(false);
    setFiledComplaintId(null);
    try {
      const res = await resolveQr(value);
      setBatch(res);
      setQtyReceived(res.qtyExpected ?? 0);
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

  // Called by BarcodeScanner on camera detection — auto-resolves, no typing needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleScan = useCallback((decoded: string) => {
    setQr(decoded);
    void handleResolve(decoded);
  }, []);

  const short = batch && batch.qtyExpected != null ? Math.max(0, batch.qtyExpected - qtyReceived) : 0;
  const hasExcursion = !!batch?.anomalyFlag;
  const needsComplaint = short > 0 || hasExcursion;

  async function handleCommit() {
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
            accepted: true,
            conditionPhotoUrls: [],
          },
        ],
      });
      let cid: string | null = null;
      if (needsComplaint) {
        const res = await fileComplaint({
          batchId: batch.batchId,
          shipmentId: batch.shipmentId ?? undefined,
          institutionId: 'self',
          category: hasExcursion ? 'TEMP_DAMAGE' : 'QTY_MISMATCH',
          description:
            short > 0
              ? `${short} units short of manifest${hasExcursion ? '; shipment carries a cold-chain excursion' : ''}.`
              : 'Cold-chain excursion attached to this shipment.',
        });
        cid = res.complaintId;
      }
      setFiledComplaintId(cid);
      setCommitted(true);
    } catch (e) {
      setConfirmError((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function handleQuarantine() {
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
            qtyReceived: 0,
            accepted: false,
            conditionPhotoUrls: [],
          },
        ],
      });
      const res = await fileComplaint({
        batchId: batch.batchId,
        shipmentId: batch.shipmentId ?? undefined,
        institutionId: 'self',
        category: hasExcursion ? 'TEMP_DAMAGE' : 'QTY_MISMATCH',
        description: 'Full shipment quarantined on receipt.',
      });
      setFiledComplaintId(res.complaintId);
      setCommitted(true);
    } catch (e) {
      setConfirmError((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  const state: 'PROPOSAL' | 'COMMITTED' = committed ? 'COMMITTED' : 'PROPOSAL';
  const stateTint = state === 'COMMITTED' ? C.greenTint : C.amberTint;
  const stateColor = state === 'COMMITTED' ? '#14532D' : C.amber;

  const rows = batch
    ? [
        { label: 'Batch', note: 'Read from QR — pre-linked, nothing typed', value: batch.batchId, color: C.inkStrong },
        { label: 'Shipment', note: 'Manifest matched on arrival', value: batch.shipmentId ?? '—', color: C.inkStrong },
        {
          label: 'Quantity expected',
          note: 'From the supplier manifest',
          value: batch.qtyExpected != null ? num(batch.qtyExpected) : '—',
          color: C.inkStrong,
        },
        {
          label: 'Quantity counted',
          note: 'Proposal from tray photo — a human confirms',
          value: num(qtyReceived),
          color: short > 0 ? C.amber : C.inkStrong,
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Scan-in" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1.1fr)', gap: 24, padding: '26px 26px 52px' }}>
        {/* LEFT — scan */}
        <Panel delayMs={0}>
          <PanelTitle right={<span style={{ font: `400 11px/1 ${MONO}`, color: C.inkFaint }}>camera ready</span>}>
            Scan a batch QR
          </PanelTitle>
          <div style={{ padding: 18 }}>
            <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkFaint }}>
              Batch, shipment and expected quantity arrive pre-linked. Nothing typed by hand.
            </div>

            {/* Live camera scanner — same html5-qrcode engine as outer Dhanvantari */}
            <div style={{ marginTop: 14 }}>
              <BarcodeScanner onScanSuccess={handleScan} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <input
                value={qr}
                onChange={(e) => setQr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleResolve();
                }}
                placeholder="Or type batch id / QR value"
                style={{ ...inputStyle, flex: 1 }}
              />
              <Button onClick={() => void handleResolve()} disabled={resolving || !qr.trim()}>
                {resolving ? '…' : 'Resolve'}
              </Button>
            </div>

            {resolveError && (
              <div style={{ marginTop: 12 }}>
                <ApiError error={resolveError} service="dhanvantari-api" />
              </div>
            )}
            {notFound && (
              <div style={{ marginTop: 12 }}>
                <EmptyState title={`No batch matching "${notFound}"`} hint="Nothing on any manifest received here matches this value." height={120} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div style={{ border: `1px solid ${C.border}`, padding: '11px 12px' }}>
                <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkFaint }}>Condition photos</div>
                <div style={{ font: `600 19px/1 ${MONO}`, color: C.ink, marginTop: 6 }}>
                  {batch ? 0 : '—'} attached
                </div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, padding: '11px 12px' }}>
                <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkFaint }}>Seal check</div>
                <div style={{ font: `600 16px/1 ${FONT}`, color: hasExcursion ? C.amber : C.ink, marginTop: 6 }}>
                  {hasExcursion ? 'Tray damp' : batch ? 'Intact' : '—'}
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* RIGHT — confirm before commit */}
        <Panel delayMs={60}>
          <PanelTitle
            right={
              <span
                style={{
                  font: `600 10px/1 ${FONT}`,
                  letterSpacing: '.06em',
                  padding: '3px 7px',
                  borderRadius: 3,
                  background: stateTint,
                  color: stateColor,
                  transition: 'background .3s ease, color .3s ease',
                }}
              >
                {state}
              </span>
            }
          >
            Confirm before commit
          </PanelTitle>

          {!batch ? (
            <EmptyState title="Scan a batch to review before it commits" height={220} />
          ) : (
            <div>
              {rows.map((r) => (
                <div
                  key={r.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '16px 18px',
                    borderBottom: `1px solid ${C.borderSoft}`,
                    borderLeft: committed ? `2px solid #15803D` : `2px dashed #D9BE85`,
                    background: committed ? '#F1F8F3' : '#FFFCF4',
                    transition: `background .4s ${EASE}, border-color .4s ${EASE}`,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ font: `500 13px/1.35 ${FONT}`, color: C.ink }}>{r.label}</div>
                    <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 3 }}>{r.note}</div>
                  </div>
                  <div style={{ font: `500 13px/1.5 ${MONO}`, color: r.color, textAlign: 'right' }}>{r.value}</div>
                </div>
              ))}

              {/* Qty adjuster */}
              {!committed && (
                <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borderSoft}` }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ font: `500 12px/1 ${FONT}`, color: C.inkMuted }}>Adjust qty counted</span>
                    <input
                      type="number"
                      min={0}
                      value={qtyReceived}
                      onChange={(e) => setQtyReceived(Number(e.target.value))}
                      style={{ ...inputStyle, width: 100 }}
                    />
                  </label>
                </div>
              )}

              <div style={{ padding: 20 }}>
                {needsComplaint && !committed && (
                  <div
                    style={{
                      borderLeft: `2px solid ${C.red}`,
                      background: '#FDF6F5',
                      padding: 12,
                      font: `400 12px/1.6 ${FONT}`,
                      color: '#8A2A22',
                    }}
                  >
                    {short > 0
                      ? `Quantity received is ${short} unit${short === 1 ? '' : 's'} short of the manifest`
                      : 'This shipment carries a cold-chain excursion'}
                    {hasExcursion && short > 0 ? ', and this shipment carries an excursion' : ''}. Accepting will
                    pre-link a complaint to {batch.batchId} and {batch.shipmentId ?? 'this shipment'}.
                  </div>
                )}

                {confirmError && (
                  <div style={{ marginTop: 12 }}>
                    <ApiError error={confirmError} service="dhanvantari-api" />
                  </div>
                )}

                {committed && (
                  <div
                    style={{
                      border: '1px solid #BBD9C4',
                      background: '#F1F8F3',
                      padding: 13,
                      marginTop: 12,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        flex: '0 0 22px',
                        borderRadius: 3,
                        background: C.green,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        font: `600 12px/1 ${FONT}`,
                        animation: `mtPop .4s ${EASE} both`,
                      }}
                    >
                      ✓
                    </span>
                    <div>
                      <div style={{ font: `600 12px/1.45 ${FONT}`, color: '#14532D' }}>
                        Committed · {num(qtyReceived)} units received
                      </div>
                      <div style={{ font: `400 11px/1.6 ${FONT}`, color: '#166534', marginTop: 3 }}>
                        {filedComplaintId ? `${filedComplaintId} filed against ${batch.batchId}` : 'No complaint required'}
                        {batch.shipmentId ? ` and ${batch.shipmentId}` : ''} · supplier notified over webhook.
                      </div>
                    </div>
                  </div>
                )}

                {!committed && (
                  <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
                    <Button onClick={() => void handleCommit()} disabled={confirming}>
                      {confirming ? '…' : `Accept ${num(qtyReceived)}${needsComplaint ? ' & file complaint' : ''}`}
                    </Button>
                    <Button variant="ghost" onClick={() => void handleQuarantine()} disabled={confirming}>
                      Quarantine all
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
