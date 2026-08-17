/**
 * Expo client endpoints — the mobile app's entire API surface.
 *
 * ARCHITECTURE.md §2.1, §5.1, §6.6. README §5 (Phase 6), Part 2.
 *
 * NON-NEGOTIABLE (README §8): the Expo app talks ONLY to this server. Nothing
 * here may require the mobile client to know that `vayu-api` exists, or to hold
 * the HMAC secret — a shared secret in a mobile bundle is not a secret. This
 * server does the signing and the forwarding.
 *
 * Also serves the web frontend; these are not mobile-exclusive.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { enqueue } from '../../lib/outbound/queue.js';
import { prisma } from '../../lib/prisma.js';

const ConfirmReceiptBody = z.object({
  shipmentId: z.string().min(1),
  scannedBy: z.string().optional(),
  batches: z
    .array(
      z.object({
        batchId: z.string().min(1),
        qtyExpected: z.number().int().optional(),
        qtyReceived: z.number().int().min(0),
        accepted: z.boolean(),
        conditionPhotoUrls: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

const ComplaintBody = z.object({
  batchId: z.string().optional(),
  shipmentId: z.string().optional(),
  institutionId: z.string().min(1),
  category: z.enum([
    'BREAKAGE',
    'QTY_MISMATCH',
    'SEAL_TAMPERED',
    'TEMP_DAMAGE',
    'WRONG_ITEM',
    'NEAR_EXPIRY',
  ]),
  description: z.string().optional(),
  photoUrls: z.array(z.string()).default([]),
});

export async function expoRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Tier 1 of the capture ladder (§2.1) — scan a QR, get everything.
   *
   * Resolves from what the manifest already told us (ReceivedBatch), not from
   * Vayu: the scan must work at a receiving dock with poor connectivity.
   */
  app.get<{ Querystring: { qr?: string } }>('/batches/resolve', async (req, reply) => {
    const qr = req.query.qr?.trim();
    if (!qr) return reply.code(400).send({ error: 'missing_qr' });

    // A Vayu QR payload looks like MT|B|<code>|<lot>; the batchId may also be
    // scanned directly. Try both.
    const parts = qr.split('|');
    const candidates = [qr, parts[parts.length - 1], parts[2]].filter(Boolean) as string[];

    const batch = await prisma.receivedBatch.findFirst({
      where: { OR: candidates.map((c) => ({ id: c })) },
      include: { incomingShipment: true },
    });

    if (!batch) {
      return reply.code(404).send({
        error: 'not_found',
        hint: 'Batch is not on any manifest received by this institution.',
      });
    }

    const drug = batch.drugRef
      ? await prisma.drug.findFirst({ where: { name: { contains: batch.drugRef, mode: 'insensitive' } } })
      : null;

    return {
      batchId: batch.id,
      shipmentId: batch.incomingShipmentId,
      drugRef: batch.drugRef,
      qtyExpected: batch.qtyExpected,
      qtyReceived: batch.qtyReceived,
      accepted: batch.accepted,
      scannedAt: batch.scannedAt,
      coldChain: batch.incomingShipment?.coldChain ?? drug?.coldChain ?? false,
      // The pre-arrival warning: if the shipment breached its band in transit,
      // the worker sees it before accepting the stock (§11, 2:30).
      anomalyFlag: batch.incomingShipment?.anomalyFlag ?? false,
      lastTempC: batch.incomingShipment?.lastTempC ?? null,
      drug: drug
        ? { id: drug.id, name: drug.name, genericName: drug.genericName, coldChain: drug.coldChain }
        : null,
    };
  });

  /** Incoming shipments, for the mobile list and the web dashboard. */
  app.get('/shipments/incoming', async () => {
    const rows = await prisma.incomingShipment.findMany({
      orderBy: [{ anomalyFlag: 'desc' }, { etaAt: 'asc' }],
      include: { receivedBatches: true },
    });
    return {
      items: rows.map((s) => ({
        ...s,
        batchCount: s.receivedBatches.length,
        late: s.etaAt ? s.etaAt.getTime() < Date.now() && s.status !== 'DELIVERED' : false,
      })),
    };
  });

  /**
   * Scan-in complete. Records what was counted, then forwards to Vayu through
   * the retry queue — the mobile client never signs anything itself.
   */
  app.post('/shipments/confirm-receipt', async (req, reply) => {
    const parsed = ConfirmReceiptBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const p = parsed.data;

    const shipment = await prisma.incomingShipment.findUnique({ where: { id: p.shipmentId } });
    if (!shipment) return reply.code(404).send({ error: 'unknown_shipment' });

    await prisma.$transaction(async (tx) => {
      for (const b of p.batches) {
        // Deduplicate on batchId (§6.6): a replayed offline queue must not
        // double-count stock. Upsert makes the write idempotent by construction.
        await tx.receivedBatch.upsert({
          where: { id: b.batchId },
          create: {
            id: b.batchId,
            incomingShipmentId: p.shipmentId,
            qtyExpected: b.qtyExpected,
            qtyReceived: b.qtyReceived,
            conditionPhotoUrls: b.conditionPhotoUrls,
            scannedBy: p.scannedBy,
            accepted: b.accepted,
          },
          update: {
            qtyReceived: b.qtyReceived,
            conditionPhotoUrls: b.conditionPhotoUrls,
            scannedBy: p.scannedBy,
            accepted: b.accepted,
            scannedAt: new Date(),
          },
        });
      }

      await tx.incomingShipment.update({
        where: { id: p.shipmentId },
        data: { status: 'DELIVERED' },
      });

      await enqueue(tx, 'shipment.confirm_receipt', {
        shipmentId: p.shipmentId,
        scannedBy: p.scannedBy,
        batches: p.batches,
      }, { shipmentId: p.shipmentId });
    });

    req.log.info({ shipmentId: p.shipmentId, batches: p.batches.length }, 'receipt confirmed');
    return { ok: true, shipmentId: p.shipmentId, status: 'DELIVERED' };
  });

  /**
   * File a complaint. Pre-linked by construction — batchId and shipmentId come
   * from the scan, so the worker types nothing (§11, 3:20).
   */
  app.post('/complaints', async (req, reply) => {
    const parsed = ComplaintBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const c = parsed.data;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.localComplaint.create({
        data: {
          batchId: c.batchId,
          shipmentId: c.shipmentId,
          category: c.category,
          description: c.description,
          photoUrls: c.photoUrls,
          remoteStatus: 'PENDING_SYNC',
        },
      });

      await enqueue(tx, 'complaint.file', {
        batchId: c.batchId,
        shipmentId: c.shipmentId,
        institutionId: c.institutionId,
        category: c.category,
        description: c.description,
        photoUrls: c.photoUrls,
      });

      return row;
    });

    req.log.info({ complaintId: created.id, category: c.category }, 'complaint filed');
    return reply.code(201).send({ ok: true, complaintId: created.id, status: 'PENDING_SYNC' });
  });

  /** V9/V10 — the institution's own complaints, with the RCA pushed down. */
  app.get('/complaints', async () => {
    const items = await prisma.localComplaint.findMany({ orderBy: { filedAt: 'desc' } });
    return { items };
  });
}
