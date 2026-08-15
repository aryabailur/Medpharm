# Dhanvantari API — institution server

**Role:** MedTrack's institution-side backend — inventory, POS/dispense, supply-order placement, scan-in, complaint filing, supplier scorecard, and the own-data-scope assistant.
**Port:** `4001`
**Owns Postgres schema:** `dhanvantari` (ARCHITECTURE.md §4.3)

Fastify + Prisma. Called by `frontend/dhanvantari` (:3001) over fetch + SSE, by the Expo app (`wilbert0838n/medpharm-app`), and by `vayu-api` (:4000) over signed HTTP (§5).

---

## 1. What this server owns

- **Prisma client B**, the only process that may query the `dhanvantari` schema.
- `MEDTRACK_SHARED_SECRET` and every HMAC sign/verify call for cross-app traffic (§5.2).
- Webhook receipt from Vayu (`order.status_changed`, `shipment.dispatched`, `shipment.telemetry`, `shipment.excursion`, `complaint.status_changed`) with idempotency (`ProcessedEvent`).
- Outbound calls to Vayu — place order, file complaint, report consumption, confirm receipt — via the `OutboundEvent` retry queue.
- The SSE stream `GET /api/stream/shipments/:id` to both `frontend/dhanvantari` and, indirectly, the Expo client's polling/refresh flows.
- **All Expo-client endpoints.** The mobile app (`wilbert0838n/medpharm-app`) talks only to this server — never to `vayu-api`, never directly to Postgres.
- Server-side calls to Nidana, each with a deterministic TypeScript fallback (§3.2).

**Must never leak to a client:**
- `DATABASE_URL`, `MEDTRACK_SHARED_SECRET`, `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `NIDANA_BASE_URL` internals, or raw Prisma errors/stack traces.
- Any row from the `vayu` schema — this server never queries it and never will (§3.1, no cross-schema FKs, ever).
- Another institution's data — the assistant's scope is enforced server-side, before the LLM is invoked (§7.2).

---

## 2. Boundary: frontend vs this server

| `frontend/dhanvantari` (:3001) / Expo app | `dhanvantari-api` (:4001) |
|---|---|
| Next.js UI only, no Prisma, no secrets. Expo app similarly UI-only. | Owns Prisma, secrets, webhook receipt, SSE. |
| Renders inventory/POS/orders/incoming/scan-in/complaints/assistant screens. | Serves read APIs for those screens; computes everything server-side. |
| Opens `EventSource` to `GET /api/stream/shipments/:id`. | Emits SSE events (`position`, `temperature`, `excursion`, `status`). |
| Expo app calls `GET /api/batches/resolve`, `GET /api/shipments/incoming`, `POST /api/shipments/confirm-receipt`, `POST /api/complaints` — **and nothing else, anywhere else.** | Validates, persists, and forwards cross-app effects to Vayu via the `OutboundEvent` queue. |
| Calls this server for the assistant, never an LLM directly. | Runs intent → deterministic Prisma call → evidence JSON → LLM narration, scoped to caller's own institution (§7.2). |

**Deviation from ARCHITECTURE.md §5.3.** The spec put SSE in a Next.js route handler. With a UI-only frontend, SSE is served here instead. This makes cross-origin CORS mandatory (`@fastify/cors`, already wired in `src/index.ts`) — but removes the Vercel 300s serverless SSE cap, so the 5-minute stream cap becomes a client-reconnect convenience, not a platform limit.

---

## 3. Quick start

```bash
# from repo root
npm install
npm run db:up                 # docker compose — Postgres, both schemas
npm run db:migrate             # prisma migrate for both API servers
npm run dev:dhanvantari-api    # :4001
```

```bash
curl localhost:4001/health
# {"ok":true,"service":"dhanvantari-api"}
```

---

## 4. Environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://...?schema=dhanvantari` |
| `PORT` | Default `4001` |
| `MEDTRACK_SHARED_SECRET` | HMAC secret. Must match `vayu-api`'s value exactly. |
| `VAYU_API_URL` | Where this server sends outbound requests / where `OutboundEvent.targetUrl` points |
| `DHANVANTARI_WEB_ORIGIN` | CORS allowlist for `frontend/dhanvantari` and, on a LAN IP, the Expo client (default `http://localhost:3001`) |
| `NIDANA_BASE_URL` | Intelligence service base URL |
| `NIDANA_FORCE_FALLBACK` | `true` forces the TS fallback path — test this before every demo (§3.2) |
| `ANTHROPIC_API_KEY` | Assistant narration (§7.2) |
| `CLERK_SECRET_KEY` | Auth session verification |

Never prefix any of these with `NEXT_PUBLIC_` — this is a backend service.

---

## 5. Route table

