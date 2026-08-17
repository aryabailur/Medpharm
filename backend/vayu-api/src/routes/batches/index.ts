/**
 * Batch read APIs — GET /api/batches
 *
 * ARCHITECTURE.md §4.2, §2.1 (tier-1 QR capture). README §5 (Phase 2), Part 1.
 *
 * Phase 2 gate: "Scan a QR → drug card renders." `/resolve` is that endpoint.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const BATCH_STATUSES = [
  'MANUFACTURED',
  'QC_APPROVED',
  'QC_FAILED',
  'WAREHOUSED',
  'DISPATCHED',
  'DELIVERED',
] as const;

const ListQuery = z.object({
  status: z.enum(BATCH_STATUSES).optional(),
  drugId: z.string().optional(),
  expiringInDays: z.coerce.number().int().min(1).max(3650).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function batchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { status, drugId, expiringInDays, take, skip } = parsed.data;

    const where = {
      ...(status ? { status } : {}),
      ...(drugId ? { drugId } : {}),
      ...(expiringInDays
        ? {
            expiryDate: {
              lte: new Date(Date.now() + expiringInDays * 86_400_000),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        orderBy: { expiryDate: 'asc' },
        take,
        skip,
        include: {
          drug: { select: { id: true, name: true, genericName: true, category: true, nlemCode: true, coldChain: true } },
          // The QC screen needs the latest inspection per batch. Without this
          // every batch reads as "awaiting QC", which is wrong rather than
          // merely incomplete.
          qcRecords: { orderBy: { testedAt: 'desc' }, take: 1 },
        },
      }),
      prisma.batch.count({ where }),
    ]);

    return { items, total, take, skip };
  });

  /**
   * Resolve a scanned QR payload to a batch — tier 1 of the capture ladder
   * (§2.1). Returns drug, expiry, QC status and the cold-chain band, which is
   * exactly what the scan-in screen needs to render a drug card.
   *
   * Declared before `/:id` so "resolve" is never parsed as an id.
   */
  app.get<{ Querystring: { qr?: string } }>('/resolve', async (req, reply) => {
    const qr = req.query.qr?.trim();
    if (!qr) return reply.code(400).send({ error: 'missing_qr' });

    const batch = await prisma.batch.findFirst({
      where: { OR: [{ qrPayload: qr }, { id: qr }] },
      include: {
        drug: true,
        qcRecords: { orderBy: { testedAt: 'desc' }, take: 1 },
      },
    });

    if (!batch) return reply.code(404).send({ error: 'not_found' });

    const latestQc = batch.qcRecords[0];
    return {
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      status: batch.status,
      mfgDate: batch.mfgDate,
      expiryDate: batch.expiryDate,
      quantity: batch.quantity,
      qcStatus: latestQc?.result ?? null,
      drug: {
        id: batch.drug.id,
        name: batch.drug.name,
        genericName: batch.drug.genericName,
        nlemCode: batch.drug.nlemCode,
        packSize: batch.drug.packSize,
        coldChain: batch.drug.coldChain,
        minTempC: batch.drug.minTempC,
        maxTempC: batch.drug.maxTempC,
      },
    };
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const batch = await prisma.batch.findUnique({
      where: { id: req.params.id },
      include: {
        drug: true,
        qcRecords: { orderBy: { testedAt: 'desc' } },
        shipmentBatch: { include: { shipment: true } },
      },
    });

    if (!batch) return reply.code(404).send({ error: 'not_found' });
    return batch;
  });
}
