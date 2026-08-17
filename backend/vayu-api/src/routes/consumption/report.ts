/**
 * POST /api/consumption/report — periodic consumption push from Dhanvantari.
 *
 * ARCHITECTURE.md §5.1, §7.3 (M10). README §5 (Phase 7), Part 2.
 *
 * Feeds the network-scope analytics: consumption leaderboards, the forecast's
 * training signal, and the coverage-gap calculation.
 */

import { ConsumptionReportSchema } from '@medtrack/contracts';
import type { FastifyInstance } from 'fastify';

import { verifyHmac } from '../../lib/hmac-middleware.js';
import { once } from '../../lib/idempotency.js';
import { prisma } from '../../lib/prisma.js';

export async function consumptionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/report', { preHandler: verifyHmac }, async (req, reply) => {
    const body = (req.body as { data?: unknown })?.data ?? req.body;
    const parsed = ConsumptionReportSchema.safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const { institutionId, periodMonth, rows } = parsed.data;

    const outcome = await once(req.medtrackEventId!, async () => {
      const institution = await prisma.institution.findUnique({
        where: { id: institutionId },
        select: { id: true },
      });
      if (!institution) return { ok: false as const };

      // A re-reported month replaces the prior figures rather than
      // double-counting — institutions restate as their own books close.
      await prisma.consumptionFeed.deleteMany({ where: { institutionId, periodMonth } });
      await prisma.consumptionFeed.createMany({
        data: rows.map((r) => ({
          institutionId,
          drugId: r.drugId,
          periodMonth,
          opening: r.opening,
          received: r.received,
          dispensed: r.dispensed,
          closing: r.closing,
        })),
        skipDuplicates: true,
      });

      return { ok: true as const, count: rows.length };
    });

    if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });
    if (!outcome.result.ok) return reply.code(422).send({ error: 'unknown_institution' });

    return reply.code(201).send({ ok: true, rows: outcome.result.count, periodMonth });
  });
}
