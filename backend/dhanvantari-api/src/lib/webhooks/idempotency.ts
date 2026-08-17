/**
 * Idempotency guard for inbound webhooks.
 *
 * ARCHITECTURE.md §5.2. README §8 (non-negotiable). Part 2.
 *
 * "Store every seen X-MedTrack-Event-Id. Duplicate → return 200 and do nothing.
 * Webhooks retry; without this you get double stock entries on stage."
 *
 * WHY INSERT-AND-CATCH, NOT CHECK-THEN-INSERT: a `findUnique` followed by a
 * `create` has a race window. Two concurrent redeliveries of the same event both
 * read "not seen", both proceed, and the stock movement is applied twice.
 * Attempting the insert first and treating a unique-constraint violation (P2002)
 * as proof someone else won makes the check atomic — the database arbitrates.
 */

import pkg from '../../../node_modules/.prisma/client/index.js';

import { prisma } from '../prisma.js';

const { Prisma } = pkg as {
  Prisma: { PrismaClientKnownRequestError: new (...a: never[]) => Error & { code: string } };
};

/**
 * Claim an event id.
 *
 * @returns `true` if this call claimed it (do the work),
 *          `false` if it was already processed (no-op and 200).
 */
export async function claimEvent(eventId: string): Promise<boolean> {
  try {
    await prisma.processedEvent.create({ data: { eventId } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false; // already processed
    }
    throw err;
  }
}

/**
 * Run `work` at most once for a given event id.
 *
 * If `work` throws, the claim is released so a legitimate retry can succeed —
 * otherwise a transient DB blip would permanently swallow the event.
 */
export async function once<T>(
  eventId: string,
  work: () => Promise<T>,
): Promise<{ duplicate: true } | { duplicate: false; result: T }> {
  const claimed = await claimEvent(eventId);
  if (!claimed) return { duplicate: true };

  try {
    return { duplicate: false, result: await work() };
  } catch (err) {
    await prisma.processedEvent
      .delete({ where: { eventId } })
      .catch(() => undefined); // best effort; the original error matters more
    throw err;
  }
}
