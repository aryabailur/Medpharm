/**
 * MedTrack Mobile — API client.
 *
 * Points to the laptop's Fastify servers over local WiFi.
 * EXPO_PUBLIC_* vars are injected by Expo at build time.
 *
 * On physical device + Expo Go: both phone and laptop must be on the same
 * WiFi. The URLs in .env already point to the laptop's LAN IP.
 */

const VAYU_URL =
  process.env.EXPO_PUBLIC_VAYU_API_URL ?? 'http://10.131.201.104:4000';
const DHANVANTARI_URL =
  process.env.EXPO_PUBLIC_DHANVANTARI_API_URL ?? 'http://10.131.201.104:4001';

async function api<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const vayu = <T>(path: string, init?: RequestInit) => api<T>(VAYU_URL, path, init);
const dhan = <T>(path: string, init?: RequestInit) => api<T>(DHANVANTARI_URL, path, init);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Drug {
  id: string;
  name: string;
  genericName: string | null;
  nlemCode: string | null;
  coldChain: boolean;
  unitPrice: number | null;
  packSize: string | null;
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

export interface Dispense {
  id: string;
  drugId: string;
  qty: number;
  dispensedAt: string;
  dispensedBy: string | null;
  patientRef: string | null;
  drug?: { id: string; name: string };
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

export interface AssistantAnswer {
  question: string;
  intent: string;
  answer: string;
  narration: 'llm' | 'template';
  evidence: { intent: string; summary: string; data: unknown };
  ms: number;
}

// Vayu types
export interface VayuBatch {
  id: string;
  lotNumber: string;
  status: string;
  mfgDate: string;
  expiryDate: string;
  quantity: number;
  qrPayload: string | null;
  drug: { id: string; name: string; coldChain: boolean };
  qcRecords: Array<{ result: string; testedAt: string }>;
}

export interface VayuShipment {
  id: string;
  status: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  etaAt: string | null;
  lastTempC: number | null;
  progressPct: number | null;
  anomalyFlag?: boolean;
  institution: { id: string; name: string } | null;
}

export interface VayuOrder {
  id: string;
  supplyOrderId: string;
  status: string;
  placedAt: string;
  institution: { id: string; name: string } | null;
  lines: Array<{ drugId: string; qtyRequested: number }>;
}

export interface TelemetryPoint {
  ts: string;
  lat: number;
  lng: number;
  tempC: number;
}

export interface ResolvedVayuBatch {
  batchId: string;
  lotNumber: string;
  status: string;
  mfgDate: string;
  expiryDate: string;
  quantity: number;
  qcStatus: string | null;
  drug: {
    id: string;
    name: string;
    genericName: string | null;
    nlemCode: string | null;
    packSize: string | null;
    coldChain: boolean;
    minTempC: number | null;
    maxTempC: number | null;
  };
}

export interface VayuBatchDetail extends VayuBatch {
  shipmentBatch: Array<{
    shipmentId: string;
    shipment: { id: string; status: string; dispatchedAt: string | null; deliveredAt: string | null };
  }>;
}

export interface VayuExcursion {
  id: string;
  shipmentId: string;
  startedAt: string;
  endedAt: string | null;
  minTempC: number | null;
  maxTempC: number | null;
  durationMin: number | null;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  acknowledged: boolean;
}

export interface VayuShipmentDetail extends VayuShipment {
  excursions: VayuExcursion[];
}

// ─── Dhanvantari endpoints ────────────────────────────────────────────────────

export const getInventory = (q = '') =>
  dhan<{ items: InventoryRow[]; total: number }>(`/api/inventory${q}`);

export const getExpiring = (days = 90) =>
  dhan<{ windowDays: number; items: InventoryRow[]; valueAtRisk: number }>(
    `/api/inventory/expiring?days=${days}`,
  );

export const getIncoming = () =>
  dhan<{ items: IncomingShipment[] }>('/api/shipments/incoming');

export const getOrders = (q = '') =>
  dhan<{ items: OrderRow[]; total: number }>(`/api/orders${q}`);

export const getComplaints = () =>
  dhan<{ items: LocalComplaint[] }>('/api/complaints');

export const getDispenses = (q = '') =>
  dhan<{ items: Dispense[]; total: number }>(`/api/pos/dispenses${q}`);

export const dispense = (body: {
  drugId: string;
  qty: number;
  batchRef?: string;
  dispensedBy?: string;
  patientRef?: string;
}) =>
  dhan<{ ok: boolean; dispenseId: string; qtyOnHand: number; lowStock: boolean }>(
    '/api/pos/dispense',
    { method: 'POST', body: JSON.stringify(body) },
  );

export const resolveQr = (qr: string) =>
  dhan<ResolvedBatch>(`/api/batches/resolve?qr=${encodeURIComponent(qr)}`);

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
  dhan<{ ok: boolean; shipmentId: string; status: string }>('/api/shipments/confirm-receipt', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const fileComplaint = (body: {
  batchId?: string;
  shipmentId?: string;
  institutionId: string;
  category: string;
  description?: string;
}) =>
  dhan<{ ok: boolean; complaintId: string; status: string }>('/api/complaints', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const reorder = (body: { inventoryId: string; institutionId: string; drugRef: string }) =>
  dhan<{ ok: boolean; supplyOrderId: string; drug: string; qtyRequested: number }>(
    '/api/orders/reorder',
    { method: 'POST', body: JSON.stringify(body) },
  );

export const askAssistant = (question: string) =>
  dhan<AssistantAnswer>('/api/assistant/query', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });

// ─── Vayu endpoints ───────────────────────────────────────────────────────────

export const getVayuBatches = (q = '') =>
  vayu<{ items: VayuBatch[]; total: number }>(`/api/batches${q}`);

export const getVayuShipments = (q = '') =>
  vayu<{ items: VayuShipment[] }>(`/api/shipments${q}`);

export const getVayuOrders = (q = '') =>
  vayu<{ items: VayuOrder[]; total: number }>(`/api/orders${q}`);

export const getTelemetry = (shipmentId: string) =>
  vayu<{ points: TelemetryPoint[] }>(`/api/telemetry/${shipmentId}`);

export const resolveVayuQr = (qr: string) =>
  vayu<ResolvedVayuBatch>(`/api/batches/resolve?qr=${encodeURIComponent(qr)}`);

export const getVayuBatch = (id: string) =>
  vayu<VayuBatchDetail>(`/api/batches/${id}`);

export const getVayuShipment = (id: string) =>
  vayu<VayuShipmentDetail>(`/api/shipments/${id}`);
