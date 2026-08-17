/**
 * Webhook receivers — Vayu → Dhanvantari.
 *
 * ARCHITECTURE.md §5.1. README §5 (Phases 3–6), Part 2.
 *
 * All five are HMAC-verified and idempotent. Each mirrors remote state into
 * this schema; none of them ever queries the `vayu` schema (§3.1) — everything
 * arrives over the signed HTTP contract.
 *
 *   order.status_changed   Phase 3 🔒 closes the order loop
 *   shipment.dispatched    Phase 4 manifest + ETA
 *   shipment.telemetry     Phase 4 throttled position/temp
 *   shipment.excursion     Phase 5 PRE-ARRIVAL cold-chain warning
 *   complaint.status_changed Phase 6 + RCA summary pushed down
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../prisma.js';
import { publish } from '../stream/sse-hub.js';
import { once } from './idempotency.js';
import { verifyHmac } from './verify-middleware.js';

/** Senders wrap payloads as `{ type, data }`; accept a bare body too. */
function unwrap(body: unknown): Record<string, unknown> {
  const b = body as { data?: unknown };
  return (b?.data ?? body ?? {}) as Record<string, unknown>;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Phase 3 🔒 — the return leg of the order loop.
   *
   * An APPROVED/PARTIAL order means Vayu will raise a shipment against it, so
   * we create the IncomingShipment placeholder here; `shipment.dispatched`
   * fills in the manifest and ETA.
   */
  app.post('/order-status', { preHandler: verifyHmac }, async (req, reply) => {
    const d = unwrap(req.body) as {
      supplyOrderId?: string;
      status?: string;
      rejectionReason?: string;
    };
    if (!d.supplyOrderId || !d.status) {
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    const outcome = await once(req.medtrackEventId!, async () => {
      // The shipment id is Vayu's to mint. Until `shipment.dispatched` arrives
      // we track status against the order id itself, so the institution can see
      // "approved" before anything physically ships.
      const existing = await prisma.incomingShipment.findFirst({
        where: { supplyOrderId: d.supplyOrderId },
      });
      if (existing) {
        return prisma.incomingShipment.update({
          where: { id: existing.id },
          data: { status: d.status! },
        });
      }
      return prisma.incomingShipment.create({
        data: {
          id: `pending:${d.supplyOrderId}`, // replaced when the real shipmentId arrives
          supplyOrderId: d.supplyOrderId!,
          status: d.status!,
        },
      });
    });

    if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });

    req.log.info({ supplyOrderId: d.supplyOrderId, status: d.status }, 'order status changed');
    return { ok: true, status: d.status };
  });

  /** Phase 4 — manifest, route and ETA. */
  app.post('/shipment-dispatched', { preHandler: verifyHmac }, async (req, reply) => {
    const d = unwrap(req.body) as {
      shipmentId?: string;
      supplyOrderId?: string;
      etaAt?: string;
      coldChain?: boolean;
      manifest?: Array<{ batchId: string; drugRef: string; quantity: number }>;
    };
    if (!d.shipmentId) return reply.code(400).send({ error: 'invalid_payload' });

    const outcome = await once(req.medtrackEventId!, async () => {
      // Replace the placeholder row created at approval, if there is one.
      if (d.supplyOrderId) {
        await prisma.incomingShipment.deleteMany({
          where: { id: `pending:${d.supplyOrderId}` },
        });
      }

      const shipment = await prisma.incomingShipment.upsert({
        where: { id: d.shipmentId! },
        create: {
          id: d.shipmentId!,
          supplyOrderId: d.supplyOrderId,
          status: 'DISPATCHED',
          etaAt: d.etaAt ? new Date(d.etaAt) : null,
          coldChain: d.coldChain ?? false,
        },
        update: {
          status: 'DISPATCHED',
          etaAt: d.etaAt ? new Date(d.etaAt) : null,
          coldChain: d.coldChain ?? false,
        },
      });

      // Expected batches, so scan-in can compare counted against expected
      // without the worker typing anything (§11, 3:20).
      for (const m of d.manifest ?? []) {
        await prisma.receivedBatch.upsert({
          where: { id: m.batchId },
          create: {
            id: m.batchId,
            incomingShipmentId: shipment.id,
            drugRef: m.drugRef,
            qtyExpected: m.quantity,
          },
          update: { incomingShipmentId: shipment.id, qtyExpected: m.quantity },
        });
      }
      return shipment;
    });

    if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });

    publish(d.shipmentId, { event: 'status', data: { status: 'DISPATCHED', etaAt: d.etaAt } });
    req.log.info({ shipmentId: d.shipmentId, batches: d.manifest?.length ?? 0 }, 'shipment dispatched');
    return { ok: true };
  });

  /** Phase 4 — throttled position/temperature (10s cadence, not every tick). */
  app.post('/shipment-telemetry', { preHandler: verifyHmac }, async (req, reply) => {
    const d = unwrap(req.body) as {
      shipmentId?: string;
      ts?: string;
      lat?: number;
      lng?: number;
      tempC?: number;
      progressPct?: number;
      status?: string;
    };
    if (!d.shipmentId) return reply.code(400).send({ error: 'invalid_payload' });

    const outcome = await once(req.medtrackEventId!, async () =>
      prisma.incomingShipment.updateMany({
        where: { id: d.shipmentId! },
        data: {
          lastKnownLat: d.lat,
          lastKnownLng: d.lng,
          lastTempC: d.tempC,
          progressPct: d.progressPct,
          ...(d.status ? { status: d.status } : {}),
        },
      }),
    );

    if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });

    // Push to any browser watching this shipment.
    if (d.lat != null && d.lng != null) {
      publish(d.shipmentId, { event: 'position', data: { lat: d.lat, lng: d.lng, ts: d.ts, progressPct: d.progressPct } });
    }
    if (d.tempC != null) {
      publish(d.shipmentId, { event: 'temperature', data: { tempC: d.tempC, ts: d.ts } });
    }
    return { ok: true };
  });

  /**
   * Phase 5 — the pre-arrival warning. §11's 2:30 beat:
   * "The hospital knows the insulin is compromised before the truck reaches
   * the gate."
   */
  app.post('/shipment-excursion', { preHandler: verifyHmac }, async (req, reply) => {
    const d = unwrap(req.body) as {
      shipmentId?: string;
      excursionId?: string;
      severity?: string;
      startedAt?: string;
      endedAt?: string;
      minTempC?: number;
      maxTempC?: number;
      durationMin?: number;
    };
    if (!d.shipmentId || !d.severity) return reply.code(400).send({ error: 'invalid_payload' });

    const outcome = await once(req.medtrackEventId!, async () =>
      prisma.incomingShipment.updateMany({
        where: { id: d.shipmentId! },
        // anomalyFlag drives the warning banner in the UI.
        data: { anomalyFlag: true, ...(d.maxTempC != null ? { lastTempC: d.maxTempC } : {}) },
      }),
    );

    if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });

    publish(d.shipmentId, {
      event: 'excursion',
      data: {
        excursionId: d.excursionId,
        severity: d.severity,
        startedAt: d.startedAt,
        endedAt: d.endedAt,
        minTempC: d.minTempC,
        maxTempC: d.maxTempC,
        durationMin: d.durationMin,
        closed: Boolean(d.endedAt),
      },
    });

    req.log.warn(
      { shipmentId: d.shipmentId, severity: d.severity, maxTempC: d.maxTempC },
      'cold-chain excursion reported by supplier',
    );
    return { ok: true };
  });

  /** Phase 6 — complaint status + the manufacturer's RCA, pushed down. */
  app.post('/complaint-status', { preHandler: verifyHmac }, async (req, reply) => {
    const d = unwrap(req.body) as {
      complaintId?: string;
      status?: string;
      rcaSummary?: string;
    };
    if (!d.complaintId || !d.status) return reply.code(400).send({ error: 'invalid_payload' });

    const outcome = await once(req.medtrackEventId!, async () =>
      // Match on the remote id we stored when filing. updateMany rather than
      // update so an unknown id is a no-op instead of a 500.
      prisma.localComplaint.updateMany({
        where: { remoteId: d.complaintId },
        data: { remoteStatus: d.status!, rcaSummary: d.rcaSummary },
      }),
    );

    if (outcome.duplicate) return reply.code(200).send({ ok: true, duplicate: true });

    req.log.info({ complaintId: d.complaintId, status: d.status }, 'complaint status changed');
    return { ok: true };
  });
}
