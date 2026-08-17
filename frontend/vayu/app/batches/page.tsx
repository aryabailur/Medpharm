/**
 * Batches + QC — manufactured lots, QR payloads, inspection state.
 */

import { getBatches, type Batch, type QCRecord } from '../../lib/api';
import { C, FONT, MONO, rise, stagger } from '../../lib/theme';
import { Card, Empty, Kpi, KpiBand, Pill } from '../../components/ui';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The dataset carries a certificate link on QCRecord that the narrow list-view type omits. */
type FullQc = QCRecord & { certificateUrl?: string | null };

export default async function Batches() {
  let batches: Batch[] = [];
  let error: string | null = null;

  try {
    const res = await getBatches('?take=100');
    batches = res.items;
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <div style={{ padding: 26 }}>
        <div style={{ font: `600 12px/1.4 ${FONT}`, color: C.red }}>Cannot reach vayu-api</div>
        <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted, marginTop: 5 }}>{error}</div>
      </div>
    );
  }

  const now = Date.now();

  const qcFlat: Array<{ batch: Batch; qc: FullQc }> = batches.flatMap((b) =>
    (b.qcRecords ?? []).map((qc) => ({ batch: b, qc: qc as FullQc })),
  );
  const passCount = qcFlat.filter((r) => r.qc.result === 'PASS').length;
  const failCount = qcFlat.filter((r) => r.qc.result === 'FAIL').length;
  const awaitingQc = batches.filter((b) => !b.qcRecords || b.qcRecords.length === 0);
  const passRate = qcFlat.length ? Math.round((passCount / qcFlat.length) * 100) : null;

  const turnarounds = qcFlat
    .map(({ batch, qc }) => (new Date(qc.testedAt).getTime() - new Date(batch.mfgDate).getTime()) / DAY_MS)
    .filter((d) => Number.isFinite(d) && d >= 0);
  const avgTurnaround = turnarounds.length
    ? (turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length).toFixed(1)
    : null;

  const failed30d = qcFlat.filter(
    (r) => r.qc.result === 'FAIL' && now - new Date(r.qc.testedAt).getTime() <= 30 * DAY_MS,
  ).length;

  const selected = batches[0] ?? null;
  const selectedQc = selected?.qcRecords?.[0] ?? null;

  const qcSplit = [
    { label: 'PASS', count: passCount, color: C.green },
    { label: 'PENDING', count: awaitingQc.length, color: C.blue },
    { label: 'FAIL', count: failCount, color: C.red },
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(0) }}>
          <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
            Pass rate 30d
          </div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: passRate != null && passRate >= 90 ? C.green : C.amber, marginTop: 12 }}>
            {passRate != null ? `${passRate}%` : '—'}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>{qcFlat.length} tested on record</div>
        </div>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(1) }}>
          <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
            Awaiting test
          </div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: C.blue, marginTop: 12 }}>
            {awaitingQc.length}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>of {batches.length} batches</div>
        </div>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${C.borderFaint}`, animation: stagger(2) }}>
          <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
            Failed 30d
          </div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: failed30d ? C.red : C.grey, marginTop: 12 }}>
            {failed30d}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>{failCount} failed on record</div>
        </div>
        <div style={{ padding: '24px 26px', animation: stagger(3) }}>
          <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
            Avg turnaround
          </div>
          <div style={{ font: `600 32px/1 ${MONO}`, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: C.ink, marginTop: 12 }}>
            {avgTurnaround != null ? `${avgTurnaround}d` : '—'}
          </div>
          <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 8 }}>mfg → test</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, padding: '26px 26px 52px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Batches table */}
          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, overflowX: 'auto', animation: rise(0) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                Batches · {batches.length} this quarter
              </span>
              <div style={{ flex: 1 }} />
              <button
                style={{ border: 0, background: C.ink, color: C.bg, font: `500 12px/1 ${FONT}`, padding: '8px 13px', borderRadius: 4, cursor: 'pointer' }}
              >
                New batch
              </button>
            </div>
            {batches.length === 0 ? (
              <Empty>No batches on record.</Empty>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                <thead>
                  <tr>
                    {['Batch', 'Drug', 'Mfg / Exp', 'Qty', 'Status'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 3 ? 'right' : 'left',
                          font: `600 11px/1 ${FONT}`,
                          letterSpacing: '.13em',
                          textTransform: 'uppercase',
                          color: C.inkSoft,
                          padding: '14px 18px',
                          borderBottom: `1px solid ${C.border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                        <span style={{ font: `500 12px/1 ${MONO}`, color: C.ink, borderBottom: `1px dotted ${C.inkGhost}` }}>
                          {b.id.slice(0, 8)}
                        </span>
                        <div style={{ font: `400 11px/1.3 ${MONO}`, color: C.inkSoft, marginTop: 5 }}>lot {b.lotNumber}</div>
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 14px/1.6 ${FONT}`, color: C.ink, verticalAlign: 'top' }}>
                        {b.drug?.name ?? '—'}
                        {b.drug?.coldChain && (
                          <div style={{ font: `600 9px/1 ${MONO}`, letterSpacing: '.08em', color: C.blue, marginTop: 5 }}>
                            COLD CHAIN 2–8°C
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 13px/1.5 ${MONO}`, color: C.inkMuted, verticalAlign: 'top' }}>
                        {new Date(b.mfgDate).toLocaleDateString('en-GB')}
                        <br />
                        {new Date(b.expiryDate).toLocaleDateString('en-GB')}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `500 14px/1.4 ${MONO}`, color: C.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>
                        {b.quantity.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                        <Pill label={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* QC records */}
          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, overflowX: 'auto', animation: rise(80) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                QC records
              </span>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {qcSplit.map((g) => (
                  <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, background: g.color, display: 'inline-block' }} />
                    <span style={{ font: `500 10px/1 ${MONO}`, color: C.inkMuted }}>
                      {g.label} {g.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {qcFlat.length === 0 ? (
              <Empty>No QC records on file.</Empty>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                <thead>
                  <tr>
                    {['Batch', 'Result', 'Inspector', 'Tested', 'Notes', 'Certificate'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          font: `600 11px/1 ${FONT}`,
                          letterSpacing: '.13em',
                          textTransform: 'uppercase',
                          color: C.inkSoft,
                          padding: '14px 18px',
                          borderBottom: `1px solid ${C.border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qcFlat.map(({ batch, qc }) => (
                    <tr key={qc.id}>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `500 13px/1.5 ${MONO}`, color: C.ink, verticalAlign: 'top' }}>
                        {batch.lotNumber}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                        <Pill label={qc.result} />
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 14px/1.6 ${FONT}`, color: C.ink, verticalAlign: 'top' }}>
                        {qc.inspector ?? '—'}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 13px/1.5 ${MONO}`, color: C.inkMuted, verticalAlign: 'top' }}>
                        {new Date(qc.testedAt).toLocaleDateString('en-GB')}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 14px/1.6 ${FONT}`, color: C.inkMuted, verticalAlign: 'top' }}>
                        {qc.notes ?? '—'}
                      </td>
                      <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 14px/1.6 ${FONT}`, color: C.ink, verticalAlign: 'top' }}>
                        {qc.certificateUrl ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Batch detail */}
        <aside style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, alignSelf: 'start', animation: rise(60) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
            <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
              Batch detail
            </span>
          </div>
          {!selected ? (
            <Empty>No batches on record.</Empty>
          ) : (
            <div style={{ padding: 20 }}>
              <div style={{ font: `600 21px/1 ${MONO}`, letterSpacing: '-.02em', color: C.ink }}>{selected.id.slice(0, 12)}</div>
              <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 6 }}>
                {selected.drug?.name ?? 'Unknown drug'} · lot {selected.lotNumber}
              </div>

              <div style={{ marginTop: 14, background: C.bg, border: `1px solid ${C.borderFaint}`, padding: 16, display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 128, height: 128, background: C.surface, border: `1px solid ${C.border}`, padding: 9 }}>
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background:
                        'repeating-linear-gradient(0deg,' +
                        C.ink +
                        ' 0 6px,transparent 6px 12px),repeating-linear-gradient(90deg,' +
                        C.ink +
                        ' 0 6px,transparent 6px 12px)',
                      opacity: 0.84,
                    }}
                  />
                </div>
              </div>

              <div style={{ font: `400 11px/1.6 ${MONO}`, color: C.inkFaint, marginTop: 12, wordBreak: 'break-all' }}>
                {selected.qrPayload ?? '—'}
              </div>

              {[
                { k: 'Status', v: selected.status },
                { k: 'Quantity', v: selected.quantity.toLocaleString('en-IN') },
                { k: 'Mfg date', v: new Date(selected.mfgDate).toLocaleDateString('en-GB') },
                { k: 'Expiry', v: new Date(selected.expiryDate).toLocaleDateString('en-GB') },
                { k: 'QC result', v: selectedQc ? selectedQc.result : 'AWAITING' },
              ].map((m) => (
                <div
                  key={m.k}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.borderSoft}`, font: `400 12px/1.4 ${FONT}` }}
                >
                  <span style={{ color: C.inkFaint }}>{m.k}</span>
                  <span style={{ fontWeight: 500, color: C.ink }}>{m.v}</span>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  style={{ border: 0, background: C.ink, color: C.bg, font: `500 12px/1 ${FONT}`, padding: '8px 13px', borderRadius: 4, cursor: 'pointer', flex: 1 }}
                >
                  Open trace
                </button>
                <button
                  style={{ border: `1px solid ${C.border}`, background: C.surface, font: `500 12px/1 ${FONT}`, color: C.ink, padding: '8px 12px', borderRadius: 4, cursor: 'pointer' }}
                >
                  Print labels
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
