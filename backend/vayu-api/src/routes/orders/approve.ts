/**
 * Order approval — POST /api/orders/:id/{approve,reject}
 *
 * ARCHITECTURE.md §5.1. README §5 (Phase 3 🔒 HARD GATE), Part 1.
 *
 * Second half of the order loop. A status change here must reach Dhanvantari,
 * which is what flips the institution's view and closes the gate.
 *
 * SEAM WITH PART 2: this route does not send the webhook itself. It enqueues an
 * `OutboundEvent` row in the same transaction as the status update, and Part
 * 2's retry worker (lib/webhooks/) drains the queue. Two reasons:
 *   1. Enqueue-in-transaction means a status change can never be recorded
 *      without its notification, or vice versa.
 *   2. The two Parts stay file-disjoint — Part 2 owns lib/webhooks/** and can
 *      build the sender independently against this table.
 *
 * Called by frontend/vayu's approval queue, so it is session-authenticated
 * rather than HMAC-verified — it is not part of the D→V contract (§5.1).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const ApproveBody = z.object({
  /** Per-line approved quantities. Omit a line to approve it in full. */
  lines: z
    .array(z.object({ lineId: z.string(), qtyApproved: z.number().int().min(0) }))
    .optional(),
});

const RejectBody = z.object({
  reason: z.string().trim().min(1).max(500),
});

const DHANVANTARI_URL = process.env.DHANVANTARI_API_URL ?? 'http://localhost:4001';

export async function ordersApproveRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>('/:id/approve', async (req, reply) => {
    const parsed = ApproveBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }

    const order = await prisma.supplyOrder.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!order) return reply.code(404).send({ error: 'not_found' });
    if (order.status !== 'PENDING') {
      return reply.code(409).send({ error: 'not_pending', status: order.status });
    }

    const overrides = new Map(parsed.data.lines?.map((l) => [l.lineId, l.qtyApproved]) ?? []);
    const approvals = order.lines.map((line) => ({
      id: line.id,
      qtyApproved: overrides.get(line.id) ?? line.qtyRequested,
      qtyRequested: line.qtyRequested,
    }));

    // PARTIAL when any line was cut, APPROVED when all were met in full.
    const isPartial = approvals.some((a) => a.qtyApproved < a.qtyRequested);
    const status = isPartial ? 'PARTIAL' : 'APPROVED';

    const updated = await prisma.$transaction(async (tx) => {
      for (const a of approvals) {
        await tx.supplyOrderLine.update({
          where: { id: a.id },
          data: { qtyApproved: a.qtyApproved },
        });
      }

      const next = await tx.supplyOrder.update({
        where: { id: order.id },
        data: { status },
        include: { lines: true },
      });

      // Same transaction as the status change — see SEAM note above.
      await tx.outboundEvent.create({
        data: {
          type: 'order.status_changed',
          targetUrl: `${DHANVANTARI_URL}/api/webhooks/vayu/order-status`,
          payloadJson: {
            supplyOrderId: next.id,
            status: next.status,
            lines: next.lines.map((l) => ({
              drugId: l.drugId,
              qtyRequested: l.qtyRequested,
              qtyApproved: l.qtyApproved,
            })),
          },
          status: 'PENDING',
          nextRetryAt: new Date(),
        },
      });

      return next;
    });

    req.log.info({ supplyOrderId: updated.id, status }, 'supply order approved');
    return { ok: true, supplyOrderId: updated.id, status: updated.status };
  });

  app.post<{ Params: { id: string } }>('/:id/reject', async (req, reply) => {
    const parsed = RejectBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }

    const order = await prisma.supplyOrder.findUnique({ where: { id: req.params.id } });
    if (!order) return reply.code(404).send({ error: 'not_found' });
    if (order.status !== 'PENDING') {
      return reply.code(409).send({ error: 'not_pending', status: order.status });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.supplyOrder.update({
        where: { id: order.id },
        data: { status: 'REJECTED', rejectionReason: parsed.data.reason },
      });

      await tx.outboundEvent.create({
        data: {
          type: 'order.status_changed',
          targetUrl: `${DHANVANTARI_URL}/api/webhooks/vayu/order-status`,
          payloadJson: {
            supplyOrderId: next.id,
            status: next.status,
            rejectionReason: next.rejectionReason,
          },
          status: 'PENDING',
          nextRetryAt: new Date(),
        },
      });

      return next;
    });

    req.log.info({ supplyOrderId: updated.id }, 'supply order rejected');
    return { ok: true, supplyOrderId: updated.id, status: updated.status };
  });
}
