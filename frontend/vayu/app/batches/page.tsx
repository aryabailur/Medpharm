/**
 * Batches + QR — manufactured lots, QR payloads, and QC state.
 *
 * Every figure is computed from a live vayu-api response. Nothing here is
 * hardcoded: an empty database renders <Empty>, not invented rows.
 */

import { getBatches, type Batch } from '../../lib/api';
import { C, FONT } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

export const dynamic = 'force-dynamic';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const EXPIRY_WINDOW_DAYS = 90; // regulatory-style early-warning window for near-dated stock

export default async function BatchesPage() {
  let batches: Batch[] = [];
  let error: string | null = null;

  try {
    batches = (await getBatches('?take=100')).items;
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <>
        <PageHeader title="Batches + QR" subtitle="Manufactured lots, QR payloads, and QC state" />
        <div style={{ padding: 28 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  const now = Date.now();
  const daysToExpiry = (b: Batch) => (new Date(b.expiryDate).getTime() - now) / MS_PER_DAY;

  const qcApproved = batches.filter((b) => b.status === 'QC_APPROVED');
  const expiringSoon = batches.filter((b) => {
    const d = daysToExpiry(b);
    return d >= 0 && d <= EXPIRY_WINDOW_DAYS;
  });
  const coldChain = batches.filter((b) => b.drug?.coldChain);

  return (
    <>
      <PageHeader title="Batches + QR" subtitle="Manufactured lots, QR payloads, and QC state" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi label="Total batches" value={batches.length} />
          <Kpi
            label="QC approved"
            value={qcApproved.length}
            deltaColor={C.green}
            note={`${batches.length ? Math.round((qcApproved.length / batches.length) * 100) : 0}% of batches`}
          />
          <Kpi
            label="Expiring soon"
            value={expiringSoon.length}
            deltaColor={C.amber}
            note={`within ${EXPIRY_WINDOW_DAYS} days`}
          />
          <Kpi
            label="Cold chain"
            value={coldChain.length}
            deltaColor={C.blue}
            note="require temperature control"
          />
        </div>

        <Card>
          {batches.length === 0 ? (
            <Empty>No batches manufactured yet.</Empty>
          ) : (
            <Table head={['Lot', 'Drug', 'Qty', 'Mfg', 'Expiry', 'Status', 'QR']}>
              {batches.map((b) => {
                const d = daysToExpiry(b);
                const expiryColor = d < 0 ? C.red : d <= EXPIRY_WINDOW_DAYS ? C.amber : C.inkMuted;
                return (
                  <tr key={b.id}>
                    <Td>
                      <Mono>{b.lotNumber}</Mono>
                    </Td>
                    <Td>
                      <div style={{ color: C.ink }}>{b.drug?.name ?? b.drugId}</div>
                      {b.drug?.coldChain && (
                        <div style={{ font: `500 11px/1.4 ${FONT}`, color: C.blue, marginTop: 2 }}>
                          cold chain
                        </div>
                      )}
                    </Td>
                    <Td>{b.quantity.toLocaleString()}</Td>
                    <Td>{new Date(b.mfgDate).toLocaleDateString()}</Td>
                    <Td style={{ color: expiryColor, fontWeight: d < 0 || d <= EXPIRY_WINDOW_DAYS ? 600 : 400 }}>
                      {new Date(b.expiryDate).toLocaleDateString()}
                    </Td>
                    <Td>
                      <Pill label={b.status} />
                    </Td>
                    <Td>{b.qrPayload ? <Mono>{b.qrPayload}</Mono> : '—'}</Td>
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