| Method | Path | Phase | Purpose | Auth |
|---|---|---|---|---|
| GET | `/health` | 0 | Liveness | Public |
| POST | `/api/webhooks/vayu/order-status` | 3 🔒 | Order status flips (Pending→Approved→Dispatched) | HMAC-verified |
| POST | `/api/webhooks/vayu/shipment-dispatched` | 4 | Manifest + route + ETA | HMAC-verified |
| POST | `/api/webhooks/vayu/shipment-telemetry` | 4 | Throttled position/temp, every 10s | HMAC-verified |
| POST | `/api/webhooks/vayu/shipment-excursion` | 5 | Cold-chain breach — pre-arrival warning | HMAC-verified |
| POST | `/api/webhooks/vayu/complaint-status` | 6 | Open→Investigating→Resolved + RCA | HMAC-verified |
| GET | `/api/stream/shipments/:id` | 4 | SSE: position, temperature, excursion, status | Public-to-own-frontend |
| GET | `/api/batches/resolve?qr=` | 6 | Expo: resolve a scanned QR to batch/drug/expiry/QC/cold-chain flag | Public-to-Expo (Clerk/session token) |
| GET | `/api/shipments/incoming` | 4 | Expo + web: list incoming shipments | Public-to-own-frontend |
| POST | `/api/shipments/confirm-receipt` | 6 | Expo: scan-in complete → outbound to Vayu | Public-to-Expo |
| POST | `/api/complaints` | 6 | Expo + web: file a complaint | Public-to-own-frontend |
| POST | `/api/assistant/query` | 9 | Own-data-scope assistant (§7.2, V1–V12) | Public-to-own-frontend (Clerk session) |
| GET | `/api/inventory`, `/api/pos`, `/api/orders`, `/api/supplier-scorecard` | 0–7 | Read APIs for `frontend/dhanvantari` | Public-to-own-frontend (Clerk session) |

Outbound (place order, file complaint, report consumption, confirm receipt) go through the `OutboundEvent` queue to `vayu-api`'s corresponding inbound routes — see [`vayu-api/README.md`](../vayu-api/README.md) §5.

---

## 6. Data model summary

Full detail: [`prisma/schema.prisma`](prisma/schema.prisma) (§4.3). Do not duplicate fields here — read the file when implementing.

