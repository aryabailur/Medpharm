# Vayu API — manufacturer / supplier server

**Role:** MedTrack's manufacturer-side backend — catalog, batches, QC, supply-order approval, shipment dispatch, cold-chain telemetry, complaints, and the network-scope assistant.
**Port:** `4000`
**Owns Postgres schema:** `vayu` (ARCHITECTURE.md §4.2)

Fastify + Prisma. Called by `frontend/vayu` (:3000) over fetch + SSE, and by `dhanvantari-api` (:4001) over signed HTTP (§5).

---

## 1. What this server owns

- **Prisma client A**, the only process that may query the `vayu` schema.
- `MEDTRACK_SHARED_SECRET` and every HMAC sign/verify call for cross-app traffic (§5.2).
- Webhook dispatch to Dhanvantari (`order.status_changed`, `shipment.dispatched`, `shipment.telemetry`, `shipment.excursion`, `complaint.status_changed`) and the `OutboundEvent` retry queue that backs it.
- Receipt + idempotency for inbound calls from Dhanvantari (`ProcessedEvent`).
- The SSE stream `GET /api/stream/shipments/:id` (deviation from spec — see below).
- The excursion detector (hysteresis, §6.1) — **this logic exists only here**, never in Dhanvantari.
- Server-side calls to Nidana, each with a deterministic TypeScript fallback (§3.2).

**Must never leak to a client:**
- `DATABASE_URL`, `MEDTRACK_SHARED_SECRET`, `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `NIDANA_BASE_URL` internals, or raw Prisma errors/stack traces.
- Any row from the `dhanvantari` schema — this server never queries it and never will (§3.1, no cross-schema FKs, ever).
- Raw SHAP feature names or LLM-generated SQL (there is no such thing here — §7.4).

---

## 2. Boundary: frontend vs this server

| `frontend/vayu` (:3000) | `vayu-api` (:4000) |
|---|---|
| Next.js UI only. No Prisma, no secrets. | Owns Prisma, secrets, webhooks, SSE. |
| Renders catalog/batch/order/shipment/telemetry/complaint/assistant screens. | Serves read APIs for those screens; computes everything server-side. |
| Opens `EventSource` to `GET /api/stream/shipments/:id`. | Emits SSE events (`position`, `temperature`, `excursion`, `status`). |
| Calls this server for the assistant, never an LLM directly. | Runs intent → deterministic Prisma call → evidence JSON → LLM narration (§7.3). |

**Deviation from ARCHITECTURE.md §5.3.** The spec put SSE in a Next.js route handler. With a UI-only frontend, SSE is served here instead. This makes cross-origin CORS mandatory (`@fastify/cors`, already wired in `src/index.ts`) — but removes the Vercel 300s serverless SSE cap, so the 5-minute stream cap becomes a client-reconnect convenience, not a platform limit.

---

## 3. Quick start

```bash
# from repo root
npm install
npm run db:up          # docker compose — Postgres, both schemas
npm run db:migrate      # prisma migrate for both API servers
npm run dev:vayu-api    # :4000
```

```bash
curl localhost:4000/health
# {"ok":true,"service":"vayu-api"}
```

---

## 4. Environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://...?schema=vayu` |
| `PORT` | Default `4000` |
| `MEDTRACK_SHARED_SECRET` | HMAC secret. Must match `dhanvantari-api`'s value exactly. |
| `DHANVANTARI_API_URL` | Where this server sends webhooks / where it targets `OutboundEvent.targetUrl` |
| `VAYU_WEB_ORIGIN` | CORS allowlist for `frontend/vayu` (default `http://localhost:3000`) |
| `NIDANA_BASE_URL` | Intelligence service base URL |
| `NIDANA_FORCE_FALLBACK` | `true` forces the TS fallback path — test this before every demo (§3.2) |
| `ANTHROPIC_API_KEY` | Assistant narration (§7.3) |
| `CLERK_SECRET_KEY` | Auth session verification |

Never prefix any of these with `NEXT_PUBLIC_` — this is a backend service.

---

## 5. Route table

| Method | Path | Phase | Purpose | Auth |
|---|---|---|---|---|
| GET | `/health` | 0 | Liveness | Public |
| POST | `/api/orders/incoming` | 3 🔒 | Institution places a supply order | HMAC-verified |
| POST | `/api/complaints/incoming` | 6 | Institution files a complaint | HMAC-verified |
| POST | `/api/consumption/report` | 7 | Periodic consumption push from Dhanvantari | HMAC-verified |
| POST | `/api/shipments/:id/confirm-receipt` | 6 | Scan-in complete at the institution | HMAC-verified |
| POST | `/api/sensors/ingest` | 4 | Telemetry from simulator/ESP32 (identical payload, §6.1) | Public-to-own-frontend* |
| GET | `/api/stream/shipments/:id` | 4 | SSE: position, temperature, excursion, status | Public-to-own-frontend |
| POST | `/api/assistant/query` | 9 | Network-scope assistant (§7.3, M1–M12) | Public-to-own-frontend (Clerk session) |
| GET | `/api/catalog`, `/api/batches`, `/api/orders`, `/api/shipments`, `/api/complaints` | 2–7 | Read APIs for `frontend/vayu` | Public-to-own-frontend (Clerk session) |

