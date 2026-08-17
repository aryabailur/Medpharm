/**
 * Complaints — POST /api/complaints/incoming, GET /api/complaints
 *
 * ARCHITECTURE.md §5.1, §6.3, §7.3 (M4). README §5 (Phase 6), Part 2.
 *
 * The institution files a complaint; it lands in Vayu's queue already linked to
 * its shipment and batch. "No form. No batch number typed." (§11, 3:20)
 *
 * The complaint arrives pre-linked because Dhanvantari echoes the batchId and
 * shipmentId it received at scan-in — neither side invents an ID (§4.1).
 */

import { FileComplaintSchema } from '@medtrack/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { verifyHmac } from '../../lib/hmac-middleware.js';
import { once } from '../../lib/idempotency.js';
import { prisma } from '../../lib/prisma.js';

const DHANVANTARI_URL = process.env.DHANVANTARI_API_URL ?? 'http://localhost:4001';

/**
 * Route a complaint to the team that can act on it. Temperature damage is a
 * cold-chain failure (logistics); breakage and tampering are handling issues.
 */
function routeToTeam(category: string): 'QC' | 'LOGISTICS' {
  return category === 'TEMP_DAMAGE' || category === 'NEAR_EXPIRY' ? 'QC' : 'LOGISTICS';
}

const ListQuery = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED']).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

const StatusBody = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED']),
  resolutionNotes: z.string().max(2000).optional(),
});

export async function complaintRoutes(app: FastifyInstance): Promise<void> {
  app.post('/incoming', { preHandler: verifyHmac }, async (req, reply) => {
    const body = (req.body as { data?: unknown })?.data ?? req.body;
    const parsed = FileComplaintSchema.safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const c = parsed.data;

    const outcome = await once(req.medtrackEventId!, async () =>
      prisma.complaint.create({
        data: {
          shipmentId: c.shipmentId,
          batchId: c.batchId,
          institutionId: c.institutionId,
          category: c.category,
          description: c.description,
          photoUrls: c.photoUrls,
          status: 'OPEN',
          assignedTeam: routeToTeam(c.category),
        },
      }),
    );

    if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });

    req.log.info(
      { complaintId: outcome.result.id, category: c.category, team: outcome.result.assignedTeam },
      'complaint received',
    );
    return reply.code(201).send({ ok: true, complaintId: outcome.result.id, status: 'OPEN' });
  });

  /** Complaint queue for frontend/vayu. */
  app.get('/', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { status, take, skip } = parsed.data;
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: { filedAt: 'desc' },
        take,
        skip,
        include: {
          batch: { include: { drug: { select: { name: true, coldChain: true } } } },
          institution: { select: { id: true, name: true, district: true } },
          shipment: { select: { id: true, status: true, excursionCount: true } },
        },
      }),
      prisma.complaint.count({ where }),
    ]);

    return { items, total, take, skip };
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const c = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        batch: { include: { drug: true } },
        institution: true,
        shipment: { include: { excursions: { orderBy: { startedAt: 'asc' } } } },
      },
    });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    return c;
  });

  /** Status transitions push back to Dhanvantari via the retry queue (§5.1). */
  app.post<{ Params: { id: string } }>('/:id/status', async (req, reply) => {
    const parsed = StatusBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }

    const existing = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.complaint.update({
        where: { id: req.params.id },
        data: { status: parsed.data.status, resolutionNotes: parsed.data.resolutionNotes },
      });

      await tx.outboundEvent.create({
        data: {
          type: 'complaint.status_changed',
          targetUrl: `${DHANVANTARI_URL}/api/webhooks/vayu/complaint-status`,
          payloadJson: {
            complaintId: next.id,
            status: next.status,
            rcaSummary:
              (next.rcaJson as { probable_cause?: string } | null)?.probable_cause ?? undefined,
          },
          status: 'PENDING',
          nextRetryAt: new Date(),
        },
      });

      return next;
    });

    return { ok: true, complaintId: updated.id, status: updated.status };
  });
}
