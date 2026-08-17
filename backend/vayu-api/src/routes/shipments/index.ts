/**
 * Shipments — reads for the telemetry console, plus scan-in confirmation.
 *
 * ARCHITECTURE.md §5.1, §6.1, §7.3 (M8 batch.trace). README §5 (Phases 4, 6),
 * Part 2.
 */

import { ConfirmReceiptSchema } from '@medtrack/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { verifyHmac } from '../../lib/hmac-middleware.js';
import { once } from '../../lib/idempotency.js';
import { prisma } from '../../lib/prisma.js';
import { decimate } from '../stream/shipments.js';

const ListQuery = z.object({
  status: z
    .enum(['DRAFT', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'])
    .optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function shipmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { status, take, skip } = parsed.data;
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        orderBy: { dispatchedAt: 'desc' },
        take,
        skip,
        include: {
          supplyOrder: { include: { institution: { select: { id: true, name: true, district: true } } } },
          _count: { select: { excursions: true, batches: true } },
        },
      }),
      prisma.shipment.count({ where }),
    ]);

    return { items, total, take, skip };
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const s = await prisma.shipment.findUnique({
      where: { id: req.params.id },
      include: {
        supplyOrder: { include: { institution: true } },
        batches: { include: { batch: { include: { drug: true } } } },
        excursions: { orderBy: { startedAt: 'asc' } },
        complaints: true,
      },
    });
    if (!s) return reply.code(404).send({ error: 'not_found' });
    return s;
  });

  /**
   * Telemetry for the chart. Decimated to ~200 points server-side (§4.4) —
   * never ship the raw table to a browser.
   */
  app.get<{ Params: { id: string } }>('/:id/telemetry', async (req) => {
    const rows = await prisma.telemetryPoint.findMany({
      where: { shipmentId: req.params.id },
      orderBy: { ts: 'asc' },
      select: { ts: true, lat: true, lng: true, tempC: true },
    });
    return { points: decimate(rows), rawCount: rows.length };
  });

  /**
   * Scan-in complete at the institution. Marks the shipment DELIVERED and the
   * accepted batches with it.
   */
  app.post<{ Params: { id: string } }>(
    '/:id/confirm-receipt',
    { preHandler: verifyHmac },
    async (req, reply) => {
      const body = (req.body as { data?: unknown })?.data ?? req.body;
      const parsed = ConfirmReceiptSchema.safeParse(body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
      }
      const payload = parsed.data;

      const outcome = await once(req.medtrackEventId!, async () => {
        const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
        if (!shipment) return { ok: false as const };

        const now = new Date();
        await prisma.$transaction(async (tx) => {
          await tx.shipment.update({
            where: { id: shipment.id },
            data: { status: 'DELIVERED', deliveredAt: now },
          });

          const acceptedIds = payload.batches.filter((b) => b.accepted).map((b) => b.batchId);
          if (acceptedIds.length) {
            await tx.batch.updateMany({
              where: { id: { in: acceptedIds } },
              data: { status: 'DELIVERED' },
            });
          }
        });

        return { ok: true as const, delivered: payload.batches.length };
      });

      if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });
      if (!outcome.result.ok) return reply.code(404).send({ error: 'unknown_shipment' });

      req.log.info({ shipmentId: req.params.id }, 'receipt confirmed');
      return { ok: true, shipmentId: req.params.id, status: 'DELIVERED' };
    },
  );
}
