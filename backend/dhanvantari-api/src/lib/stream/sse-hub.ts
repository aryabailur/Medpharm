/**
 * In-process SSE fan-out.
 *
 * ARCHITECTURE.md §5.3. Part 2.
 *
 * Webhook receivers publish here; every browser subscribed to that shipment
 * gets the event. Deliberately in-memory: a single Fastify process serves the
 * demo, and Redis pub/sub would be infrastructure with no payoff at this scale.
 * (Multi-instance deploys would need a shared broker — noted, not needed.)
 */

export type StreamEventName = 'position' | 'temperature' | 'excursion' | 'status';

export interface StreamEvent {
  event: StreamEventName;
  data: unknown;
}

type Subscriber = (e: StreamEvent) => void;

const channels = new Map<string, Set<Subscriber>>();

export function subscribe(shipmentId: string, fn: Subscriber): () => void {
  let subs = channels.get(shipmentId);
  if (!subs) {
    subs = new Set();
    channels.set(shipmentId, subs);
  }
  subs.add(fn);

  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) channels.delete(shipmentId);
  };
}

export function publish(shipmentId: string, e: StreamEvent): void {
  const subs = channels.get(shipmentId);
  if (!subs) return;
  for (const fn of subs) {
    // One bad subscriber must not stop the others.
    try {
      fn(e);
    } catch {
      /* dropped */
    }
  }
}

export function subscriberCount(shipmentId: string): number {
  return channels.get(shipmentId)?.size ?? 0;
}
