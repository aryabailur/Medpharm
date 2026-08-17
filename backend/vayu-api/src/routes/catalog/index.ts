/**
 * Catalog read APIs — GET /api/catalog
 *
 * ARCHITECTURE.md §4.2. README §5 (Phase 2), Part 1.
 *
 * Serves `frontend/vayu`'s catalog screens. Read-only; the seed script owns
 * writes (Phase 1).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const ListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  coldChain: z.enum(['true', 'false']).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  /** List drugs, with optional search and filters. */
  app.get('/', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const { q, category, coldChain, take, skip } = parsed.data;

    const where = {
      ...(category ? { category } : {}),
      ...(coldChain ? { coldChain: coldChain === 'true' } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { genericName: { contains: q, mode: 'insensitive' as const } },
              { nlemCode: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.drug.findMany({ where, orderBy: { name: 'asc' }, take, skip }),
      prisma.drug.count({ where }),
    ]);

    return { items, total, take, skip };
  });

  /** One drug, with its batches. */
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const drug = await prisma.drug.findUnique({
      where: { id: req.params.id },
      include: {
        batches: {
          orderBy: { expiryDate: 'asc' },
          include: { qcRecords: { orderBy: { testedAt: 'desc' }, take: 1 } },
        },
      },
    });

    if (!drug) return reply.code(404).send({ error: 'not_found' });
    return drug;
  });
}
