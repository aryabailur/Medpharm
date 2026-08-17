'use client';

/**
 * Batch Trace — full custody chain from manufacture to complaint.
 *
 * Client Component: the search box is interactive (QR payload or lot number
 * typed by hand), and the timeline is assembled from two chained calls
 * (resolveQr → getBatch) once the user submits.
 */

import { useState } from 'react';

import { getBatch, getComplaints, resolveQr, type Batch, type Complaint, type Drug } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, PageHeader, Pill } from '../../components/ui';

export default function TracePage() {
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState<Batch | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function trace() {
    const value = query.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setNotFound(null);
    setBatch(null);
    setComplaints([]);
    try {
      const resolved = await resolveQr(value);
      const full = await getBatch(resolved.batchId);
      setBatch(full);
      // No batchId filter on /api/complaints — match on lot number, the
      // one field the complaint queue actually carries back to a batch.
      const c = await getComplaints('?take=200');
      setComplaints(c.items.filter((item) => item.batch?.lotNumber === full.lotNumber));
    } catch (e) {
      // resolveQr 404s when nothing matches the QR payload / lot number.
      const msg = (e as Error).message;
      if (msg.includes('404')) {
        setNotFound(value);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  // GET /api/batches/:id includes the full drug record (route uses
  // `include: { drug: true }`), wider than the Pick<> used for list views.
  const drug = batch?.drug as Drug | undefined;

  const shipmentBatch = (batch as (Batch & { shipmentBatch?: Array<{
    id: string;
    shipment?: { id: string; status: string; dispatchedAt: string | null; deliveredAt: string | null };
  }> }) | null)?.shipmentBatch ?? [];

  return (
    <>
      <PageHeader title="Batch Trace" subtitle="Full custody chain from manufacture to complaint" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void trace();
              }}
              placeholder="QR payload or lot number"
              style={{
                flex: 1,
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                padding: '8px 11px',
                font: `400 13px/1.2 ${FONT}`,
                color: C.ink,
                background: C.surface,
              }}
            />
            <button
              onClick={() => void trace()}
              disabled={busy || !query.trim()}
              style={{
                padding: '7px 13px',
                borderRadius: 7,
                border: `1px solid ${C.steel}`,
                background: C.steel,
                color: '#FFF',
                font: `600 12px/1.2 ${FONT}`,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? '…' : 'Trace'}
            </button>
          </div>
          <div style={{ font: `400 11px/1.4 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>
            Scan or type a QR payload, or enter a lot number.
          </div>
        </Card>

        {error && <ApiError error={error} />}

        {notFound && (
          <Card>
            <Empty>
              No batch matching &quot;{notFound}&quot;.
            </Empty>
          </Card>
        )}

        {batch && (
          <>
            <Card style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ font: `600 15px/1.3 ${FONT}`, color: C.ink }}>{batch.drug?.name ?? batch.drugId}</div>
                  <div style={{ font: `400 12px/1.6 ${MONO}`, color: C.inkFaint, marginTop: 3 }}>
                    Lot {batch.lotNumber}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {drug?.coldChain && drug.minTempC != null && drug.maxTempC != null && (
                    <span style={{ font: `600 11px/1 ${MONO}`, color: C.blue }}>
                      {drug.minTempC}–{drug.maxTempC} °C
                    </span>
                  )}
                  <Pill label={batch.status} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 14, font: `400 12px/1.6 ${FONT}`, color: C.inkMuted }}>
                <div>
                  <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Quantity
                  </div>
                  {batch.quantity.toLocaleString()}
                </div>
                <div>
                  <div style={{ color: C.inkGhost, font: `600 10px/1.4 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Expiry
                  </div>
                  {new Date(batch.expiryDate).toLocaleDateString()}
                </div>
              </div>
            </Card>

            <Card>
              <CardTitle>Custody chain</CardTitle>
              <div style={{ padding: '16px 20px' }}>
                {/* Step 1: manufacture */}
                <TimelineStep
                  done
                  title="Manufactured"
                  meta={new Date(batch.mfgDate).toLocaleString()}
                  isLast={false}
                />

                {/* Step 2: QC records */}
                {(batch.qcRecords ?? []).map((qc) => (
                  <TimelineStep
                    key={qc.id}
                    done={qc.result !== 'FAIL'}
                    title={`QC ${qc.result}`}
                    meta={`${qc.inspector ?? 'Unknown inspector'} · ${new Date(qc.testedAt).toLocaleString()}`}
                    isLast={false}
                  />
                ))}

                {/* Step 3: shipments */}
                {shipmentBatch.map((sb) => (
                  <TimelineStep
                    key={sb.id}
                    done
                    title={`Shipment ${sb.shipment?.status ?? 'UNKNOWN'}`}
                    meta={
                      sb.shipment?.dispatchedAt
                        ? `Dispatched ${new Date(sb.shipment.dispatchedAt).toLocaleString()}`
                        : 'Not yet dispatched'
                    }
                    isLast={false}
                  />
                ))}

                {/* Step 4: complaints */}
                {complaints.map((c, i) => (
                  <TimelineStep
                    key={c.id}
                    done={false}
                    title={`Complaint: ${c.category}`}
                    meta={`${c.status} · filed ${new Date(c.filedAt).toLocaleString()}`}
                    isLast={i === complaints.length - 1}
                  />
                ))}

                {(batch.qcRecords ?? []).length === 0 && shipmentBatch.length === 0 && complaints.length === 0 && (
                  <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkGhost, paddingTop: 8 }}>
                    No further custody events recorded.
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function TimelineStep({
  done,
  title,
  meta,
  isLast,
}: {
  done: boolean;
  title: string;
  meta: string;
  isLast: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: done ? C.steel : C.red,
            flexShrink: 0,
            zIndex: 1,
          }}
        />
        {!isLast && (
          <div
            style={{
              width: 2,
              flex: 1,
              minHeight: 24,
              background: C.border,
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: 18 }}>
        <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.ink }}>{title}</div>
        <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: 2 }}>{meta}</div>
      </div>
    </div>
  );
}
