'use client';

/**
 * Trace — full custody chain from manufacture to complaint.
 */

import { useState } from 'react';

import { getBatch, resolveQr, type Batch, type Drug } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { Button, Card, Empty, PageHeader, Pill } from '../../components/ui';

type ShipmentBatchEntry = {
  shipmentId: string;
  shipment: { id: string; status: string; dispatchedAt: string | null; deliveredAt: string | null };
};

/** getBatch's full response nests the whole Drug row, not the narrow list-view pick. */
type FullBatch = Omit<Batch, 'drug'> & { drug?: Drug; shipmentBatch?: ShipmentBatchEntry[] };

export default function Trace() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [batch, setBatch] = useState<FullBatch | null>(null);
  // qcRecords arrives newest-first from the API; the timeline reads oldest-first.

  const handleTrace = async () => {
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setNotFound(null);
    setBatch(null);
    try {
      const resolved = await resolveQr(value);
      const full = await getBatch(resolved.batchId);
      setBatch(full as FullBatch);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('404')) {
        setNotFound(value);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const shipmentEntries: ShipmentBatchEntry[] = batch?.shipmentBatch ?? [];
  const qcChronological = [...(batch?.qcRecords ?? [])].reverse();

  return (
    <>
      <PageHeader title="Supply-chain Trace" />

      <div style={{ padding: 26, display: 'grid', gap: 18, maxWidth: 720 }}>
        <div style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTrace();
              }}
              placeholder="QR payload or lot number"
              style={{
                flex: 1,
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                padding: '7px 10px',
                font: `400 13px/1.4 ${FONT}`,
                color: C.ink,
                background: C.surface,
              }}
            />
            <Button variant="primary" onClick={handleTrace} disabled={loading || !query.trim()}>
              Trace
            </Button>
          </div>
          <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 6 }}>
            Scan or type a QR payload, or enter a lot number.
          </div>
        </div>

        {error && (
          <Card style={{ padding: 16, borderColor: '#E4C7C4', background: C.redTint }}>
            <div style={{ font: `600 12px/1.4 ${FONT}`, color: C.red }}>Cannot reach vayu-api</div>
            <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted, marginTop: 5 }}>{error}</div>
          </Card>
        )}

        {notFound && (
          <Card>
            <Empty>No batch matching &quot;{notFound}&quot;.</Empty>
          </Card>
        )}

        {batch && (
          <>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ font: `600 14px/1.3 ${MONO}`, color: C.ink }}>{batch.lotNumber}</div>
                <Pill label={batch.status} />
              </div>
              <div style={{ font: `400 13px/1.6 ${FONT}`, color: C.inkMuted, marginTop: 6 }}>
                {batch.drug?.name ?? 'Unknown drug'}
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost }}>
                    Quantity
                  </div>
                  <div style={{ font: `500 13px/1.6 ${MONO}`, color: C.ink }}>
                    {batch.quantity.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost }}>
                    Expiry
                  </div>
                  <div style={{ font: `500 13px/1.6 ${MONO}`, color: C.ink }}>
                    {new Date(batch.expiryDate).toLocaleDateString('en-GB')}
                  </div>
                </div>
                {batch.drug?.coldChain && (
                  <div>
                    <div style={{ font: `600 10px/1 ${FONT}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkGhost }}>
                      Cold-chain band
                    </div>
                    <div style={{ font: `500 13px/1.6 ${MONO}`, color: C.accent }}>
                      {batch.drug?.minTempC}–{batch.drug?.maxTempC} °C
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <TimelineStep
                  color={C.ink}
                  title="Manufactured"
                  meta={new Date(batch.mfgDate).toLocaleDateString('en-GB')}
                  isLast={!(qcChronological.length || shipmentEntries.length)}
                />
                {qcChronological.map((qc, i) => (
                  <TimelineStep
                    key={qc.id}
                    color={qc.result === 'FAIL' ? C.red : C.ink}
                    title={`QC ${qc.result}`}
                    meta={`${qc.inspector ?? 'Unknown inspector'} · ${new Date(qc.testedAt).toLocaleString('en-GB')}`}
                    isLast={i === qcChronological.length - 1 && shipmentEntries.length === 0}
                  />
                ))}
                {shipmentEntries.map((entry, i) => (
                  <TimelineStep
                    key={entry.shipmentId}
                    color={C.ink}
                    title={`Shipment ${entry.shipment.status}`}
                    meta={
                      entry.shipment.deliveredAt
                        ? `delivered ${new Date(entry.shipment.deliveredAt).toLocaleString('en-GB')}`
                        : entry.shipment.dispatchedAt
                          ? `dispatched ${new Date(entry.shipment.dispatchedAt).toLocaleString('en-GB')}`
                          : entry.shipmentId
                    }
                    isLast={i === shipmentEntries.length - 1}
                  />
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function TimelineStep({
  color,
  title,
  meta,
  isLast,
}: {
  color: string;
  title: string;
  meta: string;
  isLast?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 9 }}>
        <div style={{ width: 9, height: 9, background: color, flexShrink: 0 }} />
        {!isLast && <div style={{ width: 1, flex: 1, background: C.border, minHeight: 24 }} />}
      </div>
      <div style={{ paddingBottom: 18 }}>
        <div style={{ font: `600 12px/1.4 ${FONT}`, color: C.ink }}>{title}</div>
        <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 2 }}>{meta}</div>
      </div>
    </div>
  );
}
