/**
 * POS / dispensing — /api/pos
 *
 * ARCHITECTURE.md §4.3, §7.2 (V7 consumption.trend). Part 1.
 *
 * The dispensing ledger. Every dispense decrements inventory in the same
 * transaction, so stock on hand and the ledger cannot disagree — this feeds the
 * periodic consumption push to Vayu (§5.1).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const DispenseBody = z.object({
  drugId: z.string(),
  batchRef: z.string().optional(),
  qty: z.number().int().positive(),
  dispensedBy: z.string().optional(),
  patientRef: z.string().optional(),
});

const ListQuery = z.object({
  drugId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function posRoutes(app: FastifyInstance): Promise<void> {
  /** Record a dispense and decrement stock atomically. */
  app.post('/dispense', async (req, reply) => {
    const parsed = DispenseBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const d = parsed.data;

    const stock = await prisma.inventory.findFirst({
      where: { drugId: d.drugId, ...(d.batchRef ? { batchRef: d.batchRef } : {}) },
      orderBy: { expiryDate: 'asc' }, // FEFO — first expiring, first out
    });
    if (!stock) return reply.code(422).send({ error: 'no_stock_for_drug' });
    if (stock.qtyOnHand < d.qty) {
      return reply.code(422).send({ error: 'insufficient_stock', qtyOnHand: stock.qtyOnHand });
    }

    const result = await prisma.$transaction(async (tx) => {
      const dispense = await tx.dispense.create({
        data: {
          drugId: d.drugId,
          batchRef: d.batchRef ?? stock.batchRef,
          qty: d.qty,
          dispensedBy: d.dispensedBy,
          patientRef: d.patientRef,
        },
      });
      const updated = await tx.inventory.update({
        where: { id: stock.id },
        data: { qtyOnHand: { decrement: d.qty } },
      });
      return { dispense, updated };
    });

    req.log.info({ drugId: d.drugId, qty: d.qty, remaining: result.updated.qtyOnHand }, 'dispensed');
    return reply.code(201).send({
      ok: true,
      dispenseId: result.dispense.id,
      qtyOnHand: result.updated.qtyOnHand,
      lowStock: result.updated.qtyOnHand <= result.updated.reorderPoint,
    });
  });

  app.get('/dispenses', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { drugId, take, skip } = parsed.data;
    const where = drugId ? { drugId } : {};

    const [items, total] = await Promise.all([
      prisma.dispense.findMany({
        where,
        orderBy: { dispensedAt: 'desc' },
        take,
        skip,
        include: { drug: { select: { id: true, name: true } } },
      }),
      prisma.dispense.count({ where }),
    ]);

    return { items, total, take, skip };
  });

  /** V7 — consumption by drug for a period, with the month-on-month delta. */
  app.get('/consumption', async (req) => {
    const months = Number((req.query as { months?: string }).months ?? 2);
    const since = new Date(Date.now() - months * 30 * 86_400_000);

    const rows = await prisma.dispense.findMany({
      where: { dispensedAt: { gte: since } },
      include: { drug: { select: { id: true, name: true } } },
    });

    const mid = new Date(Date.now() - (months / 2) * 30 * 86_400_000);
    const totals = new Map<string, { drug: string; recent: number; prior: number }>();
    for (const r of rows) {
      const cur = totals.get(r.drugId) ?? { drug: r.drug.name, recent: 0, prior: 0 };
      if (r.dispensedAt >= mid) cur.recent += r.qty;
      else cur.prior += r.qty;
      totals.set(r.drugId, cur);
    }

    const items = [...totals.entries()]
      .map(([drugId, v]) => ({
        drugId,
        drug: v.drug,
        dispensed: v.recent,
        prior: v.prior,
        deltaPct: v.prior > 0 ? Number((((v.recent - v.prior) / v.prior) * 100).toFixed(1)) : null,
      }))
      .sort((a, b) => b.dispensed - a.dispensed);

    return { windowMonths: months, items };
  });
}
