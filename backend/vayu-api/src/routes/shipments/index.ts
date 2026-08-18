/**
 * Shipments — reads for the telemetry console, plus scan-in confirmation.
 *
 * ARCHITECTURE.md §5.1, §6.1, §7.3 (M8 batch.trace). README §5 (Phases 4, 6),
 * Part 2.
 */

import { randomUUID } from 'node:crypto';

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

// Statuses a supply order must be in before a shipment can be raised against
// it. PENDING (not yet reviewed) and REJECTED cannot dispatch.
const DISPATCHABLE_ORDER_STATUSES = ['APPROVED', 'PARTIAL'] as const;

// Batch statuses eligible to go on a manifest. QC_APPROVED covers batches
// that passed QC but haven't been formally warehoused yet in the dataset;
// WAREHOUSED is the normal "on the shelf" state. MANUFACTURED (pre-QC),
// QC_FAILED, DISPATCHED and DELIVERED are all ineligible.
const DISPATCHABLE_BATCH_STATUSES = ['WAREHOUSED', 'QC_APPROVED'] as const;

// A shipment already exists for the order unless it's in one of these
// states — DRAFT (never actually sent) or, if it ever arises, CANCELLED.
// Anything past DRAFT (DISPATCHED, IN_TRANSIT, ...) blocks a second create.
const NON_BLOCKING_SHIPMENT_STATUSES = ['DRAFT'] as const;

