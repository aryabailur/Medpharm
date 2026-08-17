/**
 * Vayu frontend → vayu-api client.
 *
 * ARCHITECTURE.md §5.
 *
 * The frontend is UI-only. It never touches Prisma, never holds the HMAC
 * shared secret, and never calls the other organisation directly — all of
 * that lives in backend/vayu-api.
 */

export const API_URL = process.env.NEXT_PUBLIC_VAYU_API_URL ?? 'http://localhost:4000';

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

// ─── Shared response shapes ──────────────────────────────────────────────────

export interface Paged<T> {
  items: T[];
  total: number;
  take: number;
  skip: number;
}

export interface Drug {
  id: string;
  name: string;
  genericName: string | null;
  nlemCode: string | null;
  category: string | null;
  packSize: string | null;
  coldChain: boolean;
  minTempC: number | null;
  maxTempC: number | null;
}

export interface Batch {
  id: string;
  drugId: string;
  lotNumber: string;
  mfgDate: string;
  expiryDate: string;
  quantity: number;
  qrPayload: string | null;
  status: string;
  drug?: Pick<Drug, 'id' | 'name' | 'coldChain'>;
  qcRecords?: QCRecord[];
}

export interface QCRecord {
  id: string;
  batchId: string;
  result: 'PASS' | 'FAIL';
  inspector: string | null;
  notes: string | null;
  testedAt: string;
}

export interface OrderLine {
  id: string;
  drugId: string;
  qtyRequested: number;
  qtyApproved: number | null;
  drug?: { id: string; name: string };
}

export interface SupplyOrder {
  id: string;
  institutionId: string;
  status: string;
  requestedWindow: string | null;
  rejectionReason: string | null;
  placedAt: string;
  ageHours?: number;
  institution?: { id: string; name: string; type?: string; district: string | null };
  lines: OrderLine[];
}

export interface Shipment {
  id: string;
  supplyOrderId: string;
  status: string;
  coldChain: boolean;
  excursionCount: number;
  dispatchedAt: string | null;
  etaAt: string | null;
  deliveredAt: string | null;
  lastKnownLat: number | null;
  lastKnownLng: number | null;
  lastTempC: number | null;
  progressPct: number | null;
  supplyOrder?: { institution?: { id: string; name: string; district: string | null } };
  _count?: { excursions: number; batches: number };
}

