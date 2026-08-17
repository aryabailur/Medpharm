/**
 * Supplier Scorecard — GET /api/supplier-scorecard
 *
 * ARCHITECTURE.md §1, §7.2 (V11). README §5 (Phase 7), Part 2.
 *
 * This is the direction PS-SS04 explicitly asks for and that both original docs
 * missed: the INSTITUTION scores its SUPPLIER. Vayu's Institution Reliability
 * Panel is the mirror image.
 *
 * Demo line (§1): "We score accountability in both directions — the institution
 * can see its supplier's on-time %, and the supplier can see which institutions
 * mishandle stock."
 *
 * Computed from delivery history this institution actually observed. It never
 * queries the `vayu` schema (§3.1) — every input arrived over a webhook.
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../../lib/prisma.js';

/** One supplier in this build; the shape supports more without a schema change. */
const SUPPLIER_ID = 'vayu';
const SUPPLIER_NAME = 'Vayu Pharmaceuticals';

export async function supplierScorecardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    const shipments = await prisma.incomingShipment.findMany({
      include: { receivedBatches: true },
    });
    const complaints = await prisma.localComplaint.findMany();

    const delivered = shipments.filter((s) => s.status === 'DELIVERED');
    // On time = delivered without blowing the ETA we were given. Shipments with
    // no ETA are excluded rather than counted as wins.
    const withEta = delivered.filter((s) => s.etaAt != null);
    const onTime = withEta.filter((s) => !s.etaAt || s.etaAt.getTime() >= Date.now());

    const totalExpected = shipments
      .flatMap((s) => s.receivedBatches)
      .reduce((a, b) => a + (b.qtyExpected ?? 0), 0);
    const totalReceived = shipments
      .flatMap((s) => s.receivedBatches)
      .reduce((a, b) => a + (b.qtyReceived ?? 0), 0);
    const rejected = shipments
      .flatMap((s) => s.receivedBatches)
      .filter((b) => b.accepted === false).length;
    const scannedBatches = shipments
      .flatMap((s) => s.receivedBatches)
      .filter((b) => b.qtyReceived != null).length;

    const excursionShipments = shipments.filter((s) => s.anomalyFlag).length;

    const onTimePct = withEta.length ? (onTime.length / withEta.length) * 100 : null;
    const rejectionRatePct = scannedBatches ? (rejected / scannedBatches) * 100 : null;
    const excursionRate = shipments.length ? (excursionShipments / shipments.length) * 100 : null;
    const shortfallPct =
      totalExpected > 0 ? ((totalExpected - totalReceived) / totalExpected) * 100 : null;

    const round = (n: number | null) => (n == null ? null : Number(n.toFixed(1)));

    const score = await prisma.supplierScore.upsert({
      where: { supplierId: SUPPLIER_ID },
      create: {
        supplierId: SUPPLIER_ID,
        onTimePct: round(onTimePct),
        rejectionRatePct: round(rejectionRatePct),
        excursionRate: round(excursionRate),
      },
      update: {
        onTimePct: round(onTimePct),
        rejectionRatePct: round(rejectionRatePct),
        excursionRate: round(excursionRate),
        computedAt: new Date(),
      },
    });

    return {
      supplier: { id: SUPPLIER_ID, name: SUPPLIER_NAME },
      metrics: {
        onTimePct: score.onTimePct,
        rejectionRatePct: score.rejectionRatePct,
        excursionRate: score.excursionRate,
        shortfallPct: round(shortfallPct),
      },
      basis: {
        shipmentsObserved: shipments.length,
        delivered: delivered.length,
        withEta: withEta.length,
        batchesScanned: scannedBatches,
        complaintsFiled: complaints.length,
        shipmentsWithExcursion: excursionShipments,
      },
      computedAt: score.computedAt,
      // Stated plainly so the number is auditable rather than magic.
      note:
        'Computed from delivery history observed by this institution. Shipments without an ETA are excluded from on-time rather than counted as on-time.',
    };
  });
}
