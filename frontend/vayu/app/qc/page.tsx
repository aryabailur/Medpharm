/**
 * QC Records — inspection outcomes per manufactured lot.
 *
 * There is no dedicated /api/qc endpoint. We read the nested `qcRecords`
 * array on each batch from /api/batches. If a batch has no `qcRecords` field
 * at all (the list endpoint may omit it), we treat that lot as "awaiting QC"
 * rather than assuming failure.
 */

import { getBatches, type Batch, type QCRecord } from '../../lib/api';
import { C, FONT } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

export const dynamic = 'force-dynamic';

/** Most recent QC record for a batch, or null if none / awaiting. */
function latestRecord(b: Batch): QCRecord | null {
  if (!b.qcRecords || b.qcRecords.length === 0) return null;
  return [...b.qcRecords].sort(
    (a, c) => new Date(c.testedAt).getTime() - new Date(a.testedAt).getTime(),
  )[0];
}

export default async function QcPage() {
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
        <PageHeader title="QC Records" subtitle="Inspection outcomes per manufactured lot" />
        <div style={{ padding: 28 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  const withRecord = batches.map((b) => ({ batch: b, rec: latestRecord(b) }));
  const passed = withRecord.filter((r) => r.rec?.result === 'PASS');
  const failed = withRecord.filter((r) => r.rec?.result === 'FAIL');
  const awaiting = withRecord.filter((r) => !r.rec);

  // Sort so awaiting/failed surface first — the rows that need attention.
  const rank = (result: 'PASS' | 'FAIL' | 'AWAITING') =>
    result === 'AWAITING' ? 0 : result === 'FAIL' ? 1 : 2;
  const sorted = [...withRecord].sort(
    (a, b) => rank(a.rec?.result ?? 'AWAITING') - rank(b.rec?.result ?? 'AWAITING'),
  );

  return (
    <>
      <PageHeader title="QC Records" subtitle="Inspection outcomes per manufactured lot" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi label="Total batches" value={batches.length} />
          <Kpi label="Passed" value={passed.length} deltaColor={C.green} />
          <Kpi label="Failed" value={failed.length} deltaColor={C.red} />
          <Kpi label="Awaiting QC" value={awaiting.length} deltaColor={C.amber} />
        </div>

        <Card>
          {sorted.length === 0 ? (
            <Empty>No batches to inspect yet.</Empty>
          ) : (
            <Table head={['Lot', 'Drug', 'Result', 'Inspector', 'Tested', 'Notes']}>
              {sorted.map(({ batch: b, rec }) => (
                <tr key={b.id}>
                  <Td>
                    <Mono>{b.lotNumber}</Mono>
                  </Td>
                  <Td>{b.drug?.name ?? b.drugId}</Td>
                  <Td>
                    <Pill label={rec ? rec.result : 'AWAITING'} />
                  </Td>
                  <Td>{rec?.inspector ?? '—'}</Td>
                  <Td>{rec ? new Date(rec.testedAt).toLocaleDateString() : '—'}</Td>
                  <Td style={{ color: C.inkFaint }}>
                    {rec?.notes ?? (rec ? '' : 'No QC record filed yet')}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