export interface Excursion {
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

export interface Complaint {
  id: string;
  category: string;
  description: string | null;
  photoUrls: string[];
  filedAt: string;
  status: string;
  assignedTeam: string | null;
  rcaJson: unknown;
  batch?: { lotNumber: string; drug: { name: string; coldChain: boolean } };
  institution?: { id: string; name: string; district: string | null };
  shipment?: { id: string; status: string; excursionCount: number };
}

export interface TelemetryPoint {
  ts: string;
  lat: number | null;
  lng: number | null;
  tempC: number | null;
}

export interface AssistantAnswer {
  question: string;
  intent: string;
  answer: string;
  narration: 'llm' | 'template';
  evidence: { intent: string; summary: string; data: unknown };
  ms: number;
}

// ─── Endpoint helpers ────────────────────────────────────────────────────────

export const getCatalog = (q = '') => api<Paged<Drug>>(`/api/catalog${q}`);
export const getDrug = (id: string) => api<Drug & { batches: Batch[] }>(`/api/catalog/${id}`);

export const getBatches = (q = '') => api<Paged<Batch>>(`/api/batches${q}`);
export const getBatch = (id: string) => api<Batch>(`/api/batches/${id}`);
export const resolveQr = (qr: string) =>
  api<{
    batchId: string;
    lotNumber: string;
    status: string;
    expiryDate: string;
    quantity: number;
    qcStatus: string | null;
    drug: Drug;
  }>(`/api/batches/resolve?qr=${encodeURIComponent(qr)}`);

export const getOrders = (q = '') => api<Paged<SupplyOrder>>(`/api/orders${q}`);
export const getOrder = (id: string) => api<SupplyOrder>(`/api/orders/${id}`);
export const approveOrder = (id: string, lines?: Array<{ lineId: string; qtyApproved: number }>) =>
  api<{ ok: boolean; status: string }>(`/api/orders/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(lines ? { lines } : {}),
  });
export const rejectOrder = (id: string, reason: string) =>
  api<{ ok: boolean; status: string }>(`/api/orders/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const getShipments = (q = '') => api<Paged<Shipment>>(`/api/shipments${q}`);
export const getShipment = (id: string) =>
  api<Shipment & { excursions: Excursion[]; batches: unknown[]; complaints: Complaint[] }>(
    `/api/shipments/${id}`,
  );
export const getTelemetry = (id: string) =>
  api<{ points: TelemetryPoint[]; rawCount: number }>(`/api/shipments/${id}/telemetry`);

export const getComplaints = (q = '') => api<Paged<Complaint>>(`/api/complaints${q}`);
export const getComplaint = (id: string) => api<Complaint>(`/api/complaints/${id}`);
export const setComplaintStatus = (id: string, status: string, resolutionNotes?: string) =>
  api<{ ok: boolean; status: string }>(`/api/complaints/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, resolutionNotes }),
  });

export const askAssistant = (question: string) =>
  api<AssistantAnswer>('/api/assistant/query', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });

// ─── Analytics (§7.3, §10) ───────────────────────────────────────────────────
//
// Shaped server-side for direct charting — see
// backend/vayu-api/src/routes/analytics/index.ts for the aggregation logic.

export interface ConsumptionPoint {
  month: string;
  dispensed: number;
  trueDemand: number;
  unmet: number;
  stockoutDays: number;
  fulfilmentPct: number | null;
}

export interface ConsumptionResponse {
  drug: { name: string; seasonalProfile: string | null; abcClass: string | null } | null;
  series: ConsumptionPoint[];
  seasonality: { peakMonth: string; troughMonth: string; ratio: number } | null;
}

export const getConsumption = (drugId: string, q = '') =>
  api<ConsumptionResponse>(`/api/analytics/consumption?drugId=${encodeURIComponent(drugId)}${q}`);

export interface VendorMetric {
  vendorId: string;
  name: string;
  profile: string | null;
  quotedLeadTimeDays: number | null;
  pos: number;
  onTimePct: number;
  avgDelayDays: number;
  priceVariancePct: number;
  rejectionRatePct: number;
  totalValueInr: number;
}

export const getVendorAnalytics = () => api<{ items: VendorMetric[] }>('/api/analytics/vendors');

export interface FulfilmentRow {
  district: string;
  fulfilmentPct: number | null;
  dispensed: number;
  trueDemand: number;
  stockoutDays: number;
}

export const getFulfilment = (q = '') =>
  api<{ windowMonths: number; items: FulfilmentRow[] }>(`/api/analytics/fulfilment${q}`);

export interface DiseasePoint {
  month: string;
  cases: number;
  outbreak: boolean;
}

export const getDiseaseSignal = (q = '') =>
  api<{ diseases: string[]; outbreakMonths: number; series: DiseasePoint[] }>(
    `/api/analytics/disease${q}`,
  );

export interface StockHealthBucket {
  label: string;
  count: number;
}

export interface CriticalStockRow {
  drug: string;
  abcClass: string | null;
  institution: string;
  district: string | null;
  quantityOnHand: number;
  monthsOfStock: number | null;
}

export const getStockHealth = () =>
  api<{
    totalLines: number;
    belowReorder: number;
    buckets: StockHealthBucket[];
    critical: CriticalStockRow[];
  }>('/api/analytics/stock-health');

export interface ExpiryBucket {
  label: string;
  batches: number;
  units: number;
  valueInr: number;
}

export const getExpiry = () => api<{ buckets: ExpiryBucket[] }>('/api/analytics/expiry');

export interface AnalyticsSummary {
  ledgerRows: number;
  institutions: number;
  facilities: number;
  warehouses: number;
  drugs: number;
  vendors: number;
  purchaseOrders: number;
  districts: number;
  horizon: { from: string | null; to: string | null };
}

/** Real network counts, so the dashboard never approximates its own scale. */
export const getAnalyticsSummary = () => api<AnalyticsSummary>('/api/analytics/summary');
