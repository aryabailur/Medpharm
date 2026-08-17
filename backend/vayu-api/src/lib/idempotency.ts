/**
 * Idempotency guard for inbound webhook/contract calls.
 *
 * ARCHITECTURE.md §5.2. README §8 (non-negotiable).
 *
 * "Store every seen X-MedTrack-Event-Id. Duplicate → return 200 and do
 * nothing. Webhooks retry; without this you get double stock entries on
 * stage."
 *
 * WHY INSERT-AND-CATCH, NOT CHECK-THEN-INSERT: a `findUnique` followed by a
 * `create` has a race window. Two concurrent retries of the same event both
 * read "not seen", both proceed, and the order is applied twice. Instead we
 * attempt the insert first and treat a unique-constraint violation (P2002) as
 * proof that someone else got there first. The database arbitrates, so the
 * check is atomic.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * Claim an event id.
 *
 * @returns `true` if this call claimed it (caller should do the work),
 *          `false` if it was already processed (caller should no-op and 200).
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
 * On a duplicate, returns `{ duplicate: true }` without running `work`.
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
