/**
 * Order status view — GET /api/orders
 *
 * ARCHITECTURE.md §7.2 (V1 order.status, V2 shipment.delayed, V3 shipment.eta).
 * Part 1.
 *
 * The institution sees its orders through what Vayu has told it: outbound
 * placements plus the IncomingShipment rows created by webhooks (Part 2). This
 * server never queries the `vayu` schema (§3.1).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const ListQuery = z.object({
  status: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function ordersListRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Orders as this institution knows them: every placement we sent, joined to
   * the shipment Vayu raised against it (if any).
   */
  app.get('/', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { take, skip } = parsed.data;

    const placements = await prisma.outboundEvent.findMany({
      where: { type: 'order.place' },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });

    const ids = placements
      .map((p) => (p.payloadJson as { supplyOrderId?: string })?.supplyOrderId)
      .filter((x): x is string => Boolean(x));

    const shipments = ids.length
      ? await prisma.incomingShipment.findMany({ where: { supplyOrderId: { in: ids } } })
      : [];
    const byOrder = new Map(shipments.map((s) => [s.supplyOrderId, s]));

    const items = placements.map((p) => {
      const payload = p.payloadJson as {
        supplyOrderId?: string;
        institutionId?: string;
        lines?: Array<{ drugId: string; qtyRequested: number }>;
      };
      const shipment = payload.supplyOrderId ? byOrder.get(payload.supplyOrderId) : undefined;
      return {
        supplyOrderId: payload.supplyOrderId,
        placedAt: p.createdAt,
        lines: payload.lines ?? [],
        // Delivery status is whatever Vayu last told us; `deliveryStatus` is
        // null until the first webhook lands.
        deliveryStatus: shipment?.status ?? null,
        etaAt: shipment?.etaAt ?? null,
        shipmentId: shipment?.id ?? null,
        coldChain: shipment?.coldChain ?? null,
        anomalyFlag: shipment?.anomalyFlag ?? false,
        // Was the outbound notification actually delivered to Vayu?
        syncStatus: p.status,
      };
    });

    return { items, total: await prisma.outboundEvent.count({ where: { type: 'order.place' } }), take, skip };
  });

  /** V2 — shipments past their ETA and not yet delivered. */
  app.get('/delayed', async () => {
    const rows = await prisma.incomingShipment.findMany({
      where: { status: { not: 'DELIVERED' }, etaAt: { lt: new Date() } },
      orderBy: { etaAt: 'asc' },
    });
    return {
      items: rows.map((s) => ({
        ...s,
        daysLate: s.etaAt ? Math.floor((Date.now() - s.etaAt.getTime()) / 86_400_000) : null,
      })),
    };
  });
}
