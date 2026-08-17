'use client';

/**
 * Institution Reliability Panel — how institutions handle what the supplier
 * ships.
 *
 * Like /risk, this rides on the assistant endpoint rather than a bespoke
 * REST route: evidence.data is the same structured array the model narrates
 * from, so the UI and the LLM answer are always looking at identical numbers.
 */

import { useEffect, useState } from 'react';

import { askAssistant } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, PageHeader, Table, Td } from '../../components/ui';

interface ReliabilityRow {
  institution: string;
  district: string;
  complaints: number;
  shipments: number;
  ratePer100: number | null;
}

function rateColor(rate: number | null): string {
  if (rate == null) return C.inkMuted;
  if (rate >= 50) return C.red;
  if (rate >= 20) return C.amber;
  return C.inkMuted;
}

export default function ReliabilityPage() {
  const [rows, setRows] = useState<ReliabilityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await askAssistant('which institutions report the most damage');
        const data = res.evidence?.data;
        setRows(Array.isArray(data) ? (data as ReliabilityRow[]) : []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const withComplaints = rows?.filter((r) => r.complaints > 0).length ?? 0;
  const totalComplaints = rows?.reduce((sum, r) => sum + r.complaints, 0) ?? 0;
  const totalShipments = rows?.reduce((sum, r) => sum + r.shipments, 0) ?? 0;
  const worstRate = rows?.reduce<number | null>((max, r) => {
    if (r.ratePer100 == null) return max;
    return max == null || r.ratePer100 > max ? r.ratePer100 : max;
  }, null) ?? null;

  return (
    <>
      <PageHeader title="Institution Reliability Panel" subtitle="How institutions handle what the supplier ships" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkFaint }}>
          PS-SS04 asks for vendor activity tracking. We score accountability in both directions — this panel
          is the supplier&apos;s view of its institutions; the Supplier Scorecard in Dhanvantari is the reverse.
        </div>

        {error ? (
          <ApiError error={error} />
        ) : loading ? (
          <Card style={{ padding: 18 }}>
            <div style={{ font: `400 13px/1.5 ${FONT}`, color: C.inkFaint }}>Loading reliability data…</div>
          </Card>
        ) : !rows || rows.length === 0 ? (
          <Card>
            <Empty>No complaint activity recorded against any institution.</Empty>
          </Card>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Kpi label="Institutions with complaints" value={withComplaints} />
              <Kpi label="Total complaints" value={totalComplaints} />
              <Kpi
                label="Worst rate"
                value={worstRate == null ? '—' : worstRate.toFixed(1)}
                deltaColor={rateColor(worstRate)}
                note="per 100 shipments"
              />
              <Kpi label="Total shipments" value={totalShipments} />
            </div>

            <Card>
              <Table head={['Institution', 'District', 'Complaints', 'Shipments', 'Per 100']}>
                {rows.map((r, i) => (
                  <tr key={`${r.institution}-${i}`}>
                    <Td>
                      <div style={{ color: C.ink, fontWeight: 500 }}>{r.institution}</div>
                    </Td>
                    <Td>{r.district}</Td>
                    <Td>{r.complaints}</Td>
                    <Td>{r.shipments}</Td>
                    <Td>
                      <span style={{ font: `600 12px/1 ${MONO}`, color: rateColor(r.ratePer100) }}>
                        {r.ratePer100 == null ? '—' : r.ratePer100.toFixed(1)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