\* Sensor ingest has no cross-app HMAC requirement in §6.1 — it's a device/simulator endpoint, not a cross-org contract call. Gate it with a device key or leave open for the demo; do not confuse it with the D↔V webhook contract.

---

## 6. Data model summary

Full detail: [`prisma/schema.prisma`](prisma/schema.prisma) (§4.2). Do not duplicate fields here — read the file when implementing.

| Model | Purpose |
|---|---|
| `Drug` | Catalogue: name, NLEM code, cold-chain band |
| `Batch` | One manufactured lot (UUIDv7 `id`), QR payload, lifecycle status |
| `QCRecord` | Pass/fail inspection tied to a batch |
| `Institution` | Network node — hospital/CHC/PHC/warehouse/retail |
| `SupplyOrder` / `SupplyOrderLine` | The order loop — Phase 3 hard gate |
| `Shipment` / `ShipmentBatch` | One consignment, its batches, live position |
| `TelemetryPoint` | Raw GPS + temp ticks — largest table, decimate on read (§4.4) |
| `Excursion` | Cold-chain breach, hysteresis-detected, severity-classified (§6.1) |
| `Complaint` | Institution-filed issue, cached `rcaJson` from Nidana |
| `ConsumptionFeed` | Mirror of Dhanvantari's dispensing, pushed via `/api/consumption/report` |
| `OutboundEvent` | Retry queue for webhooks to Dhanvantari |
| `ProcessedEvent` | Idempotency ledger for inbound `X-MedTrack-Event-Id`s |

---

## 7. PART 1 / PART 2 PARALLEL TRACKS

Two people, zero merge conflicts. **Strict rule: each glob below is owned by exactly one part. Never edit a file outside your part's list without saying so first.**

**Part 1 is the critical path** — Phase 3, the order loop, is a hard gate (§9). Nothing past it starts until D places → V approves → D's status flips.

### Owned globs

| Part | Owns |
|---|---|
| **Part 1** (critical path, Phases 0–3) | `src/lib/prisma.ts` (client singleton — see Shared table, initial creation only), `src/lib/hmac-middleware.ts`, `src/lib/idempotency.ts`, `src/routes/orders/**`, `src/routes/catalog/**`, `src/routes/batches/**` |
| **Part 2** (Phases 4–5, then 6–9) | `src/lib/webhooks/**` (dispatch + retry worker), `src/routes/sensors/**`, `src/routes/telemetry/**` (excursion detector), `src/routes/stream/**` (SSE), `src/routes/complaints/**`, `src/routes/consumption/**`, `src/routes/assistant/**` |

### Shared — coordinate before editing

| Path | Why | Rule |
|---|---|---|
| `prisma/schema.prisma` | Both parts add models/fields as their phases land | Whoever needs a schema change proposes a diff in chat first; run `npm run db:migrate` after either side merges, not before. |
| `src/index.ts` (route registration block) | Both parts register routes here | Append at the marker comment below; never reorder or reformat existing lines. |
| `src/lib/prisma.ts` (the client singleton) | Both parts import it | Part 1 creates it in Phase 0 as a single exported `PrismaClient` instance; Part 2 only imports, never re-instantiates. |
| `backend/packages/contracts` | Both servers + both frontends + the Expo app import it | A payload change ripples everywhere by design — announce it before editing. |
| `backend/packages/crypto` | Both servers use it for HMAC | A signing change breaks every cross-app call at once — announce it before editing. |

**The one unavoidable shared touchpoint** is route registration in `src/index.ts`. Append below the marker, one route per line, never reorder above it:

```ts
app.get('/health', async () => ({ ok: true, service: 'vayu-api' }));

// --- ROUTES: append registration below, one per line, do not reorder above ---
// app.register(ordersRoutes, { prefix: '/api/orders' });
// app.register(catalogRoutes, { prefix: '/api/catalog' });
// app.register(sensorsRoutes, { prefix: '/api/sensors' });
// app.register(streamRoutes, { prefix: '/api/stream' });
```