| Model | Purpose |
|---|---|
| `Drug` | Local catalogue mirror — built from scratch, not FK'd to Vayu's `Drug` |
| `Inventory` | Stock on hand, reorder point, expiry — the core inventory table |
| `Dispense` | POS / dispensing ledger; feeds consumption trend and the `/api/consumption/report` push |
| `IncomingShipment` | Mirror of a Vayu shipment (`id` = Vayu's `shipmentId`), live position, anomaly flag |
| `ReceivedBatch` | Scan-in record (`id` = Vayu's `batchId`), condition photos, accepted/rejected |
| `LocalComplaint` | Institution-filed complaint, mirrors remote status + RCA summary pushed down |
| `SupplierScore` | The bidirectional scorecard PS-SS04 asks for — institution rates its supplier (§1) |
| `OutboundEvent` | Retry queue for calls to Vayu |
| `ProcessedEvent` | Idempotency ledger for inbound `X-MedTrack-Event-Id`s |

---

## 7. PART 1 / PART 2 PARALLEL TRACKS

Two people, zero merge conflicts. **Strict rule: each glob below is owned by exactly one part. Never edit a file outside your part's list without saying so first.**

**Part 1 is the critical path** — Phase 3, the order loop, is a hard gate (§9). Nothing past it starts until D places → V approves → D's status flips.

### Owned globs

| Part | Owns |
|---|---|
| **Part 1** (critical path, Phases 0–3) | `src/lib/prisma.ts` (client singleton — see Shared table, initial creation only), `src/routes/inventory/**`, `src/routes/pos/**`, `src/routes/orders/**` (placement, not receipt of webhooks), `src/lib/outbound/**` (queue + sender for place-order) |
| **Part 2** (Phases 4–6, then 9) | `src/lib/webhooks/**` (receiver + HMAC verify + idempotency), `src/routes/stream/**` (SSE), `src/routes/expo/**` (batches/resolve, shipments/incoming, confirm-receipt, complaints), `src/routes/supplier-scorecard/**`, `src/routes/assistant/**` |

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
app.get('/health', async () => ({ ok: true, service: 'dhanvantari-api' }));

// --- ROUTES: append registration below, one per line, do not reorder above ---
// app.register(inventoryRoutes, { prefix: '/api/inventory' });
// app.register(ordersRoutes, { prefix: '/api/orders' });
// app.register(webhookRoutes, { prefix: '/api/webhooks/vayu' });
// app.register(streamRoutes, { prefix: '/api/stream' });
// app.register(expoRoutes, { prefix: '/api' });
```

### Part 1 — Prisma, inventory/POS, order placement, outbound queue (CRITICAL PATH 🔒)

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Prisma client singleton | `src/lib/prisma.ts` | 0 | migration run |
| Read APIs: inventory, POS/dispense | `src/routes/inventory/**`, `src/routes/pos/**` | 0–2 | Prisma client |
| `OutboundEvent` queue + sender (sign + HMAC headers via `packages/crypto`) | `src/lib/outbound/queue.ts`, `src/lib/outbound/sender.ts` | 3 🔒 | `packages/crypto` |
| Order placement → enqueues `POST /api/orders/incoming` on Vayu | `src/routes/orders/place.ts` | 3 🔒 | outbound queue |
| Order read API (status view for the frontend) | `src/routes/orders/list.ts` | 3 | Prisma client |

### Part 2 — Webhook receivers, SSE, Expo endpoints, scorecard (Phases 4–6), then assistant (9)

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| HMAC verify middleware + idempotency guard (`ProcessedEvent`) | `src/lib/webhooks/verify-middleware.ts`, `src/lib/webhooks/idempotency.ts` | 0 | `packages/crypto`, Prisma client (Part 1) |
| `POST /api/webhooks/vayu/order-status` | `src/lib/webhooks/order-status.ts` | 3 🔒 | verify middleware, idempotency |
| `POST /api/webhooks/vayu/shipment-dispatched` | `src/lib/webhooks/shipment-dispatched.ts` | 4 | verify middleware |
| `POST /api/webhooks/vayu/shipment-telemetry` | `src/lib/webhooks/shipment-telemetry.ts` | 4 | verify middleware |
| `GET /api/stream/shipments/:id` SSE | `src/routes/stream/shipments.ts` | 4 | telemetry webhook |
| `POST /api/webhooks/vayu/shipment-excursion` (pre-arrival warning) | `src/lib/webhooks/shipment-excursion.ts` | 5 | verify middleware, SSE |
| `POST /api/webhooks/vayu/complaint-status` | `src/lib/webhooks/complaint-status.ts` | 6 | verify middleware |
| Expo endpoints: `GET /api/batches/resolve`, `GET /api/shipments/incoming`, `POST /api/shipments/confirm-receipt`, `POST /api/complaints` | `src/routes/expo/**` | 6 | Prisma client, outbound queue (Part 1) |
| Supplier scorecard computation + read API | `src/routes/supplier-scorecard/**` | 7–10 | delivery history in `IncomingShipment`/webhooks |
| Assistant: intent → tool dispatch → LLM narration, own-institution scope enforced server-side (V1–V12, §7.2) | `src/routes/assistant/**` | 9 | Nidana `/assistant/explain`, deterministic fallback |
| Nidana calls (forecast, risk for reorder-suggest V8) with deterministic TS fallback, `NIDANA_FORCE_FALLBACK` tested | `src/lib/nidana-client.ts` | 7–9 | — |

---

## 8. Non-negotiables

- **HMAC-sign and verify every cross-app request** (`packages/crypto`); constant-time compare via `timingSafeEqual`, never `===`; reject anything older than 5 minutes (§5.2).
- **Idempotency:** store every `X-MedTrack-Event-Id` in `ProcessedEvent`. Duplicate → `200`, do nothing (§5.2).
- **Retry backoff 1s / 4s / 16s / 60s**, then `FAILED` with a manual replay button (§5.2).
- **UUIDv7 for `batchId` / `shipmentId` / `supplyOrderId`** — echo only, never invent. `IncomingShipment.id` and `ReceivedBatch.id` are always Vayu's IDs (§4.1).
- **Never generate SQL from an LLM.** Every assistant query is a hand-written, parameterised Prisma call (§7.4).
- **Every Nidana call ships with a deterministic TS fallback first**; force-test with `NIDANA_FORCE_FALLBACK=true` (§3.2).
- **No foreign keys across the schema boundary, ever** (§3.1) — nothing in `prisma/schema.prisma` references `vayu`.
- **The assistant's scope is enforced server-side, before the LLM is invoked** — this server's bot physically cannot read another institution's data (§7.2).
- **The Expo app talks only to `dhanvantari-api`** — never expose a route here that requires the Expo client to know about `vayu-api`'s existence or URL.

---

## 9. Phase mapping (§9)

| Phase | Work here | Gate |
|---|---|---|
| **0** | Prisma client, HMAC verify middleware, idempotency guard scaffolded | Server boots, `/health` returns 200 |
| **3** | Order placement + `OutboundEvent` queue + `order-status` webhook receiver | 🔒 Hard gate — order loop end-to-end with Vayu |
| **4** | `shipment-dispatched` / `shipment-telemetry` webhook receivers, SSE stream, `GET /api/shipments/incoming` | Marker moves, graph ticks, no refresh |
| **5** | `shipment-excursion` webhook receiver | Inject a spike in Vayu → banner appears here before arrival |
| **6** | Scan-in (`confirm-receipt`), complaint filing, `complaint-status` webhook receiver, Expo endpoints | Two taps, zero manual ID entry |
| **7** | Supplier scorecard, risk-driven reorder suggest (V8) | Every flag drills to 5 signals |
| **9** | Assistant (`/api/assistant/query`, V1–V12) | 6 demo questions answer in <3s |
