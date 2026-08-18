/**
 * Inventory read APIs — GET /api/inventory
 *
 * ARCHITECTURE.md §4.3, §7.2 (V5 stock.level, V6 stock.expiring). Part 1.
 *
 * The core institution-side table. `Drug`, `Inventory` and `Dispense` are built
 * from scratch here — the v1 doc wrongly assumed an existing inventory/POS app.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const ListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  expiringInDays: z.coerce.number().int().min(1).max(3650).optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { q, lowStock, expiringInDays, take, skip } = parsed.data;

    const where = {
      ...(expiringInDays
        ? { expiryDate: { lte: new Date(Date.now() + expiringInDays * 86_400_000) } }
        : {}),
      ...(q
        ? {
            drug: {
              is: {
                OR: [
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { genericName: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        orderBy: { expiryDate: 'asc' },
        take,
        skip,
        include: { drug: true },
      }),
      prisma.inventory.count({ where }),
    ]);

    // Low stock is a comparison between two columns, which Prisma cannot express
    // in a `where` — filter after the query rather than dropping to raw SQL.
    const items = (lowStock === 'true' ? rows.filter((r) => r.qtyOnHand <= r.reorderPoint) : rows).map(
      (r) => ({
        ...r,
        lowStock: r.qtyOnHand <= r.reorderPoint,
        daysToExpiry: r.expiryDate
          ? Math.floor((r.expiryDate.getTime() - Date.now()) / 86_400_000)
          : null,
      }),
    );

    return { items, total: lowStock === 'true' ? items.length : total, take, skip };
  });

  /** V6 — what's expiring, with the value at risk. */
  app.get('/expiring', async (req) => {
    const days = Number((req.query as { days?: string }).days ?? 60);
    const rows = await prisma.inventory.findMany({
      where: { expiryDate: { lte: new Date(Date.now() + days * 86_400_000) } },
      orderBy: { expiryDate: 'asc' },
      include: { drug: true },
    });

    const valueAtRisk = rows.reduce(
      (sum, r) => sum + r.qtyOnHand * (r.drug.unitPrice ?? 0),
      0,
    );

    return {
      windowDays: days,
      items: rows.map((r) => ({
        ...r,
        daysToExpiry: r.expiryDate
          ? Math.floor((r.expiryDate.getTime() - Date.now()) / 86_400_000)
          : null,
      })),
      valueAtRisk: Number(valueAtRisk.toFixed(2)),
    };
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = await prisma.inventory.findUnique({
      where: { id: req.params.id },
      include: { drug: true },
    });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return row;
  });
}