### Part 1 — Prisma, HMAC, idempotency, order loop, read APIs (CRITICAL PATH 🔒)

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Prisma client singleton | `src/lib/prisma.ts` | 0 | migration run |
| HMAC verify middleware (constant-time compare, 5-min replay window) | `src/lib/hmac-middleware.ts` | 0 | `packages/crypto` |
| Idempotency guard (`ProcessedEvent` check-and-insert) | `src/lib/idempotency.ts` | 0 | Prisma client |
| `POST /api/orders/incoming` | `src/routes/orders/incoming.ts` | 3 🔒 | HMAC middleware, idempotency guard |
| Order approval flow (approve/reject/partial → fires `order.status_changed`) | `src/routes/orders/approve.ts` | 3 🔒 | incoming route, webhook dispatch (Part 2 stub OK) |
| Read APIs: catalog, batches, orders | `src/routes/catalog/**`, `src/routes/batches/**`, `src/routes/orders/list.ts` | 2–3 | Prisma client |

### Part 2 — Telemetry, excursion, SSE, webhooks (Phases 4–5), then complaints/consumption/assistant (6–9)

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| `POST /api/sensors/ingest` | `src/routes/sensors/ingest.ts` | 4 | Prisma client (Part 1) |
| Excursion detector — hysteresis: ≥3 consecutive readings or ≥60s out of band; MINOR/MAJOR/CRITICAL; any excursion below 0°C is CRITICAL (§6.1) | `src/lib/telemetry/excursion-detector.ts` | 4–5 | sensor ingest |
| `GET /api/stream/shipments/:id` SSE, decimate telemetry to ~200 points on read (§4.4) | `src/routes/stream/shipments.ts` | 4 | sensor ingest |
| Webhook dispatch (sign + send) + `OutboundEvent` retry worker (1s/4s/16s/60s → FAILED) | `src/lib/webhooks/dispatch.ts`, `src/lib/webhooks/retry-worker.ts` | 4–5 | `packages/crypto`, Prisma client |
| `POST /api/complaints/incoming` | `src/routes/complaints/incoming.ts` | 6 | HMAC middleware, idempotency (Part 1) |
| `POST /api/consumption/report` | `src/routes/consumption/report.ts` | 7 | HMAC middleware, idempotency |
| `POST /api/shipments/:id/confirm-receipt` | `src/routes/orders/confirm-receipt.ts` or `src/routes/shipments/confirm-receipt.ts` | 6 | HMAC middleware, idempotency |
| Assistant: intent → tool dispatch → LLM narration, network scope (M1–M12, §7.3) | `src/routes/assistant/**` | 9 | Nidana `/assistant/explain`, deterministic fallback |
| Nidana calls (risk, forecast) with deterministic TS fallback, `NIDANA_FORCE_FALLBACK` tested | `src/lib/nidana-client.ts` | 7–9 | — |

---

## 8. Non-negotiables

- **HMAC-sign and verify every cross-app request** (`packages/crypto`); constant-time compare via `timingSafeEqual`, never `===`; reject anything older than 5 minutes (§5.2).
- **Idempotency:** store every `X-MedTrack-Event-Id` in `ProcessedEvent`. Duplicate → `200`, do nothing (§5.2).
- **Retry backoff 1s / 4s / 16s / 60s**, then `FAILED` with a manual replay button (§5.2).
- **UUIDv7 for `batchId` / `shipmentId` / `supplyOrderId`** — echo only, never invent (§4.1).
- **Never generate SQL from an LLM.** Every assistant query is a hand-written, parameterised Prisma call (§7.4).
- **Every Nidana call ships with a deterministic TS fallback first**; force-test with `NIDANA_FORCE_FALLBACK=true` (§3.2).
- **No foreign keys across the schema boundary, ever** (§3.1) — nothing in `prisma/schema.prisma` references `dhanvantari`.
- **Excursion detection uses hysteresis** — ≥3 consecutive out-of-band readings or ≥60s, severity MINOR/MAJOR/CRITICAL, any excursion below 0°C is CRITICAL (§6.1). This logic lives only in `vayu-api`.
- **Telemetry decimated to ~200 points on read** before it reaches the SSE stream or any chart payload (§4.4).

---

## 9. Phase mapping (§9)

| Phase | Work here | Gate |
|---|---|---|
| **0** | Prisma client, HMAC middleware, idempotency guard scaffolded | Server boots, `/health` returns 200 |
| **2** | Catalog + batch + QR read APIs | Scan a QR → drug card renders |
| **3** | `POST /api/orders/incoming` + approval flow | 🔒 Hard gate — order loop end-to-end with Dhanvantari |
| **4** | Sensor ingest, SSE stream, telemetry read API | Marker moves, graph ticks, no refresh |
| **5** | Excursion detector + webhook dispatch | Inject a spike → banner appears in Dhanvantari |
| **6** | Complaints incoming, confirm-receipt | Two taps, zero manual ID entry |
| **7** | Consumption report intake, risk score wiring | Every flag drills to 5 signals |
| **8** | Forecast wiring (via Nidana) | Band chart + top-3 reasons |
| **9** | Assistant (`/api/assistant/query`, M1–M12) | 6 demo questions answer in <3s |
