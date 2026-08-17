'use client';

/**
 * POS / Dispensing — counter dispense form + recent dispense ledger.
 *
 * Confirm-before-commit: typing a quantity only stages a proposal. Nothing
 * is written to inventory until "Confirm & dispense" actually fires the
 * existing `dispense` mutation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { dispense, getDispenses, getInventory, type Dispense, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { ApiError, Card, CardTitle, Empty, Mono, PageHeader } from '../../components/ui';

const LABEL_SM = {
  font: `600 11px/1 ${FONT}`,
  letterSpacing: '.17em',
  textTransform: 'uppercase' as const,
  color: C.inkFaint,
};

function friendlyError(msg: string): string {
  if (msg.includes('insufficient_stock')) return 'Insufficient stock for this quantity.';
  if (msg.includes('no_stock_for_drug')) return 'No stock on hand for this drug.';
  return msg;
}

export default function Pos() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [drugId, setDrugId] = useState('');
  const [qty, setQty] = useState('1');
  const [patientRef, setPatientRef] = useState('');
  const [editingQty, setEditingQty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ qtyOnHand: number; lowStock: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [inv, disp] = await Promise.all([getInventory('?take=300'), getDispenses('?take=50')]);
      setInventory(inv.items);
      setDispenses(disp.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!drugId && inventory.length > 0) setDrugId(inventory[0].drugId);
  }, [inventory, drugId]);

  const selected = useMemo(() => inventory.find((r) => r.drugId === drugId), [inventory, drugId]);

  // Confirm-before-commit: this only stages the write. The proposed quantity
  // does not touch inventory until handleConfirm actually runs `dispense`.
  const handleConfirm = async () => {
    setFormError(null);
    setConfirmation(null);
    const qtyNum = Number(qty);
    if (!drugId || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      setFormError('Choose a drug and a quantity greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await dispense({
        drugId,
        qty: qtyNum,
        batchRef: selected?.batchRef ?? undefined,
        patientRef: patientRef || undefined,
      });
      setConfirmation({ qtyOnHand: res.qtyOnHand, lowStock: res.lowStock });
      setQty('1');
      setPatientRef('');
      setEditingQty(false);
      await load();
    } catch (e) {
      setFormError(friendlyError((e as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = new Date().toDateString();
  const todaysDispenses = useMemo(
    () => dispenses.filter((d) => new Date(d.dispensedAt).toDateString() === todayStr),
    [dispenses, todayStr],
  );
  const dispensedTodayQty = todaysDispenses.reduce((sum, d) => sum + d.qty, 0);

  return (
    <>
      <PageHeader title="POS / Dispensing" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.85fr) minmax(0,1.15fr)', gap: 24, padding: '26px 26px 52px' }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: rise(0) }}>
          <CardTitle right={<span style={{ font: `400 11px/1 ${MONO}`, color: C.inkSoft }}>counter C-2</span>}>
            Dispense
          </CardTitle>
          <div style={{ padding: 20 }}>
            <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint }}>
              Scan or search. Quantity is a proposal until confirmed.
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={LABEL_SM}>Drug</div>
              {inventory.length === 0 ? (
                <div
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '11px 12px',
                    marginTop: 7,
                    font: `400 13px/1.5 ${FONT}`,
                    color: C.inkGhost,
                  }}
                >
                  No inventory loaded
                </div>
              ) : (
                <select
                  value={drugId}
                  onChange={(e) => {
                    setDrugId(e.target.value);
                    setConfirmation(null);
                  }}
                  style={{
                    width: '100%',
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '11px 12px',
                    marginTop: 7,
                    font: `500 13px/1 ${FONT}`,
                    color: C.ink,
                    background: C.surface,
                  }}
                >
                  {inventory.map((r) => (
                    <option key={r.id} value={r.drugId}>
                      {r.drug.name} ({r.qtyOnHand} on hand)
                    </option>
                  ))}
                </select>
              )}
              {selected && (
                <div
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '11px 12px',
                    marginTop: 7,
                    display: 'flex',
                    justifyContent: 'space-between',
                    font: `500 13px/1 ${FONT}`,
                  }}
                >
                  {selected.drug.name}
                  <span style={{ font: `400 12px/1 ${MONO}`, color: C.inkFaint }}>{selected.batchRef ?? '—'}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <div style={LABEL_SM}>Quantity</div>
                {editingQty ? (
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onBlur={() => setEditingQty(false)}
                    style={{
                      width: '100%',
                      border: `1px solid ${C.ink}`,
                      borderRadius: 4,
                      padding: '11px 12px',
                      marginTop: 7,
                      font: `600 19px/1 ${MONO}`,
                      color: C.ink,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      border: `1px solid ${C.ink}`,
                      borderRadius: 4,
                      padding: '11px 12px',
                      marginTop: 7,
                      font: `600 19px/1 ${MONO}`,
                      color: C.ink,
                    }}
                  >
                    {qty}
                  </div>
                )}
              </div>
              <div>
                <div style={LABEL_SM}>Patient ref</div>
                <input
                  type="text"
                  value={patientRef}
                  onChange={(e) => setPatientRef(e.target.value)}
                  placeholder="OPD-1234"
                  style={{
                    width: '100%',
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '11px 12px',
                    marginTop: 7,
                    font: `400 14px/1 ${MONO}`,
                    color: C.inkMuted,
                  }}
                />
              </div>
            </div>

            <div
              style={{
                border: '1px dashed #E0CFA4',
                background: '#FFFCF4',
                borderRadius: 4,
                padding: 12,
                marginTop: 12,
                font: `400 12px/1.55 ${FONT}`,
                color: '#7A3B06',
              }}
            >
              Proposed quantity: <strong style={{ fontWeight: 600 }}>{qty}</strong>
              {selected ? ` of ${selected.drug.name}` : ''}. Confirm before it writes to inventory.
            </div>

            <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
              <button
                onClick={handleConfirm}
                disabled={submitting || !drugId}
                style={{
                  flex: 1,
                  border: 0,
                  background: submitting || !drugId ? C.inkGhost : C.ink,
                  color: C.bg,
                  font: `500 12px/1 ${FONT}`,
                  padding: 11,
                  borderRadius: 4,
                  cursor: submitting || !drugId ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Dispensing…' : 'Confirm & dispense'}
              </button>
              <button
                onClick={() => setEditingQty(true)}
                style={{
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  font: `500 12px/1 ${FONT}`,
                  color: C.ink,
                  padding: '11px 14px',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Edit qty
              </button>
            </div>

            {formError && <div style={{ font: `500 12px/1.5 ${FONT}`, color: C.red, marginTop: 10 }}>{formError}</div>}
            {confirmation && (
              <div style={{ font: `500 12px/1.5 ${FONT}`, color: C.green, marginTop: 10 }}>
                Dispensed. New qty on hand: <Mono color={C.green}>{confirmation.qtyOnHand}</Mono>
                {confirmation.lowStock && (
                  <div style={{ color: C.red, marginTop: 4 }}>Low stock — below reorder point.</div>
                )}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 12,
                borderTop: `1px solid ${C.borderSoft}`,
                marginTop: 14,
                paddingTop: 13,
              }}
            >
              <div>
                <div style={LABEL_SM}>Today</div>
                <div style={{ font: `600 21px/1 ${MONO}`, marginTop: 7 }}>{dispensedTodayQty}</div>
              </div>
              <div>
                <div style={LABEL_SM}>Counter</div>
                <div style={{ font: `600 21px/1 ${MONO}`, marginTop: 7 }}>C-2</div>
              </div>
              <div>
                <div style={LABEL_SM}>Queue</div>
                <div style={{ font: `600 21px/1 ${MONO}`, marginTop: 7 }}>{todaysDispenses.length}</div>
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ animation: rise(60), overflow: 'hidden' }}>
          <CardTitle>Dispensing ledger</CardTitle>
          {dispenses.length === 0 ? (
            <Empty>No dispenses recorded yet.</Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                <thead>
                  <tr>
                    {['Time', 'Drug', 'Batch', 'Qty', 'By'].map((h, i) => (
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
                  {dispenses.slice(0, 50).map((d) => (
                    <tr key={d.id}>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `400 13px/1.5 ${MONO}`,
                          color: C.inkMuted,
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        {new Date(d.dispensedAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `400 14px/1.6 ${FONT}`,
                          color: C.ink,
                          fontWeight: 500,
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        {d.drug?.name ?? d.drugId}
                      </td>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `500 13px/1.5 ${MONO}`,
                          color: C.inkFaint,
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        {d.batchRef ?? '—'}
                      </td>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `500 14px/1.4 ${MONO}`,
                          color: C.ink,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        {d.qty}
                      </td>
                      <td
                        style={{
                          padding: '15px 18px',
                          font: `400 14px/1.6 ${FONT}`,
                          color: C.inkMuted,
                          borderBottom: `1px solid ${C.borderSoft}`,
                          verticalAlign: 'top',
                        }}
                      >
                        {d.dispensedBy ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
