/**
 * Dhanvantari frontend → dhanvantari-api client.
 *
 * ARCHITECTURE.md §5.
 *
 * The frontend is UI-only. It never touches Prisma, never holds the HMAC
 * shared secret, and never calls Vayu directly — all cross-organisation
 * traffic goes through backend/dhanvantari-api.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_DHANVANTARI_API_URL ?? 'http://localhost:4001';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Subscribe to an incoming shipment's live updates.
 *
 * Cross-origin SSE — the API server's CORS config must allow this origin.
 * Reconnect client-side; don't let a long judging session silently die. §5.3
 */
export function streamShipment(shipmentId: string): EventSource {
  return new EventSource(`${API_URL}/api/stream/shipments/${shipmentId}`);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Drug {
  id: string;
  name: string;
  genericName: string | null;
  nlemCode: string | null;
  category: string | null;
  packSize: string | null;
  coldChain: boolean;
  unitPrice: number | null;
}

export interface InventoryRow {
  id: string;
  drugId: string;
  batchRef: string | null;
  qtyOnHand: number;
  reorderPoint: number;
  expiryDate: string | null;
  location: string | null;
  updatedAt: string;
  drug: Drug;
  lowStock?: boolean;
  daysToExpiry?: number | null;
}

export interface Dispense {
  id: string;
  drugId: string;
  batchRef: string | null;
  qty: number;
  dispensedAt: string;
  dispensedBy: string | null;
  patientRef: string | null;
  drug?: { id: string; name: string };
}

export interface ConsumptionRow {
  drugId: string;
  drug: string;
  dispensed: number;
  prior: number;
  deltaPct: number | null;
}

export interface IncomingShipment {
  id: string;
  supplyOrderId: string | null;
  status: string;
  etaAt: string | null;
  coldChain: boolean;
  anomalyFlag: boolean;
  lastKnownLat: number | null;
  lastKnownLng: number | null;
  lastTempC: number | null;
  progressPct: number | null;
  updatedAt: string;
  batchCount?: number;
  late?: boolean;
  receivedBatches?: ReceivedBatch[];
}

export interface ReceivedBatch {
  id: string;
  incomingShipmentId: string | null;
  drugRef: string | null;
  qtyExpected: number | null;
  qtyReceived: number | null;
  conditionPhotoUrls: string[];
  scannedAt: string;
  scannedBy: string | null;
  accepted: boolean;
}

export interface LocalComplaint {
  id: string;
  batchId: string | null;
  shipmentId: string | null;
  category: string;
  description: string | null;
  photoUrls: string[];
  filedAt: string;
  remoteId?: string | null;
  remoteStatus: string | null;
  rcaSummary: string | null;
}

export interface OrderRow {
  supplyOrderId: string | null;
  placedAt: string;
  lines: Array<{ drugId: string; qtyRequested: number }>;
  deliveryStatus: string | null;
  etaAt: string | null;
  shipmentId: string | null;
  coldChain: boolean | null;
  anomalyFlag: boolean;
  syncStatus: string;
}

export interface SupplierScorecard {
  supplier: { id: string; name: string };
  metrics: {
    onTimePct: number | null;
    rejectionRatePct: number | null;
    excursionRate: number | null;
    shortfallPct: number | null;
  };
  basis: Record<string, number>;
  computedAt: string;
  note: string;
}

export interface AssistantAnswer {
  question: string;
  intent: string;
  answer: string;
  narration: 'llm' | 'template';
  evidence: { intent: string; summary: string; data: unknown };
  ms: number;
}

export interface ResolvedBatch {
  batchId: string;
  shipmentId: string | null;
  drugRef: string | null;
  qtyExpected: number | null;
  qtyReceived: number | null;
  accepted: boolean;
  coldChain: boolean;
  anomalyFlag: boolean;
  lastTempC: number | null;
  drug: Pick<Drug, 'id' | 'name' | 'genericName' | 'coldChain'> | null;
}

// ─── Endpoint helpers ────────────────────────────────────────────────────────

export const getInventory = (q = '') =>
  api<{ items: InventoryRow[]; total: number }>(`/api/inventory${q}`);

export const getExpiring = (days = 60) =>
  api<{ windowDays: number; items: InventoryRow[]; valueAtRisk: number }>(
    `/api/inventory/expiring?days=${days}`,
  );

export const getDispenses = (q = '') =>
  api<{ items: Dispense[]; total: number }>(`/api/pos/dispenses${q}`);

export const getConsumption = (months = 2) =>
  api<{ windowMonths: number; items: ConsumptionRow[] }>(
    `/api/pos/consumption?months=${months}`,
  );

export const dispense = (body: {
  drugId: string;
  qty: number;
  batchRef?: string;
  dispensedBy?: string;
  patientRef?: string;
}) =>
  api<{ ok: boolean; dispenseId: string; qtyOnHand: number; lowStock: boolean }>(
    '/api/pos/dispense',
    { method: 'POST', body: JSON.stringify(body) },
  );

export const getOrders = (q = '') =>
  api<{ items: OrderRow[]; total: number }>(`/api/orders${q}`);

export const getDelayed = () => api<{ items: IncomingShipment[] }>('/api/orders/delayed');

export const reorder = (body: { inventoryId: string; institutionId: string; drugRef: string }) =>
  api<{ ok: boolean; supplyOrderId: string; drug: string; qtyRequested: number }>(
    '/api/orders/reorder',
    { method: 'POST', body: JSON.stringify(body) },
  );

export const getIncoming = () =>
  api<{ items: IncomingShipment[] }>('/api/shipments/incoming');

export const resolveQr = (qr: string) =>
  api<ResolvedBatch>(`/api/batches/resolve?qr=${encodeURIComponent(qr)}`);

export const confirmReceipt = (body: {
  shipmentId: string;
  scannedBy?: string;
  batches: Array<{
    batchId: string;
    qtyExpected?: number;
    qtyReceived: number;
    accepted: boolean;
    conditionPhotoUrls?: string[];
  }>;
}) =>
  api<{ ok: boolean; shipmentId: string; status: string }>('/api/shipments/confirm-receipt', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getComplaints = () => api<{ items: LocalComplaint[] }>('/api/complaints');

export const fileComplaint = (body: {
  batchId?: string;
  shipmentId?: string;
  institutionId: string;
  category: string;
  description?: string;
  photoUrls?: string[];
}) =>
  api<{ ok: boolean; complaintId: string; status: string }>('/api/complaints', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getScorecard = () => api<SupplierScorecard>('/api/supplier-scorecard');

export const askAssistant = (question: string) =>
  api<AssistantAnswer>('/api/assistant/query', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });

/**
 * Multi-line supply order — POST /api/orders. Unlike `reorder` (one line,
 * forecast-backed, immediate), this places an editable, human-reviewed draft
 * with any number of lines in a single request.
 */
export const placeOrder = (body: {
  institutionId: string;
  requestedWindow?: string;
  lines: Array<{ drugId: string; qtyRequested: number }>;
}) =>
  api<{ ok: boolean; supplyOrderId: string; status: string }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
