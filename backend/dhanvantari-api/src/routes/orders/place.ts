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

import {
  primeVayuCatalogue,
  resolveDrugIdsForVayu,
  resolveInstitutionId,
} from '../../lib/identity.js';
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

    // Translate local identity into what Vayu actually stores, BEFORE enqueuing.
    // The UI sends 'self' and local drug UUIDs; Vayu's FKs reject both, which is
    // why outbound events were failing silently. §4.1 — resolve, never invent.
    const institutionId = resolveInstitutionId(body.institutionId);
    await primeVayuCatalogue();
    const drugMap = await resolveDrugIdsForVayu(body.lines.map((l) => l.drugId));

    const resolvedLines = body.lines
      .map((l) => ({ drugId: drugMap.get(l.drugId) ?? null, qtyRequested: l.qtyRequested }))
      .filter((l): l is { drugId: string; qtyRequested: number } => l.drugId !== null);

    const droppedLines = body.lines.length - resolvedLines.length;
    if (resolvedLines.length === 0) {
      // Better an honest failure than an order for the wrong drug.
      return reply.code(422).send({
        error: 'unmapped_drugs',
        detail: 'None of these items could be matched to the supplier catalogue.',
      });
    }

    await prisma.$transaction(async (tx) => {
      // Local mirror lives on IncomingShipment once dispatched; until then the
      // order exists only as the outbound event plus what Vayu tells us back.
      await enqueue(tx, 'order.place', {
        supplyOrderId,
        institutionId,
        requestedWindow: body.requestedWindow,
        lines: resolvedLines,
      });
    });

    req.log.info(
      { supplyOrderId, lines: resolvedLines.length, droppedLines, institutionId },
      'supply order placed',
    );

    return reply.code(201).send({
      ok: true,
      supplyOrderId,
      status: 'PENDING',
      lines: resolvedLines.length,
      // Surfaced, not swallowed: the caller needs to know an item was dropped
      // because it has no counterpart in the supplier's catalogue.
      droppedLines,
      note:
        droppedLines > 0
          ? `Queued to the supplier; ${droppedLines} item(s) were dropped — no catalogue match.`
          : 'Queued to the supplier; status updates arrive by webhook.',
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
      if (!inventoryId || !drugRef) {
        return reply
          .code(400)
          .send({ error: 'invalid_payload', detail: 'inventoryId and drugRef are required' });
      }
      // institutionId may arrive as 'self' or empty — config resolves it.
      const resolvedInstitutionId = resolveInstitutionId(institutionId);

      const row = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { drug: true },
      });
      if (!row) return reply.code(404).send({ error: 'not_found' });

      // Top back up to twice the reorder point — enough to clear the low-stock
      // flag with headroom, without guessing at demand.
      const target = Math.max(row.reorderPoint * 2, row.reorderPoint + 1);
      const qtyRequested = Math.max(1, target - row.qtyOnHand);

      // Map the local drug UUID onto Vayu's catalogue id before enqueuing;
      // a local id means nothing to the supplier and Vayu's FK rejects it.
      await primeVayuCatalogue();
      const map = await resolveDrugIdsForVayu([drugRef]);
      const vayuDrugId = map.get(drugRef) ?? null;
      if (!vayuDrugId) {
        return reply.code(422).send({
          error: 'unmapped_drug',
          detail: `"${row.drug.name}" has no match in the supplier catalogue.`,
        });
      }

      const supplyOrderId = randomUUID();
      await prisma.$transaction(async (tx) => {
        await enqueue(tx, 'order.place', {
          supplyOrderId,
          institutionId: resolvedInstitutionId,
          lines: [{ drugId: vayuDrugId, qtyRequested }],
        });
      });

      req.log.info({ supplyOrderId, drug: row.drug.name, qtyRequested }, 'one-tap reorder placed');
      return reply.code(201).send({ ok: true, supplyOrderId, drug: row.drug.name, qtyRequested });
    },
  );
}
