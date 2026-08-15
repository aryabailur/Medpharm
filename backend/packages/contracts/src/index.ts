/**
 * @medtrack/contracts — shared Zod schemas for EVERY cross-app payload.
 *
 * ARCHITECTURE.md §5, §8.
 *
 * This package is NOT OPTIONAL. Both apps import these schemas, so a payload
 * change breaks the build instead of breaking the demo.
 *
 * Keep `medpharm-app/lib/contracts.ts` in sync with this file. Drift between
 * the two repos is the most likely source of a silent runtime failure.
 *
 * SCAFFOLD: shapes below follow §4 and §5. Extend as phases land.
 */

import { z } from 'zod';

// ─── Shared identity (§4.1) ──────────────────────────────────────────────────
// batchId, shipmentId, supplyOrderId are UUIDv7, global and immutable.
// Neither app ever guesses an ID; it only echoes one it received.

export const UuidSchema = z.string().uuid();

// ─── Enums (mirror the Prisma schemas) ───────────────────────────────────────

export const ShipmentStatusSchema = z.enum([
  'DRAFT',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
]);

export const SupplyOrderStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'PARTIAL',
  'REJECTED',
  'DISPATCHED',
  'DELIVERED',
]);

export const ExcursionSeveritySchema = z.enum(['MINOR', 'MAJOR', 'CRITICAL']);

export const ComplaintCategorySchema = z.enum([
  'BREAKAGE',
  'QTY_MISMATCH',
  'SEAL_TAMPERED',
  'TEMP_DAMAGE',
  'WRONG_ITEM',
  'NEAR_EXPIRY',
]);

// ─── D → V: institution calls manufacturer (§5.1) ────────────────────────────

/** POST /api/orders/incoming */
export const PlaceOrderSchema = z.object({
  supplyOrderId: UuidSchema,
  institutionId: z.string(),
  requestedWindow: z.string().optional(),
  lines: z
    .array(
      z.object({
        drugId: z.string(),
        qtyRequested: z.number().int().positive(),
      }),
    )
    .min(1),
});

/** POST /api/complaints/incoming */
export const FileComplaintSchema = z.object({
  batchId: UuidSchema.optional(),
  shipmentId: UuidSchema.optional(),
  institutionId: z.string(),
  category: ComplaintCategorySchema,
  description: z.string().optional(),
  photoUrls: z.array(z.string().url()).default([]),
});

/** POST /api/consumption/report */
export const ConsumptionReportSchema = z.object({
  institutionId: z.string(),
  periodMonth: z.string(), // YYYY-MM
  rows: z.array(
    z.object({
      drugId: z.string(),
      opening: z.number().int().optional(),
      received: z.number().int().optional(),
      dispensed: z.number().int().optional(),
      closing: z.number().int().optional(),
    }),
  ),
});

/** POST /api/shipments/:id/confirm-receipt */
export const ConfirmReceiptSchema = z.object({
  shipmentId: UuidSchema,
  scannedBy: z.string().optional(),
  batches: z.array(
    z.object({
      batchId: UuidSchema,
      qtyExpected: z.number().int().optional(),
      qtyReceived: z.number().int(),
      accepted: z.boolean(),
      conditionPhotoUrls: z.array(z.string().url()).default([]),
    }),
  ),
});

// ─── V → D: manufacturer webhooks to institution (§5.1) ──────────────────────

export const OrderStatusChangedSchema = z.object({
  supplyOrderId: UuidSchema,
  status: SupplyOrderStatusSchema,
  rejectionReason: z.string().optional(),
});

export const ShipmentDispatchedSchema = z.object({
  shipmentId: UuidSchema,
  supplyOrderId: UuidSchema,
  etaAt: z.string().datetime().optional(),
  coldChain: z.boolean(),
  routePolyline: z.string().optional(),
  manifest: z.array(
    z.object({
      batchId: UuidSchema,
      drugRef: z.string(),
      quantity: z.number().int(),
    }),
  ),
});

/** Throttled to a 10s cadence — not every ingest tick. */
export const ShipmentTelemetrySchema = z.object({
  shipmentId: UuidSchema,
  ts: z.string().datetime(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  tempC: z.number().optional(),
  progressPct: z.number().min(0).max(1).optional(),
  status: ShipmentStatusSchema.optional(),
});

/** The pre-arrival cold-chain warning — the 2:30 demo beat. */
export const ShipmentExcursionSchema = z.object({
  shipmentId: UuidSchema,
  excursionId: z.string(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  minTempC: z.number().optional(),
  maxTempC: z.number().optional(),
  durationMin: z.number().optional(),
  severity: ExcursionSeveritySchema,
});

export const ComplaintStatusChangedSchema = z.object({
  complaintId: z.string(),
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED']),
  rcaSummary: z.string().optional(),
});

// ─── Sensor ingest (§6.1) ────────────────────────────────────────────────────
// Identical shape whether the sender is the simulator or an ESP32+DS18B20+GPS.
// Swapping in real hardware requires zero code change.

export const SensorIngestSchema = z.object({
  deviceId: z.string(),
  shipmentId: UuidSchema,
  ts: z.string().datetime(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  tempC: z.number().optional(),
  humidity: z.number().optional(),
  battery: z.number().optional(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlaceOrder = z.infer<typeof PlaceOrderSchema>;
export type FileComplaint = z.infer<typeof FileComplaintSchema>;
export type ConsumptionReport = z.infer<typeof ConsumptionReportSchema>;
export type ConfirmReceipt = z.infer<typeof ConfirmReceiptSchema>;
export type OrderStatusChanged = z.infer<typeof OrderStatusChangedSchema>;
export type ShipmentDispatched = z.infer<typeof ShipmentDispatchedSchema>;
export type ShipmentTelemetry = z.infer<typeof ShipmentTelemetrySchema>;
export type ShipmentExcursion = z.infer<typeof ShipmentExcursionSchema>;
export type ComplaintStatusChanged = z.infer<typeof ComplaintStatusChangedSchema>;
export type SensorIngest = z.infer<typeof SensorIngestSchema>;
