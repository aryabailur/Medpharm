/**
 * Signed webhook delivery + retry worker.
 *
 * ARCHITECTURE.md §5.2. README §8 (non-negotiable). Part 2.
 *
 * "OutboundEvent table + a worker that retries 1s, 4s, 16s, 60s then parks as
 * FAILED with a manual replay button in an admin panel. When the demo wifi
 * drops for 3 seconds, this is what saves you."
 *
 * Producers (order approval, sensor ingest) only INSERT rows — they never send
 * inline. That keeps the status change and its notification in one
 * transaction, so neither can exist without the other.
 */

import { EVENT_ID_HEADER, signedHeaders } from '@medtrack/crypto';
import { randomUUID } from 'node:crypto';

import { prisma } from '../prisma.js';

/** Backoff schedule in ms (§5.2). Index = attempts already made. */
export const BACKOFF_MS = [1_000, 4_000, 16_000, 60_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length;

const TIMEOUT_MS = 5_000;

function secret(): string {
  const s = process.env.MEDTRACK_SHARED_SECRET;
  if (!s) throw new Error('MEDTRACK_SHARED_SECRET is not set — cannot sign outbound webhooks');
  return s;
}

/**
 * Deliver one event. The event id is stable across retries so the receiver's
 * idempotency guard recognises a redelivery as a duplicate rather than a new
 * event (§5.2).
 */
export async function deliver(event: {
  id: string;
  type: string;
  targetUrl: string;
  payloadJson: unknown;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify({ type: event.type, data: event.payloadJson });
  const headers = signedHeaders(secret(), body, event.id);
  headers[EVENT_ID_HEADER] = event.id;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(event.targetUrl, {
      method: 'POST',
      headers,
      body,
      signal: ctrl.signal,
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drain due events once. Returns how many were sent and how many failed.
 * Called on an interval by `startRetryWorker`.
 */
export async function drainOnce(log?: {
  info: (o: unknown, m: string) => void;
  warn: (o: unknown, m: string) => void;
}): Promise<{ sent: number; failed: number }> {
  const due = await prisma.outboundEvent.findMany({
    where: { status: 'PENDING', nextRetryAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  let sent = 0;
  let failed = 0;

  for (const ev of due) {
    const result = await deliver({
      id: ev.id,
      type: ev.type,
      targetUrl: ev.targetUrl,
      payloadJson: ev.payloadJson,
    });

    if (result.ok) {
      await prisma.outboundEvent.update({
        where: { id: ev.id },
        data: { status: 'SENT', attempts: { increment: 1 }, nextRetryAt: null },
      });
      sent++;
      continue;
    }

    const attempts = ev.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      // Park it. A human replays from the admin panel rather than losing it.
      await prisma.outboundEvent.update({
        where: { id: ev.id },
        data: { status: 'FAILED', attempts, nextRetryAt: null },
      });
      failed++;
      log?.warn({ eventId: ev.id, type: ev.type, attempts }, 'outbound event parked as FAILED');
    } else {
      await prisma.outboundEvent.update({
        where: { id: ev.id },
        data: {
          attempts,
          nextRetryAt: new Date(Date.now() + BACKOFF_MS[attempts]!),
        },
      });
    }
  }

  return { sent, failed };
}

let timer: NodeJS.Timeout | null = null;

export function startRetryWorker(
  log: { info: (o: unknown, m: string) => void; warn: (o: unknown, m: string) => void },
  intervalMs = 1_000,
): void {
  if (timer) return;
  timer = setInterval(() => {
    drainOnce(log).catch((err) => log.warn({ err: String(err) }, 'retry worker tick failed'));
  }, intervalMs);
  timer.unref?.();
}

export function stopRetryWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Manual replay for a parked event — the admin-panel button in §5.2. */
export async function replay(eventId: string): Promise<boolean> {
  const ev = await prisma.outboundEvent.findUnique({ where: { id: eventId } });
  if (!ev || ev.status !== 'FAILED') return false;
  await prisma.outboundEvent.update({
    where: { id: eventId },
    data: { status: 'PENDING', attempts: 0, nextRetryAt: new Date() },
  });
  return true;
}

export { randomUUID };
