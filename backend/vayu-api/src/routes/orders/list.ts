/**
 * Order read APIs — GET /api/orders
 *
 * ARCHITECTURE.md §7.3 (M7 `order.queue`). README §5 (Phases 2–3), Part 1.
 *
 * Serves frontend/vayu's approval queue. M7 wants "status = PENDING, aged" —
 * hence `ageHours` and the oldest-first default.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const ORDER_STATUSES = [
  'PENDING',
  'APPROVED',
  'PARTIAL',
  'REJECTED',
  'DISPATCHED',
  'DELIVERED',
] as const;

const ListQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  institutionId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function ordersListRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { status, institutionId, take, skip } = parsed.data;

    const where = {
      ...(status ? { status } : {}),
      ...(institutionId ? { institutionId } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.supplyOrder.findMany({
        where,
        orderBy: { placedAt: 'asc' }, // oldest first — the aged queue
        take,
        skip,
        include: {
          institution: { select: { id: true, name: true, type: true, district: true } },
          lines: { include: { drug: { select: { id: true, name: true } } } },
        },
      }),
      prisma.supplyOrder.count({ where }),
    ]);

    const now = Date.now();
    const items = rows.map((o) => ({
      ...o,
      ageHours: Math.floor((now - o.placedAt.getTime()) / 3_600_000),
    }));

    return { items, total, take, skip };
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const order = await prisma.supplyOrder.findUnique({
      where: { id: req.params.id },
      include: {
        institution: true,
        lines: { include: { drug: true } },
        shipments: true,
      },
    });

    if (!order) return reply.code(404).send({ error: 'not_found' });
    return order;
  });
}
