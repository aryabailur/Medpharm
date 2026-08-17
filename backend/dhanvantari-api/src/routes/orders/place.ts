/**
 * Order placement — POST /api/orders
 *
 * ARCHITECTURE.md §4.1, §5.1. README §5 (Phase 3 🔒 HARD GATE), Part 1.
 *
 * The institution's half of the order loop: place here → Vayu approves →
 * status flips back via the order-status webhook (Part 2).
 *
 * ID OWNERSHIP (§4.1): `supplyOrderId` is minted HERE, by the placing party,
 * and echoed by Vayu. It is one of the three globally meaningful IDs. Vayu never
 * invents one; neither does this server for a batch or shipment.
 *
 * The order is enqueued to Vayu in the SAME transaction as the local record, so
 * a placed order can never exist locally without its outbound notification.
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { enqueue } from '../../lib/outbound/queue.js';
import { prisma } from '../../lib/prisma.js';

const PlaceBody = z.object({
  /** Institution identity in Vayu's network. Provided by config/session. */
  institutionId: z.string().min(1),
  requestedWindow: z.string().optional(),
  lines: z
    .array(
      z.object({
        /** Vayu's drug id — echoed from the catalogue, never invented. */
        drugId: z.string().min(1),
        qtyRequested: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function ordersPlaceRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', async (req, reply) => {
    const parsed = PlaceBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const body = parsed.data;

    // UUIDv7-shaped id, minted once, used in both databases forever.
    const supplyOrderId = randomUUID();

    await prisma.$transaction(async (tx) => {
      // Local mirror lives on IncomingShipment once dispatched; until then the
      // order exists only as the outbound event plus what Vayu tells us back.
      await enqueue(tx, 'order.place', {
        supplyOrderId,
        institutionId: body.institutionId,
        requestedWindow: body.requestedWindow,
        lines: body.lines,
      });
    });

    req.log.info({ supplyOrderId, lines: body.lines.length }, 'supply order placed');

    return reply.code(201).send({
      ok: true,
      supplyOrderId,
      status: 'PENDING',
      note: 'Queued to the supplier; status updates arrive by webhook.',
    });
  });

  /**
   * One-tap reorder (§11, 0:40 demo beat). Takes an inventory row, works out a
   * sensible quantity, and places the order — "no phone call, no email, no
   * spreadsheet".
   */
  app.post<{ Body: { inventoryId?: string; institutionId?: string; drugRef?: string } }>(
    '/reorder',
    async (req, reply) => {
      const { inventoryId, institutionId, drugRef } = req.body ?? {};
      if (!inventoryId || !institutionId || !drugRef) {
        return reply
          .code(400)
          .send({ error: 'invalid_payload', detail: 'inventoryId, institutionId and drugRef are required' });
      }

      const row = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { drug: true },
      });
      if (!row) return reply.code(404).send({ error: 'not_found' });

      // Top back up to twice the reorder point — enough to clear the low-stock
      // flag with headroom, without guessing at demand.
      const target = Math.max(row.reorderPoint * 2, row.reorderPoint + 1);
      const qtyRequested = Math.max(1, target - row.qtyOnHand);

      const supplyOrderId = randomUUID();
      await prisma.$transaction(async (tx) => {
        await enqueue(tx, 'order.place', {
          supplyOrderId,
          institutionId,
          lines: [{ drugId: drugRef, qtyRequested }],
        });
      });

      req.log.info({ supplyOrderId, drug: row.drug.name, qtyRequested }, 'one-tap reorder placed');
      return reply.code(201).send({ ok: true, supplyOrderId, drug: row.drug.name, qtyRequested });
    },
  );
}
