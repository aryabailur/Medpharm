/**
 * Vayu frontend → vayu-api client.
 *
 * ARCHITECTURE.md §5.
 *
 * The frontend is UI-only. It never touches Prisma, never holds the HMAC
 * shared secret, and never calls the other organisation directly — all of
 * that lives in backend/vayu-api.
 *
 * SCAFFOLD — Phase 0.
 */

export const API_URL = process.env.NEXT_PUBLIC_VAYU_API_URL ?? 'http://localhost:4000';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Subscribe to a shipment's live telemetry.
 *
 * Cross-origin SSE — the API server's CORS config must allow this origin.
 * Reconnect client-side; don't let a long judging session silently die. §5.3
 */
export function streamShipment(shipmentId: string): EventSource {
  return new EventSource(`${API_URL}/api/stream/shipments/${shipmentId}`, {
    withCredentials: true,
  });
}