const CreateShipmentBody = z.object({
  supplyOrderId: z.string().min(1),
  originWarehouseId: z.string().optional(),
  etaAt: z.string().datetime().optional(),
  batches: z
    .array(
      z.object({
        batchId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .optional(),
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

  /**
   * Create a shipment (dispatch) for an approved/partial supply order.
   *
   * Not HMAC-verified: unlike `orders/incoming` (a cross-org Dhanvantari →
   * Vayu webhook), this is called by our own first-party dispatch UI on the
   * same origin, not another organisation, so there's no shared-secret
   * contract to authenticate here (§5.1 vs the D→V webhooks).
   *
   * `?dryRun=true` runs every validation and the same FEFO allocation logic
   * but skips the `$transaction` that writes the Shipment/ShipmentBatch rows
   * — it returns the exact manifest a real create would produce, without
   * creating anything. This is what lets the UI show "confirm before
   * commit": the preview and the eventual write can never drift apart
   * because they're the same code path.
   */
  app.post<{ Querystring: { dryRun?: string } }>('/', async (req, reply) => {
    const parsed = CreateShipmentBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const { supplyOrderId, originWarehouseId, etaAt, batches: manifestOverride } = parsed.data;
    const dryRun = req.query.dryRun === 'true';

    const idempotencyKey = req.headers['idempotency-key'];
    const runCreate = async () => {
      const order = await prisma.supplyOrder.findUnique({
        where: { id: supplyOrderId },
        include: { lines: { include: { drug: true } }, shipments: true },
      });
      if (!order) {
        return { code: 400 as const, body: { error: 'order_not_found', message: 'No supply order with that id.' } };
      }
      if (!DISPATCHABLE_ORDER_STATUSES.includes(order.status as (typeof DISPATCHABLE_ORDER_STATUSES)[number])) {
        return {
          code: 400 as const,
          body: {
            error: 'order_not_dispatchable',
            message: `Supply order is ${order.status}; only APPROVED or PARTIAL orders can be dispatched.`,
          },
        };
      }

      // Rule: an order may have at most one "live" shipment. A shipment past
      // DRAFT already represents a real dispatch, so a second create would be
      // a duplicate consignment, not a new one — reject with 409 rather than
      // silently making a second shipment for the same order.
      const blockingShipment = order.shipments.find(
        (s) => !NON_BLOCKING_SHIPMENT_STATUSES.includes(s.status as (typeof NON_BLOCKING_SHIPMENT_STATUSES)[number]),
      );
      if (blockingShipment) {
        return {
          code: 409 as const,
          body: {
            error: 'already_dispatched',
            message: `Supply order already has shipment ${blockingShipment.id} (${blockingShipment.status}).`,
            shipmentId: blockingShipment.id,
          },
        };
      }

      // Build the manifest: either the client's explicit list, or auto-built
      // FEFO (earliest expiry first) per order line, up to qtyApproved ??
      // qtyRequested. Shortfall is reported, never invented.
      const shortfalls: Array<{ drugId: string; drugName: string; requested: number; allocated: number }> = [];
      let manifest: Array<{ batchId: string; quantity: number }>;

      if (manifestOverride && manifestOverride.length > 0) {
        manifest = manifestOverride;
      } else {
        manifest = [];
        for (const line of order.lines) {
          const need = line.qtyApproved ?? line.qtyRequested;
          if (need <= 0) continue;

          const candidates = await prisma.batch.findMany({
            where: {
              drugId: line.drugId,
              status: { in: [...DISPATCHABLE_BATCH_STATUSES] },
              expiryDate: { gt: new Date() },
            },
            orderBy: { expiryDate: 'asc' }, // FEFO
          });

          let remaining = need;
          for (const batch of candidates) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, batch.quantity);
            if (take <= 0) continue;
            manifest.push({ batchId: batch.id, quantity: take });
            remaining -= take;
          }

          if (remaining > 0) {
            shortfalls.push({
              drugId: line.drugId,
              drugName: line.drug.name,
              requested: need,
              allocated: need - remaining,
            });
          }
        }
      }

      if (manifest.length === 0) {
        return {
          code: 400 as const,
          body: {
            error: 'no_stock',
            message: 'No dispatchable batch stock was found for any line on this order.',
            shortfalls,
          },
        };
      }

      // coldChain is derived from the allocated batches' drugs, never
      // accepted from the client — the server is the source of truth for
      // what's actually on the manifest.
      const batchIds = manifest.map((m) => m.batchId);
      const allocatedBatches = await prisma.batch.findMany({
        where: { id: { in: batchIds } },
        include: { drug: true },
      });
      const coldChain = allocatedBatches.some((b) => b.drug.coldChain);

      const now = new Date();
      // Default ETA: +8h from dispatch when the caller doesn't supply one —
      // a placeholder sensible for same-day/short-haul district routes.
      const eta = etaAt ? new Date(etaAt) : new Date(now.getTime() + 8 * 3_600_000);
      const shipmentId = randomUUID();

      if (dryRun) {
        // Same shape as a real 201, so the UI's preview renderer is a single
        // code path — but nothing below this point has touched the DB and
        // the returned id is illustrative only (a fresh create mints its own).
        return {
          code: 200 as const,
          body: {
            id: shipmentId,
            supplyOrderId: order.id,
            originWarehouseId: originWarehouseId ?? null,
            destinationInstitution: order.institutionId,
            status: 'DISPATCHED',
            dispatchedAt: now,
            etaAt: eta,
            deliveredAt: null,
            routePolyline: null,
            coldChain,
            excursionCount: 0,
            lastKnownLat: null,
            lastKnownLng: null,
            lastTempC: null,
            progressPct: 0,
            batches: allocatedBatches.map((b) => {
              const m = manifest.find((x) => x.batchId === b.id)!;
              return { shipmentId, batchId: b.id, quantity: m.quantity, batch: b };
            }),
            shortfalls,
            dryRun: true,
          },
        };
      }

      const created = await prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.create({
          data: {
            id: shipmentId,
            supplyOrderId: order.id,
            originWarehouseId: originWarehouseId ?? null,
            destinationInstitution: order.institutionId,
            status: 'DISPATCHED',
            dispatchedAt: now,
            etaAt: eta,
            coldChain,
            progressPct: 0,
          },
        });

        await tx.shipmentBatch.createMany({
          data: manifest.map((m) => ({ shipmentId: shipment.id, batchId: m.batchId, quantity: m.quantity })),
        });

        const full = await tx.shipment.findUniqueOrThrow({
          where: { id: shipment.id },
          include: { batches: { include: { batch: { include: { drug: true } } } } },
        });

        return full;
      });

      return { code: 201 as const, body: { ...created, shortfalls } };
    };

    // A dry run has no side effect to guard, so it skips the idempotency
    // wrapper entirely and can be called freely (e.g. once per candidate
    // row the user opens in the preview panel).
    if (dryRun) {
      const result = await runCreate();
      return reply.code(result.code).send(result.body);
    }

    // Reuse the webhook idempotency helper when a client supplies a key —
    // it fits cleanly: `once()` just needs a unique string id and a unit of
    // work, and the dispatch UI can pass a fresh key per user click to make
    // an accidental double-submit (e.g. a double click) a no-op replay
    // rather than a second shipment.
    if (idempotencyKey) {
      const key = Array.isArray(idempotencyKey) ? idempotencyKey[0]! : idempotencyKey;
      const outcome = await once(`shipment-create:${key}`, runCreate);
      if (outcome.duplicate) {
        return reply.code(200).send({ ok: true, duplicate: true });
      }
      return reply.code(outcome.result.code).send(outcome.result.body);
    }

    const result = await runCreate();
    return reply.code(result.code).send(result.body);
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
