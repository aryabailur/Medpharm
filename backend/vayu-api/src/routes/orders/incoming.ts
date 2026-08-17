/**
 * POST /api/orders/incoming — an institution places a supply order.
 *
 * ARCHITECTURE.md §5.1, §5.2. README §5 (Phase 3 🔒 HARD GATE), Part 1.
 *
 * The first half of the order loop: Dhanvantari places → Vayu approves →
 * Dhanvantari's status flips. Nothing downstream ships until this works (§9).
 *
 * HMAC-verified and idempotent. Both are load-bearing: webhooks retry, and
 * without the idempotency guard a retry creates the order twice.
 */

import { PlaceOrderSchema } from '@medtrack/contracts';
import type { FastifyInstance } from 'fastify';

import { verifyHmac } from '../../lib/hmac-middleware.js';
import { once } from '../../lib/idempotency.js';
import { prisma } from '../../lib/prisma.js';

export async function ordersIncomingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/incoming', { preHandler: verifyHmac }, async (req, reply) => {
    // Senders wrap payloads in a `{ type, data }` envelope so the receiver can
    // log the event type without parsing the URL. Accept both shapes — the
    // sibling complaint/consumption/receipt routes already do.
    const body = (req.body as { data?: unknown })?.data ?? req.body;
    const parsed = PlaceOrderSchema.safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const order = parsed.data;

    // supplyOrderId is a UUIDv7 minted by Dhanvantari. We echo it, never
    // invent one (§4.1) — it is the shared handle for this order in both DBs.
    const outcome = await once(req.medtrackEventId!, async () => {
      const institution = await prisma.institution.findUnique({
        where: { id: order.institutionId },
        select: { id: true },
      });
      if (!institution) return { ok: false as const, reason: 'unknown_institution' };

      const drugIds = [...new Set(order.lines.map((l) => l.drugId))];
      const known = await prisma.drug.findMany({
        where: { id: { in: drugIds } },
        select: { id: true },
      });
      if (known.length !== drugIds.length) {
        const found = new Set(known.map((d) => d.id));
        return {
          ok: false as const,
          reason: 'unknown_drug',
          missing: drugIds.filter((id) => !found.has(id)),
        };
      }

      const created = await prisma.supplyOrder.create({
        data: {
          id: order.supplyOrderId,
          institutionId: order.institutionId,
          requestedWindow: order.requestedWindow,
          status: 'PENDING',
          lines: {
            create: order.lines.map((l) => ({
              drugId: l.drugId,
              qtyRequested: l.qtyRequested,
            })),
          },
        },
        include: { lines: true },
      });

      return { ok: true as const, created };
    });

    // Replay of an already-processed event: acknowledge, change nothing (§5.2).
    if (outcome.duplicate) {
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    const result = outcome.result;
    if (!result.ok) {
      return reply.code(422).send({ error: result.reason, ...('missing' in result ? { missing: result.missing } : {}) });
    }

    req.log.info(
      { supplyOrderId: result.created.id, institutionId: order.institutionId, lines: result.created.lines.length },
      'supply order received',
    );

    return reply.code(201).send({
      ok: true,
      supplyOrderId: result.created.id,
      status: result.created.status,
      placedAt: result.created.placedAt,
    });
  });
}
