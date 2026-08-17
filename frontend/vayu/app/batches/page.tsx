/**
 * Batches + QC — manufactured lots, QR payloads, inspection state.
 */

import { getBatches, type Batch } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

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
      <>
        <PageHeader title="Batches + QC" subtitle="Manufactured lots, QR payloads, inspection state" />
        <div style={{ padding: 28 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  const now = Date.now();
  const qcApproved = batches.filter((b) => b.status === 'QC_APPROVED');
  const expiringSoon = batches.filter((b) => {
    const days = (new Date(b.expiryDate).getTime() - now) / DAY_MS;
    return days >= 0 && days <= 90;
  });
  const coldChain = batches.filter((b) => b.drug?.coldChain);

  return (
    <>
      <PageHeader title="Batches + QC" subtitle="Manufactured lots, QR payloads, inspection state" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi label="Total batches" value={batches.length} />
          <Kpi label="QC approved" value={qcApproved.length} deltaColor={C.green} />
          <Kpi
            label="Expiring ≤90d"
            value={expiringSoon.length}
            deltaColor={expiringSoon.length ? C.amber : C.grey}
          />
          <Kpi label="Cold chain" value={coldChain.length} deltaColor={C.accent} />
        </div>

        <Card>
          {batches.length === 0 ? (
            <Empty>No batches on record.</Empty>
          ) : (
            <Table head={['Lot', 'Drug', 'Qty', 'Mfg', 'Expiry', 'QC', 'Status', 'QR']}>
              {batches.map((b) => {
                const expiryTime = new Date(b.expiryDate).getTime();
                const daysToExpiry = (expiryTime - now) / DAY_MS;
                const expiryColor =
                  daysToExpiry < 0 ? C.red : daysToExpiry <= 90 ? C.amber : C.inkMuted;
                const latestQc = b.qcRecords && b.qcRecords.length > 0 ? b.qcRecords[0] : null;
                const qr = b.qrPayload ? (b.qrPayload.length > 18 ? `${b.qrPayload.slice(0, 18)}…` : b.qrPayload) : '—';

                return (
                  <tr key={b.id}>
                    <Td>
                      <Mono>{b.lotNumber}</Mono>
                    </Td>
                    <Td>
                      {b.drug?.name ?? '—'}
                      {b.drug?.coldChain && (
                        <div style={{ font: `600 10px/1.4 ${FONT}`, color: C.accent, marginTop: 2 }}>
                          cold chain
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Mono>{b.quantity.toLocaleString('en-IN')}</Mono>
                    </Td>
                    <Td>{new Date(b.mfgDate).toLocaleDateString('en-GB')}</Td>
                    <Td style={{ color: expiryColor, fontWeight: daysToExpiry <= 90 ? 600 : 400 }}>
                      {new Date(b.expiryDate).toLocaleDateString('en-GB')}
                    </Td>
                    <Td>{latestQc ? <Pill label={latestQc.result} /> : <Pill label="AWAITING" />}</Td>
                    <Td>
                      <Pill label={b.status} />
                    </Td>
                    <Td>
                      <Mono color={C.inkGhost}>{qr}</Mono>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
