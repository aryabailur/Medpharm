'use client';

/**
 * Dispatch — consignments from warehouse to institution.
 */

import { useCallback, useEffect, useState } from 'react';

import { getShipment, getShipments, type Batch, type Drug, type Shipment } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { ApiError, Card, Empty, Pill } from '../../components/ui';

/** getShipment's detail response nests full batch + drug rows, not the list-view pick. */
type FullShipmentBatch = { batch: Batch & { drug?: Drug } };
type FullShipment = Shipment & { batches?: FullShipmentBatch[] };

export default function Dispatch() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<FullShipment | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getShipments('?take=100');
      setShipments(res.items);
      setError(null);
      if (!selectedId && res.items.length > 0) setSelectedId(res.items[0]!.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    (async () => {
      try {
        const full = await getShipment(selectedId);
        setSelected(full as unknown as FullShipment);
      } catch {
        setSelected(null);
      }
    })();
  }, [selectedId]);

  const coldChainBatch = selected?.batches?.find((b) => b.batch.drug?.coldChain);
  const setpoint = coldChainBatch?.batch.drug
    ? `${coldChainBatch.batch.drug.minTempC}–${coldChainBatch.batch.drug.maxTempC}°C`
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, padding: '26px 26px 52px' }}>
      {/* LEFT — Dispatch */}
      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, overflowX: 'auto', animation: rise(0) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
            Dispatch
          </span>
          <div style={{ flex: 1 }} />
          <button
            style={{ border: 0, background: C.ink, color: C.bg, font: `500 12px/1 ${FONT}`, padding: '8px 13px', borderRadius: 4, cursor: 'pointer' }}
          >
            New dispatch
          </button>
        </div>

        {error && (
          <div style={{ padding: 16 }}>
            <ApiError error={error} />
          </div>
        )}

        {shipments.length === 0 ? (
          <Empty>No shipments on record.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
            <thead>
              <tr>
                {['Shipment', 'Destination', 'Manifest', 'Vehicle', 'Status'].map((h) => (
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
              {shipments.map((s) => {
                const manifestCount = s._count?.batches ?? 0;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    style={{ cursor: 'pointer', background: selectedId === s.id ? C.surfaceAlt : 'transparent' }}
                  >
                    <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                      <span style={{ font: `500 12px/1 ${MONO}`, color: C.ink, borderBottom: `1px dotted ${C.inkGhost}` }}>
                        {s.id.slice(0, 8)}
                      </span>
                      <div style={{ font: `400 11px/1.3 ${MONO}`, color: C.inkSoft, marginTop: 5 }}>{s.supplyOrderId.slice(0, 8)}</div>
                    </td>
                    <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 14px/1.6 ${FONT}`, color: C.ink, verticalAlign: 'top' }}>
                      {s.supplyOrder?.institution?.name ?? 'Unknown institution'}
                    </td>
                    <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 14px/1.6 ${FONT}`, color: C.inkMuted, verticalAlign: 'top' }}>
                      {manifestCount} batch{manifestCount === 1 ? '' : 'es'}
                    </td>
                    <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, font: `400 13px/1.5 ${MONO}`, color: C.inkMuted, verticalAlign: 'top' }}>
                      {s.coldChain ? 'reefer' : 'ambient'}
                    </td>
                    <td style={{ padding: '15px 18px', borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }}>
                      <Pill label={s.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* RIGHT — Manifest */}
      <aside style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, alignSelf: 'start', animation: rise(60) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 18px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
            Manifest · {selected ? selected.id.slice(0, 8) : '—'}
          </span>
        </div>
        {!selected ? (
          <Empty>Select a shipment to see its manifest.</Empty>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint }}>
              {selected.supplyOrder?.institution?.district ?? 'Unknown route'} · {selected.coldChain ? `cold chain ${setpoint ?? ''}` : 'ambient'}
            </div>

            {(selected.batches ?? []).length === 0 ? (
              <Empty>No batches loaded on this manifest.</Empty>
            ) : (
              (selected.batches ?? []).map(({ batch }) => (
                <div key={batch.id} style={{ borderTop: `1px solid ${C.borderSoft}`, padding: '11px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ font: `500 13px/1.5 ${FONT}`, color: C.ink }}>{batch.drug?.name ?? 'Unknown drug'}</span>
                    <span style={{ font: `600 13px/1 ${MONO}`, color: C.ink }}>{batch.quantity.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.inkFaint, marginTop: 5 }}>
                    lot {batch.lotNumber} · exp {new Date(batch.expiryDate).toLocaleDateString('en-GB')}
                  </div>
                </div>
              ))
            )}

            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 12 }}>
              <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.17em', textTransform: 'uppercase', color: C.inkFaint }}>
                Vehicle &amp; route
              </div>
              <div style={{ font: `400 12px/1.7 ${MONO}`, color: C.inkMuted, marginTop: 8 }}>
                {selected.coldChain ? `Reefer, setpoint ${setpoint ?? '2–8°C'}` : 'Ambient transport'}
                <br />
                {selected.dispatchedAt ? `Departed ${new Date(selected.dispatchedAt).toLocaleString('en-GB')}` : 'Not yet dispatched'}
                <br />
                {selected.etaAt ? `ETA ${new Date(selected.etaAt).toLocaleString('en-GB')}` : 'ETA pending'}
              </div>
            </div>

            <button
              style={{ border: `1px solid ${C.border}`, background: C.surface, font: `500 12px/1 ${FONT}`, color: C.ink, padding: 10, borderRadius: 4, cursor: 'pointer', width: '100%', marginTop: 12 }}
            >
              Print QR manifest
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
