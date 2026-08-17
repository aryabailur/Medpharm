/**
 * Outbound event queue — institution → supplier.
 *
 * ARCHITECTURE.md §5.2. README §8 (non-negotiable). Part 1.
 *
 * Producers only INSERT rows; the sender drains them. Enqueue happens in the
 * same transaction as the local state change, so a placed order can never exist
 * without its notification to Vayu, or vice versa.
 */

import type { PrismaClient } from '@prisma/client';

import { prisma } from '../prisma.js';

const VAYU_URL = process.env.VAYU_API_URL ?? 'http://localhost:4000';

/**
 * The transaction client handed to a `prisma.$transaction` callback. Derived
 * from Prisma's own type rather than hand-written, so a schema change surfaces
 * here as a type error instead of a runtime surprise.
 */
type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

export type OutboundType =
  | 'order.place'
  | 'complaint.file'
  | 'consumption.report'
  | 'shipment.confirm_receipt';

/** Each outbound type maps to exactly one vayu-api inbound route (§5.1). */
export function targetFor(type: OutboundType, params: { shipmentId?: string } = {}): string {
  switch (type) {
    case 'order.place':
      return `${VAYU_URL}/api/orders/incoming`;
    case 'complaint.file':
      return `${VAYU_URL}/api/complaints/incoming`;
    case 'consumption.report':
      return `${VAYU_URL}/api/consumption/report`;
    case 'shipment.confirm_receipt':
      return `${VAYU_URL}/api/shipments/${params.shipmentId}/confirm-receipt`;
  }
}

/**
 * Enqueue inside an existing transaction.
 *
 * `tx` is the transaction client from `prisma.$transaction` — passing it in is
 * what makes the state change and the notification atomic.
 */
export async function enqueue(
  tx: Tx,
  type: OutboundType,
  payload: unknown,
  params: { shipmentId?: string } = {},
): Promise<void> {
  await tx.outboundEvent.create({
    data: {
      type,
      targetUrl: targetFor(type, params),
      payloadJson: payload as object,
      status: 'PENDING',
      nextRetryAt: new Date(),
    },
  });
}

/** Enqueue outside a transaction, when there is no local state change to pair with. */
export async function enqueueStandalone(
  type: OutboundType,
  payload: unknown,
  params: { shipmentId?: string } = {},
): Promise<void> {
  await enqueue(prisma, type, payload, params);
}
