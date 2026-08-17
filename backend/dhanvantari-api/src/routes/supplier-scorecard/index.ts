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

    // On time = the batches were scanned in on or before the promised ETA.
    //
    // `IncomingShipment` has no deliveredAt column -- this side only learns of
    // delivery when a worker scans the stock in -- so the scan-in timestamp on
    // the shipment's batches IS the delivery time, and it is the honest one to
    // measure against: it is when the institution actually took custody.
    //
    // Shipments with no ETA, or none scanned in, are EXCLUDED rather than
    // counted as wins. A scorecard that flatters the supplier is worthless.
    const withEta = delivered.filter(
      (s) => s.etaAt != null && s.receivedBatches.some((b) => b.scannedAt != null),
    );
    const onTime = withEta.filter((s) => {
      const scannedAt = Math.min(
        ...s.receivedBatches.filter((b) => b.scannedAt).map((b) => b.scannedAt.getTime()),
      );
      return scannedAt <= s.etaAt!.getTime();
    });

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
