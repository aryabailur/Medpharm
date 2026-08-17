/**
 * Cold-chain Excursions — hysteresis-detected breaches, severity-classified.
 *
 * There is no /api/excursions list endpoint, so we fetch shipments and only
 * ask the detail endpoint for the ones that actually recorded an excursion
 * (excursionCount > 0), then flatten each shipment's `excursions` array. This
 * keeps the request count proportional to affected shipments, not the whole
 * fleet.
 */

import { getShipment, getShipments, type Excursion, type Shipment } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Card, Empty, Kpi, Mono, PageHeader, Pill, Table, Td } from '../../components/ui';

export const dynamic = 'force-dynamic';

interface Row extends Excursion {
  shipment: Shipment;
}

export default async function ExcursionsPage() {
  let rows: Row[] = [];
  let error: string | null = null;

  try {
    const s = await getShipments('?take=100');
    const withExcursions = s.items.filter((sh) => sh.excursionCount > 0);
    const details = await Promise.all(withExcursions.map((sh) => getShipment(sh.id)));
    rows = details.flatMap((d) => d.excursions.map((ex) => ({ ...ex, shipment: d as unknown as Shipment })));
    rows.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <>
        <PageHeader title="Cold-chain Excursions" subtitle="Hysteresis-detected breaches, severity-classified" />
        <div style={{ padding: 28 }}>
          <ApiError error={error} />
        </div>
      </>
    );
  }

  const critical = rows.filter((r) => r.severity === 'CRITICAL').length;
  const major = rows.filter((r) => r.severity === 'MAJOR').length;
  const open = rows.filter((r) => r.endedAt == null).length;

  return (
    <>
      <PageHeader title="Cold-chain Excursions" subtitle="Hysteresis-detected breaches, severity-classified" />

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkFaint, marginTop: -6 }}>
          Fires only after 3 consecutive out-of-band readings or 60 seconds — a single stray reading is
          sensor noise, not a spoiled vaccine.
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi label="Total excursions" value={rows.length} />
          <Kpi label="Critical" value={critical} deltaColor={C.red} />
          <Kpi label="Major" value={major} deltaColor={C.amber} />
          <Kpi label="Still open" value={open} deltaColor={open ? C.red : C.green} note={open ? 'requires review' : 'All resolved'} />
        </div>

        <Card>
          {rows.length === 0 ? (
            <Empty>No excursions on record.</Empty>
          ) : (
            <Table head={['Shipment', 'Severity', 'Duration', 'Min °C', 'Max °C', 'Started', 'State']}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Mono>{r.shipment.id.slice(0, 8)}</Mono>
                  </Td>
                  <Td>
                    <Pill label={r.severity} />
                  </Td>
                  <Td>{r.durationMin != null ? `${r.durationMin} min` : '—'}</Td>
                  <Td style={{ color: r.minTempC != null && r.minTempC < 2 ? C.blue : C.inkMuted, fontWeight: r.minTempC != null && r.minTempC < 2 ? 600 : 400 }}>
                    {r.minTempC != null ? r.minTempC.toFixed(1) : '—'}
                  </Td>
                  <Td style={{ color: r.maxTempC != null && r.maxTempC > 8 ? C.red : C.inkMuted, fontWeight: r.maxTempC != null && r.maxTempC > 8 ? 600 : 400 }}>
                    {r.maxTempC != null ? r.maxTempC.toFixed(1) : '—'}
                  </Td>
                  <Td>{new Date(r.startedAt).toLocaleString()}</Td>
                  <Td>
                    <Pill label={r.endedAt == null ? 'OPEN' : 'CLOSED'} />
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
