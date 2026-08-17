'use client';

/**
 * POS / Dispensing — counter dispense form + recent dispense ledger.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { dispense, getDispenses, getInventory, type Dispense, type InventoryRow } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, Empty, Kpi, KpiBand, Mono, PageHeader, Table, Td } from '../../components/ui';

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

  const handleDispense = async () => {
    setFormError(null);
    setConfirmation(null);
    const qtyNum = Number(qty);
    if (!drugId || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      setFormError('Choose a drug and a quantity greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await dispense({ drugId, qty: qtyNum, patientRef: patientRef || undefined });
      setConfirmation({ qtyOnHand: res.qtyOnHand, lowStock: res.lowStock });
      setQty('1');
      setPatientRef('');
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
  const distinctDrugsToday = new Set(todaysDispenses.map((d) => d.drugId)).size;
  const topDrugToday = useMemo(() => {
    const byDrug = new Map<string, { name: string; qty: number }>();
    for (const d of todaysDispenses) {
      const name = d.drug?.name ?? d.drugId;
      const cur = byDrug.get(d.drugId) ?? { name, qty: 0 };
      cur.qty += d.qty;
      byDrug.set(d.drugId, cur);
    }
    let top: { name: string; qty: number } | null = null;
    for (const v of byDrug.values()) {
      if (!top || v.qty > top.qty) top = v;
    }
    return top;
  }, [todaysDispenses]);

  return (
    <>
      <PageHeader title="POS / Dispensing" />

      <KpiBand columns={4}>
        <Kpi label="Dispensed today" value={dispensedTodayQty} />
        <Kpi label="Lines dispensed today" value={todaysDispenses.length} />
        <Kpi label="Distinct drugs today" value={distinctDrugsToday} />
        <Kpi label="Top drug today" value={topDrugToday ? topDrugToday.qty : '—'} note={topDrugToday?.name} />
      </KpiBand>

      <div style={{ padding: 26, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 24 }}>
        {error && <ApiError error={error} />}

        <Card style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <CardTitle>Dispense</CardTitle>
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkFaint }}>
                Drug
              </span>
              <select
                value={drugId}
                onChange={(e) => setDrugId(e.target.value)}
                style={{
                  padding: '8px 10px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  font: `400 13px/1.4 ${FONT}`,
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
            </label>

            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkFaint }}>
                Quantity
              </span>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={{
                  padding: '8px 10px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  font: `400 13px/1.4 ${FONT}`,
                  color: C.ink,
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkFaint }}>
                Patient reference (optional)
              </span>
              <input
                type="text"
                value={patientRef}
                onChange={(e) => setPatientRef(e.target.value)}
                placeholder="OPD-1234"
                style={{
                  padding: '8px 10px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  font: `400 13px/1.4 ${FONT}`,
                  color: C.ink,
                }}
              />
            </label>

            <Button onClick={handleDispense} disabled={submitting || !drugId}>
              {submitting ? 'Dispensing…' : 'Dispense'}
            </Button>

            {formError && <div style={{ font: `500 12px/1.5 ${FONT}`, color: C.red }}>{formError}</div>}
            {confirmation && (
              <div style={{ font: `500 12px/1.5 ${FONT}`, color: C.green }}>
                Dispensed. New qty on hand: <Mono color={C.green}>{confirmation.qtyOnHand}</Mono>
                {confirmation.lowStock && (
                  <div style={{ color: C.red, marginTop: 4 }}>Low stock — below reorder point.</div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Recent dispenses</CardTitle>
          {dispenses.length === 0 ? (
            <Empty>No dispenses recorded yet.</Empty>
          ) : (
            <Table head={['Time', 'Drug', 'Qty', 'By']}>
              {dispenses.slice(0, 50).map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Mono>
                      {new Date(d.dispensedAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Mono>
                  </Td>
                  <Td>{d.drug?.name ?? d.drugId}</Td>
                  <Td>
                    <Mono>{d.qty}</Mono>
                  </Td>
                  <Td>{d.dispensedBy ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
