# MedTrack — Architecture & Build Record (v2)

**Problem Statement:** PS-SS04 — Drug Inventory and Supply Chain Tracking System
**Status:** Phase 3 hard gate **CLOSED**. Both API servers complete. Vayu frontend complete.

> **What v2 changes.** v1 and v1.1 were *plans*. This version is a **build record**: it documents the system as implemented and verified, marks what deviates from the original design and why, and keeps the remaining work honest. Every claim marked ✅ was executed against a live server and a real database, not asserted.
>
> Two premises from v1 turned out to be false and are corrected here:
> - *"Dhanvantari is already ~60% built"* — it was not. Everything is greenfield (v1.1).
> - *"SSE lives in a Next.js route handler"* — it does not, because the frontends became UI-only (§5.3).
>
> **Where the code lives right now.** `vayu-api` is on `main`. Two branches are pushed but unmerged: `feat/dhanvantari-api` (both Parts, Phase 3 gate) and `feat/vayu-web` (12 screens + seed script). This document describes the union of all three — merge both branches and it describes `main`.

---

## 0. TL;DR — The Decision

Five deployables, split across two repos.

| Service | Role | Stack | Port | Status |
|---|---|---|---|---|
| **vayu-api** | Manufacturer backend | Fastify + Prisma | 4000 | ✅ Complete |
| **dhanvantari-api** | Institution backend | Fastify + Prisma | 4001 | ✅ Complete |
| **vayu-web** | Manufacturer UI | Next.js 15 | 3000 | ✅ 12 screens |
| **dhanvantari-web** | Institution UI | Next.js 15 | 3001 | ⬜ Scaffold |
| **nidana** | Intelligence service | Python / FastAPI | 8000 | ⬜ Stubs (TS fallback live) |
| *simulator* | Telemetry generator | Node | — | ⬜ Stub |

**Vayu** — catalog, batches, QC, supply-order approval, shipment dispatch, telemetry, evidence layer.
**Dhanvantari** — inventory, POS, scan-in, complaints, reorder, supplier scorecard.
**Nidana** — forecasting, multi-signal risk scoring, RCA, route optimization. **Stateless. Both apps call it. It owns no user data.**

The single most important structural decision: **the AI/analytics is a shared service, not duplicated per app.** Otherwise you write the forecasting logic twice, in TypeScript, badly.

### Repo split

| Repo | Contains |
|---|---|
| [`aryabailur/Medpharm`](https://github.com/aryabailur/Medpharm) | `frontend/{vayu,dhanvantari}`, `backend/{vayu-api,dhanvantari-api,nidana,simulator,packages,data-gen}` |
| [`wilbert0838n/medpharm-app`](https://github.com/wilbert0838n/medpharm-app) | Expo React Native — scan-in, photo capture, complaint filing |

---

## 1. Terminology — Fix This Before The Pitch

PS-SS04 says: *"Tracking of vendor activities like preparation of Supply Order, Shipment etc."*

In PS-SS04's language, **the vendor is the supplier** — the one who prepares the supply order and ships. That is your *manufacturer*. The hospital is the *institution / consignee*.

| Do not say | Say instead | Who it is |
|---|---|---|
| Manufacturer | **Supplier / Manufacturer** | Produces & ships. **This is PS-SS04's "vendor".** |
| Vendor | **Institution** (hospital / CHC / PHC / medical store) | Receives, stocks, dispenses |
| Vendor Reliability Dashboard | **Supplier Scorecard** (shown *in Dhanvantari*) | Institution rates the manufacturer |
| — | **Institution Reliability Panel** (shown *in Vayu*) | Manufacturer rates the institution |

Both directions are implemented: `GET /api/supplier-scorecard` on Dhanvantari, and the `institution.reliability` assistant intent (M4) plus `/reliability` screen on Vayu.

> Demo line: *"PS-SS04 asks for vendor activity tracking. We score accountability in both directions — the institution can see its supplier's on-time %, and the supplier can see which institutions mishandle stock."*

**Fix the words in the UI, not just the pitch.** The one permitted exception is the sentence above, which quotes the problem statement.

---

## 2. USP Validation

| # | USP | Verdict | Status |
|---|---|---|---|
| 1 | Photo-to-Stock Capture (YOLOv8) | 🟡 **Rebuilt** as a 3-tier ladder — §2.1 | ✅ Tier 1 (QR) live |
| 2 | Explainable Forecasting (LightGBM + SHAP) | 🟢 Keep | ⬜ TS fallback live, model pending |
| 3 | Multi-Signal Risk Score + drilldown | 🟢 **Hero feature** | ✅ 5 signals, live |
| 4 | Bidirectional Accountability Scorecard | 🟢 Keep + split in two | ✅ Both directions |
| 5 | Conversational Diagnosis Assistant | 🟢 Keep | ✅ Both sides |
| 6 | Coverage Gap Finder | 🟡 Vayu-side only | ⬜ Screen exists, needs Nidana |
| — | Cold chain + GPS + complaint RCA | 🟢 **USP #1** | ✅ Detection + pre-arrival warning |
| — | Optimized shipment routing | 🟡 Scope down — §6.5 | ⬜ Nidana stub |

### 2.1 Photo-to-Stock Capture — the honest assessment

**The plan as written:** self-collect 50–100 images per class, label in Roboflow, fine-tune YOLOv8n to count boxes/strips/vials.

**Why it fails in a hackathon:** 50–100 images per class is far below what's needed for reliable counting of occluded, stacked, identical boxes. Barcode/QR is ~100% accurate and instant. **Training a model to do worse than a barcode you already scan is negative-value work.**

**Replaced with a three-tier capture ladder** (same UX, same pitch line):

| Tier | Method | When | Status |
|---|---|---|---|
| 1 | **QR / barcode scan** → resolves batch, drug, expiry, QC status, cold-chain flag | Default | ✅ `GET /api/batches/resolve` on both servers |
| 2 | **Label photo → OCR** → fuzzy-match against NLEM | Legacy stock with no Vayu QR | ⬜ |
| 3 | **Photo-assisted count** — model proposes, worker confirms | Quantity step | ⬜ |

**Do not spend a single day fine-tuning YOLOv8.**

> *"A worker who cannot type can still keep inventory accurate: point the camera, confirm one number. And the AI never commits silently — it proposes, a human confirms."*

---

## 3. Final Architecture — as built

```
  frontend/vayu :3000                            frontend/dhanvantari :3001
  Next.js, UI only                               Next.js, UI only
         │  fetch + SSE (cross-origin)                      │
         ▼                                                  ▼
  ┌──────────────────┐    signed webhooks + REST    ┌──────────────────────┐
  │  vayu-api :4000  │ ◄────────  (HMAC)  ────────► │ dhanvantari-api :4001│
  │  Fastify+Prisma  │                              │   Fastify+Prisma     │
  │  schema: vayu    │                              │ schema: dhanvantari  │
  │  14 models       │                              │      9 models        │
  └────────┬─────────┘                              └──────────┬───────────┘
           │          ONE Postgres, TWO schemas                │
           │          ZERO cross-schema FKs (verified)         │
           └──────────────────┬───────────────────────────────-┘
                              ▼                          ▲
                  ┌───────────────────────────┐          │ Expo app
                  │  nidana :8000  (FastAPI)  │          │ (talks ONLY to
                  │  STATELESS, owns no data  │          │  dhanvantari-api)
                  └───────────────────────────┘          │
                              ▲                          │
              simulator ──────┘ POST /api/sensors/ingest
```

**The frontends hold no Prisma, no secrets, and never call the other organisation.** Verified by grep: the only matches for `@medtrack/crypto` or `MEDTRACK_SHARED_SECRET` under `frontend/` are README rows documenting the prohibition.

### 3.1 One Postgres instance, two schemas ✅

Two managed instances would mean two connection strings, two migration pipelines, two failure modes on demo day, and roughly zero additional marks.

**As built:** one Postgres, two schemas (`vayu`, `dhanvantari`), **two separate Prisma clients**, no foreign keys across the boundary, all cross-app movement over the §5 HTTP contract.

✅ **Verified in the database, not asserted:**

```sql
SELECT tc.table_schema, ccu.table_schema FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema <> ccu.table_schema;
-- 0 rows
```

> *"The two apps share no tables. Every cross-organization interaction goes over a signed HTTP contract — we could move either app to a separate database tomorrow by changing one connection string."* That is true, because it is.

### 3.2 Nidana as a separate Python service

LightGBM + SHAP have no usable TypeScript equivalent, and both apps need forecasting and risk. Write it once, statelessly.

**Fallback-first, as built:** `lib/nidana-client.ts` exists in **both** servers with identical fallback maths — a rolling-mean forecast with a spread-derived P10/P90, and the deterministic 5-signal weighted-sum risk score. A remote failure, timeout, or cold start falls through silently.

Force the fallback with `NIDANA_FORCE_FALLBACK=true` and **test it before every demo — a fallback nobody has exercised is not a fallback.**

**Deploy:** Render / Railway / Fly.io free tier. Warm with a cron ping 10 minutes before the demo; cold starts are 30+ seconds.

### 3.3 Deviation: the frontend/backend split

**v1 assumed** Next.js full-stack — UI and API routes in one app, SSE in a route handler.

**As built:** the frontends are **UI-only**, and all server work lives in two Fastify servers.

| Consequence | Effect |
|---|---|
| SSE moved to Fastify | Vercel's 300s serverless cap no longer applies — the 5-minute stream cap is now a client-reconnect convenience, not a platform limit |
| Cross-origin CORS | Now mandatory and real config (`@fastify/cors`, plus headers set on the raw SSE response since it bypasses Fastify's serializer) |
| No Server Actions / server-side Prisma reads | Every page is a client-visible fetch to `:4000` / `:4001` |
| Clerk auth | Must be solved twice — session in the frontend, token verification in Fastify |

Chosen deliberately: it gives the cleanest two-person split per service, which is what the team is optimising for.

---

## 4. Data Model — as built

### 4.1 The shared identity contract ✅

Three IDs are global, immutable, and meaningful in both databases:

- `batchId` — one manufactured lot
- `shipmentId` — one physical consignment
- `supplyOrderId` — one request from an institution

**Ownership, as implemented:** `supplyOrderId` is minted by **Dhanvantari** at placement and echoed by Vayu. `batchId` and `shipmentId` are minted by **Vayu** and echoed by Dhanvantari (`IncomingShipment.id` and `ReceivedBatch.id` are always Vayu's IDs).

**Neither app ever guesses an ID; it only ever echoes one it received.**

### 4.2 Vayu schema — 14 models

Source of truth: [`backend/vayu-api/prisma/schema.prisma`](backend/vayu-api/prisma/schema.prisma).

| Model | Purpose |
|---|---|
| `Drug` | Catalogue: NLEM code, cold-chain band |
| `Batch` | One manufactured lot, QR payload, lifecycle status |
| `QCRecord` | Pass/fail inspection tied to a batch |
| `Institution` | Network node — PHC/CHC/district hospital/warehouse/retail |
| `SupplyOrder` / `SupplyOrderLine` | The order loop |
| `Shipment` / `ShipmentBatch` | One consignment, its batches, live position |
| `TelemetryPoint` | Raw GPS + temp ticks — largest table, decimated on read |
| `Excursion` | Cold-chain breach, hysteresis-detected, severity-classified |
| `Complaint` | Institution-filed issue, cached `rcaJson` |
| `ConsumptionFeed` | Mirror of Dhanvantari's dispensing |
| `OutboundEvent` | Retry queue to Dhanvantari |
| `ProcessedEvent` | Idempotency ledger |

### 4.3 Dhanvantari schema — 9 models

Source of truth: [`backend/dhanvantari-api/prisma/schema.prisma`](backend/dhanvantari-api/prisma/schema.prisma).

> **v1.1 correction:** v1 said "new models only (existing inventory/POS untouched)". There was no existing inventory/POS. `Drug`, `Inventory` and `Dispense` were **built from scratch**.

| Model | Purpose |
|---|---|
| `Drug` | Local catalogue mirror — **not** FK'd to Vayu's `Drug` |
| `Inventory` | Stock on hand, reorder point, expiry |
| `Dispense` | POS ledger; feeds consumption trend and the push to Vayu |
| `IncomingShipment` | Mirror of a Vayu shipment; `anomalyFlag` drives the warning banner |
| `ReceivedBatch` | Scan-in record, condition photos, accepted/rejected |
| `LocalComplaint` | Filed complaint + `remoteId`, `remoteStatus`, `rcaSummary` |
| `SupplierScore` | The scorecard PS-SS04 asks for |
| `OutboundEvent` / `ProcessedEvent` | Retry queue + idempotency ledger |

**Schema change since v1:** `LocalComplaint.remoteId` (nullable, unique) was added. Vayu mints its own `Complaint.id` when a filing lands, so without somewhere to store it the `complaint.status_changed` webhook has nothing to match on and the RCA push-down cannot work. Migration `20260817213530`.

### 4.4 Prisma notes — including two traps that cost real time

- `TelemetryPoint` is the largest table. **Write raw, read decimated to ~200 points server-side.** Implemented in `decimate()`; do not ship 4,000 points to Recharts.
- Index `(shipmentId, ts)`, `(status)` on Shipment, `(status, filedAt)` on Complaint.
- Keep `rcaJson` and `signals` as `Json` columns — read-mostly display payloads.

⚠️ **Each service generates its own Prisma client.** Both schemas originally wrote to the shared `node_modules/.prisma/client`, so whichever ran `prisma generate` last **silently overwrote the other server's models**. Each schema now declares its own `output` dir.

> After pulling, run `npx prisma generate` **inside your service directory**, not from the repo root.
> Symptom if this breaks: `Cannot read properties of undefined (reading 'findMany')` at runtime, on a file that typechecks cleanly.

⚠️ **`lib/prisma.ts` imports the client by relative path, not as `@prisma/client`.** A bare specifier resolves against the *process* working directory, and `npm run dev:*` starts from the repo root. This looks untidy and is deliberate — do not "fix" it.

---

## 5. Cross-App Contract — as built

### 5.1 Endpoints ✅

| Direction | Endpoint | Phase | Status |
|---|---|---|---|
| D → V | `POST /api/orders/incoming` | 3 🔒 | ✅ |
| D → V | `POST /api/complaints/incoming` | 6 | ✅ |
| D → V | `POST /api/consumption/report` | 7 | ✅ |
| D → V | `POST /api/shipments/:id/confirm-receipt` | 6 | ✅ |
| V → D | `POST /api/webhooks/vayu/order-status` | 3 🔒 | ✅ |
| V → D | `POST /api/webhooks/vayu/shipment-dispatched` | 4 | ✅ |
| V → D | `POST /api/webhooks/vayu/shipment-telemetry` | 4 | ✅ throttled 10s |
| V → D | `POST /api/webhooks/vayu/shipment-excursion` | 5 | ✅ pre-arrival warning |
| V → D | `POST /api/webhooks/vayu/complaint-status` | 6 | ✅ + RCA |

**Payload envelope:** senders wrap payloads as `{ type, data }` so the receiver can log the event type without parsing the URL. **Every inbound route accepts both the envelope and a bare body.**

> This was a real bug. `/api/orders/incoming` validated `req.body` directly while its three sibling routes unwrapped `.data`. The Phase 3 gate route was the only one that didn't — so *every* cross-app order placement failed with a 400 while auth was perfectly fine. Consistency here is load-bearing.

### 5.2 Non-negotiables ✅ all implemented and tested

**HMAC signing.** Every cross-app request carries:

```
X-MedTrack-Signature: sha256=<hmac(sharedSecret, timestamp + "." + rawBody)>
X-MedTrack-Timestamp: <unix seconds>
X-MedTrack-Event-Id:  <uuid>
```

Reject on a timestamp older than 5 minutes or a bad signature; compare with `timingSafeEqual`, **never `===`** — a plain compare leaks signature bytes through timing.

⚠️ **The raw body matters.** The signature covers the exact bytes the sender hashed. Fastify parses JSON before handlers run, and `JSON.stringify` of the parsed object is **not** guaranteed to reproduce those bytes — key order and whitespace can differ, and every signature would fail. Both servers capture the raw body in a content-type parser and verify against that. Proven by the tampered-body test: had we re-serialized, a forged payload would have passed.

**Idempotency.** Store every seen `X-MedTrack-Event-Id` in `ProcessedEvent`. Duplicate → `200`, do nothing.

⚠️ **Insert-and-catch, not check-then-insert.** A `findUnique` followed by a `create` has a race window: two concurrent redeliveries both read "not seen", both proceed, and the order is applied twice. Both servers attempt the insert first and treat a P2002 unique violation as proof someone else won — **the database arbitrates, so the check is atomic.** If the work throws, the claim is released so a legitimate retry can still succeed.

**Retry with backoff.** `OutboundEvent` + a worker at `1s, 4s, 16s, 60s`, then park as `FAILED` with a manual `replay()`. The event id is **stable across retries** so the receiver's idempotency guard sees a redelivery as a duplicate, not a new event.

✅ Verified: attempts climbed 1→2→3→4, then **all parked as FAILED — no infinite retry** — and manual replay reset them to PENDING.

### 5.3 Real-time — SSE ✅

Webhooks are server→server. **They do not update a React page.**

```
GET /api/stream/shipments/:id  → text/event-stream
```

Events: `position`, `temperature`, `excursion`, `status`. Served from **Fastify, not a Next.js route handler** (§3.3).

- **Not WebSockets** — bidirectional complexity you don't need.
- **Not polling** — a 2-second poll looks janky next to a smooth SSE-driven marker.
- CORS headers are set on the **raw** response, since it bypasses Fastify's serializer.
- History is decimated to 200 points and sent first, so a late joiner renders a populated chart immediately.
- 5-minute cap + client reconnect; the `EventSource` is always closed in cleanup. **A leaked stream is a real bug.**

✅ Verified: 25 live events delivered across all four types during a 90-tick ingest run.

---

## 6. Subsystem Specs

### 6.1 Telemetry pipeline ✅

```
Simulator OR ESP32+DS18B20+NEO-6M
     │  identical JSON, identical endpoint
     ▼
POST /api/sensors/ingest
{ deviceId, shipmentId, ts, lat, lng, tempC, humidity?, battery? }
     │
     ├─► write TelemetryPoint
     ├─► update Shipment.lastKnown*, progressPct
     ├─► SSE push to Vayu clients
     ├─► throttled webhook → Dhanvantari (10s cadence)
     └─► excursion detector
```

**Excursion detection uses hysteresis, not a bare threshold.** A single stray reading at 8.1 °C is sensor noise, not a spoiled vaccine. Fires only after **≥3 consecutive out-of-band readings or ≥60 seconds**, and closes after 3 consecutive readings back in band.

| Severity | Rule (2–8 °C product) |
|---|---|
| MINOR | out of band < 15 min, deviation < 2 °C |
| MAJOR | 15–60 min, or deviation 2–5 °C |
| CRITICAL | > 60 min, or deviation > 5 °C, or **any reading below 0 °C** |

Freezing is special-cased because it destroys most vaccines and is worse than mild warming — a detail worth stating on stage.

The detector is **pure and synchronous** (no DB, no clock) so the rules are directly testable. ✅ 12 unit cases pass, including the two that matter most: a single 8.1 °C spike is ignored, and two-out-then-recover is ignored.

The band is the **strictest across all drugs in a consignment**, since one shipment must satisfy every product in it. This logic lives **only in vayu-api**; Dhanvantari is told the result.

### 6.2 Hardware path (optional, do last)

ESP32 + **DS18B20** (±0.5 °C — better than DHT22, which is only rated to 0 °C) + NEO-6M GPS. Posts the exact payload above.

The simulator and the hardware use the same endpoint and the same JSON, so the swap needs zero server change. **Do not let hardware block software progress.**

### 6.3 Complaint RCA agent — grounded-first

**Step 1 — deterministic evidence bundle (code, no LLM):** complaint, product band, excursions with duration and peak, shipment transit/delay/ambient, and history (same-route, same-carrier, same-batch counts).

**Step 2 — LLM narrates only.** *"Explain the probable cause and recommend corrective actions using ONLY the evidence below. Cite specific figures. If the evidence is insufficient, say so."* Temperature 0.2.

**It cannot invent a number, because it is never asked to produce one.** Say that sentence in the pitch.

Status: ⬜ Nidana `/rca` is a stub. `Complaint.rcaJson` and the `complaint.rca` intent are wired and waiting.

### 6.4 Forecasting & risk

**Forecast (⬜ pending):** LightGBM — one point regressor + two quantile regressors (`alpha=0.10`, `alpha=0.90`). Features: lags 1/2/3/6/12, rolling mean & std 3/6/12, **month sin/cos (cyclical, not integer months** — integer months teach the tree December ≫ January), institution tier, drug category, disease index. Validate with a chronological split; report MAPE **and coverage of the 80% band** — if coverage is 40%, the bands are cosmetic and a sharp judge will catch it.

**Explainability:** `shap.TreeExplainer`, top 3–5 attributions, mapped to plain language via a lookup table. **Never show raw feature names in the UI.**

**Risk (✅ live via TS fallback):** deterministic weighted sum over **five** signals — cover days, consumption trend, below reorder point, disease signal, and supplier reliability (the 5th was added once the shipment layer existed).

**Confidence is signal AGREEMENT, not model certainty:** `high` when ≥3 of 5 signals point the same way, `medium` at 2, `low` at 1. This rule is visible in the UI, and it is what makes *"we don't cry wolf"* true.

✅ Verified: Sion District Hospital / ORS Sachet → **HIGH, score 0.61, confidence high**, with five plain-language explanations.

### 6.5 Route optimization ⬜

One warehouse, N deliveries, one vehicle → open TSP. **Nearest-neighbour, then 2-opt.** NN alone lands ~25% above optimal and leaves visibly crossing routes; 2-opt takes it to ~5% and removes every crossing. **Judges look at the map, and crossings look like a bug.**

Haversine by default, OSRM public demo API for road distances. **Skip Google Maps Directions** — billing card, hard external dependency.

Show a before/after with `km saved` and **`cold-chain minutes-at-risk saved`**. That second number is the one nobody else will have.

### 6.6 Offline (PWA) ⬜

**One flow only: batch scan-in at the receiving dock.** That's where connectivity actually fails.

✅ The server half is already done: `confirm-receipt` **upserts on `batchId`**, so a replayed offline queue cannot double-count stock. Replayed queues are the classic offline bug.

**Do not** attempt offline POS, forecasting, or maps.

---

## 7. The Chatbot — Grounding Contract ✅ both sides live

### 7.1 Architecture

```
user question
     │
     ▼
[1] INTENT CLASSIFIER  (keyword — instant, and immune to an LLM outage)
     │
     ▼
[2] TOOL DISPATCH  ── hand-written, parameterised Prisma per intent
    → evidence JSON, scoped to the caller's org
     │
     ▼
[3] LLM NARRATION  "explain using ONLY this evidence; cite the numbers"
    → falls back to deterministic template narration
     │
     ▼
answer + evidence panel
```

**Three rules, stated on stage:**
1. **The LLM never sees the database.** It sees a JSON evidence bundle.
2. **Every answer ships with the evidence panel that produced it.**
3. **Scope is enforced server-side, before the LLM is invoked.**

Rule 3 is **structural, not a filter**: `dhanvantari-api` can only reach the `dhanvantari` schema, which holds one institution's data. *"Dhanvantari's bot physically cannot read another institution's data"* is true because of the architecture.

### 7.2 Institution side (Dhanvantari) — own data only ✅

`stock.level` · `stock.expiring` · `consumption.trend` · `reorder.suggest` (Nidana-scored) · `shipment.delayed` · `shipment.eta` · `coldchain.status` · `complaint.list` · `complaint.status` · `supplier.score` · `order.status` · `drug.info` · `out_of_scope`

✅ Verified: 7 intents routed, **all under 5 ms**, out-of-scope guarded.

### 7.3 Manufacturer side (Vayu) — whole network ✅

`order.queue` · `coldchain.incidents` · `institution.reliability` · `risk.summary` · `batch.trace` · `consumption.network` · `complaint.rca` · `diagnosis.stockout` — plus `demand.forecast`, `route.performance`, `coverage.gap`, `wastage.flag` which return an **explicit not-implemented rather than a wrong answer**.

✅ Verified: 7 intents, all under 35 ms — well inside the §9 gate of 6 questions in <3 s.

### 7.4 Implementation notes

- **Keyword classification, not LLM classification**, so intent routing survives an API outage or rate limit mid-demo.
- **Never generate SQL from an LLM.** Every query is hand-written and parameterised. Text-to-SQL is a security hole and a hallucination surface, and it will fail live.
- **Template narration fallback** whenever `ANTHROPIC_API_KEY` is absent or the call fails. An assistant that dies when an API is rate-limited is not demo-safe.
- **Log every `(question → intent → evidence → answer)` tuple.** *"If a judge says 'prove it isn't making that up,' you open the log."*

---

## 8. Repo Structure — as built

```
web/
├── frontend/                    UI only — no Prisma, no secrets
│   ├── vayu/            :3000   12 screens ✅
│   │   ├── app/(12 route dirs)/page.tsx
│   │   ├── components/{Nav,ui}.tsx
│   │   └── lib/{api,theme}.ts
│   └── dhanvantari/     :3001   scaffold ⬜
│
├── backend/
│   ├── vayu-api/        :4000   Fastify + Prisma — schema `vayu` ✅
│   │   ├── src/lib/{prisma,hmac-middleware,idempotency,nidana-client}.ts
│   │   ├── src/lib/telemetry/{excursion-detector,sse-hub}.ts
│   │   ├── src/lib/webhooks/dispatch.ts
│   │   └── src/routes/{catalog,batches,orders,sensors,stream,
│   │                   complaints,consumption,shipments,assistant}/
│   │
│   ├── dhanvantari-api/ :4001   Fastify + Prisma — schema `dhanvantari` ✅
│   │   ├── src/lib/{prisma,nidana-client}.ts
│   │   ├── src/lib/outbound/{queue,sender}.ts
│   │   ├── src/lib/webhooks/{verify-middleware,idempotency,receivers}.ts
│   │   ├── src/lib/stream/sse-hub.ts
│   │   └── src/routes/{inventory,pos,orders,stream,expo,
│   │                   supplier-scorecard,assistant}/
│   │
│   ├── nidana/          :8000   FastAPI — router stubs ⬜
│   ├── simulator/               stub ⬜
│   ├── packages/{contracts,crypto,ui}
│   ├── data-gen/                seed_vayu.mjs ✅
│   └── scripts/init-schemas.sql
│
├── ARCHITECTURE.md  CLAUDE.md  WORKPLAN.md  tasks_split.md
└── docker-compose.yml
```

**`packages/contracts` is not optional.** Both servers, both frontends and the Expo app import the same Zod schemas, so a payload change breaks the build instead of breaking the demo.

---

## 9. Build Order — status

| Phase | Work | Gate | Status |
|---|---|---|---|
| **0** | Monorepo, Postgres, two schemas, contracts, HMAC | Both apps boot, both connect | ✅ |
| **1** | Seed data | 12 months of believable history | ✅ Vayu · ⬜ Dhanvantari |
| **2** | Catalog, batch + QR, QC | Scan a QR → drug card renders | ✅ |
| **3** | **Order loop end-to-end** | 🔒 **Hard gate** | ✅ **CLOSED** |
| **4** | Shipment, ingest, SSE, live chart | Marker moves, graph ticks | ✅ API · ⬜ simulator |
| **5** | Excursion detection + cross-app warning | Spike → banner on the other app | ✅ |
| **6** | Scan-in + complaint round-trip | Two taps, zero manual ID entry | ✅ API |
| **7** | Risk score + drilldown | Every flag drills to 5 signals | ✅ TS fallback |
| **8** | Forecasting + SHAP | Band chart + top-3 reasons | ⬜ |
| **9** | Chatbot, both sides | 6 questions in <3 s | ✅ (<35 ms) |
| **10** | RCA, scorecards, coverage, routing | Nice-to-have | ✅ scorecard · ⬜ rest |
| **11** | Mobile, hardware, offline PWA | Cut freely | ⬜ |

### 🔒 Phase 3 gate — verified closed

```
D places order    -> 201, supplyOrderId 9c9f5f83
lands in V        -> YES, PENDING
V approves        -> 200, APPROVED
D status flips    -> YES, APPROVED
```

An order crosses two organisations over signed HTTP with **no shared tables**.

**If you're behind, cut in this order:** hardware → mobile → offline PWA → coverage gap → route optimizer → SHAP (fall back to rule-based "why") → RCA agent.

**Never cut:** the order loop, the live map + temp graph, the excursion cross-app warning, the complaint round-trip, the chatbot. *All five are now built.*

---

## 10. Datasets

| Dataset | Source | Type | Status |
|---|---|---|---|
| Drug catalogue | NLEM-derived, 10 items with cold-chain bands | Real-ish | ✅ |
| Facility master | 7 institutions across 4 districts | Real-ish | ✅ |
| Consumption time-series | Generated — trend + seasonal sine + reporting noise | Synthetic | ✅ 96 rows |
| Batches / QC | 10 lots, 8 QC records incl. a FAIL | Synthetic | ✅ |
| Orders / shipments / excursions | 9 / 6 / 4 (MINOR → open CRITICAL) | Synthetic | ✅ |
| Telemetry | 90 points, peak 12.38 °C, 18 out-of-band | Synthetic | ✅ |
| Disease/seasonal signal | IDSP or a hand-built monsoon calendar | Mixed | ⬜ |
| Route polylines | 8–10 corridors via OSRM | Real | ⬜ |

**Generator quality matters more than volume.** `backend/data-gen/seed_vayu.mjs` *(on `feat/vayu-web`, unmerged at time of writing)* preserves the mockup's relational graph — `SO-2026-0181 → SHP-8F2A → batch IG-2608-A → complaint`, with a matching excursion — so batch trace and RCA have something true to find.

Consumption is **deliberately not clean**: trend + seasonal sine + reporting noise. A too-tidy generator makes every downstream feature look fake. Seeded excursion severities follow the same §6.1 rules the live detector applies, so **seeded history and runtime detection agree rather than contradict**.

The timeline re-bases onto today, so the approval queue always reads 5 h / 2 h / 48 m as designed.

---

## 11. Demo Script (7 minutes)

| t | Beat | Line |
|---|---|---|
| 0:00 | **The gap.** Two windows side by side. | *"Once a drug leaves the factory, it's a black box until someone signs for it. Everything you see next is that box, opened."* |
| 0:40 | Low stock → one-tap reorder → order lands in Vayu | *"No phone call, no email, no spreadsheet."* |
| 1:20 | Approve → build shipment → QR manifest → dispatch | |
| 1:50 | **Live map + temp graph, both screens.** | *"Zomato for medicine — except we also watch the temperature."* |
| 2:30 | **Inject the spike.** Excursion fires in Vayu → warning banner in Dhanvantari **before arrival**. | *"The hospital knows the insulin is compromised before the truck reaches the gate. Today they'd find out weeks later, when patients stopped responding."* |
| 3:20 | Scan-in: QR → batch resolved, photo, complaint in two taps | *"No form. No batch number typed. Scan, photo, send."* |
| 4:00 | Complaint lands in Vayu **pre-linked** → RCA gives cause + fix | *"47-minute excursion, Igatpuri ghat, sixth on this carrier in 90 days. The AI didn't guess that — it's reading our own telemetry."* |
| 4:50 | **Risk drilldown.** Click a red flag → 5 signals. | *"We don't cry wolf. Five independent signals had to agree, and you can see exactly which."* |
| 5:30 | **Chatbot:** *"Why does Nashik keep running out of ORS?"* | *"The model never touched our database. It got a JSON evidence bundle and explained it. It cannot invent a number it was never given."* |
| 6:20 | **Coverage gap + supplier scorecard.** | *"PS-SS04 asks for vendor activity tracking. We score accountability in both directions."* |
| 6:50 | Close | *"Right product, right place, right time, right condition — and for the first time, provable."* |

✅ The 2:30 beat is real: verified with the institution warned **120 minutes before ETA**, and the QR scan surfacing `anomaly: true` so the worker sees the breach before accepting stock.

**Pre-flight, 30 minutes before:** seed reset tested; Nidana warmed; `NIDANA_FORCE_FALLBACK=true` exercised once; six chatbot answers cached; simulator on a 90-second route; **screen-recorded backup of the full flow on the laptop.**

---

## 12. Risk Register

| Risk | Severity | Mitigation | Status |
|---|---|---|---|
| Two-app sync half-finished | 🔴 | Phase 3 hard gate | ✅ Closed |
| Nidana cold start / deploy failure | 🔴 | TS fallback in both servers, shipped first | ✅ Mitigated |
| LLM API down or rate-limited on stage | 🔴 | Keyword intent + template narration | ✅ Mitigated |
| Venue wifi drops mid-demo | 🔴 | Retry queue + local `.mp4` + localhost | ✅ Queue live |
| Prisma clients overwriting each other | 🟠 | Per-service `output` dir — §4.4 | ✅ Fixed |
| SSE dies on long sessions | 🟠 | 5-min cap + client reconnect | ✅ |
| Telemetry table bloat | 🟠 | Server-side decimation to 200 points | ✅ |
| Dhanvantari frontend not built | 🟠 | Vayu frontend proves the pattern; port it | ⬜ Open |
| Simulator not built | 🟠 | Ingest endpoint accepts any client; seed provides history | ⬜ Open |
| Terminology confusion in judging | 🟡 | §1 — fix the words in the UI | ✅ |
| Synthetic data looks fake | 🟡 | Personality-driven generators + noise | ✅ |

---

## 13. What Changed

**v1 → v1.1:** corrected the false "Dhanvantari ~60% built" premise; expanded Phase 0; moved `Drug`/`Inventory`/`Dispense` from "existing" to "to build".

**v1.1 → v2 (this document):**

**Structural:**
- **Frontend/backend hard split** — five deployables, not three. Frontends are UI-only; two Fastify servers own all data and secrets (§3.3).
- **SSE moved from Next.js route handlers to Fastify.** Removes the Vercel 300s cap; makes CORS mandatory (§5.3).
- `apps/` + `services/` → `frontend/` + `backend/`.

**Added since v1.1:**
- `LocalComplaint.remoteId`, without which the RCA push-down cannot match a row (§4.3).
- Per-service Prisma client `output` dirs, and the relative-path import in `lib/prisma.ts` (§4.4).
- `{ type, data }` payload envelope, accepted by every inbound route (§5.1).
- Supplier Scorecard, computed from observed delivery history (§1).
- `seed_vayu.mjs`, preserving the mockup's relational graph (§10).

**Bugs found by integration, now fixed:**
- `/api/orders/incoming` didn't unwrap the payload envelope — **every cross-app order placement failed with a 400** while auth was fine.
- `GET /api/batches` omitted `qcRecords`, so the QC screen reported passed batches as "awaiting QC" — wrong rather than merely incomplete.
- `tsx watch` doesn't forward `--env-file` to its respawned child, so `.env` is now loaded in `index.ts`.

**Still cut:** YOLOv8 fine-tuning, Google Maps Directions billing dependency, offline-everything, the standalone single-app MedTrack architecture.

---

## 14. What's Left

In dependency order:

1. **`frontend/dhanvantari`** — 12 screens against a complete API. `frontend/vayu` is the proven pattern; port it.
2. **Dhanvantari seed data** — its assistant currently reports honest zeros.
3. **`backend/simulator`** — the ingest endpoint and SSE are live and waiting; this drives the 1:50 and 2:30 demo beats live rather than from seeded history.
4. **`backend/nidana`** — risk first (Phase 7, deterministic, no ML), then forecast + SHAP (Phase 8), then RCA and routing (Phase 10). Every call already has a working TS fallback, so nothing is blocked.
5. **Expo app** — `dhanvantari-api` already serves its entire surface; it never needs to know `vayu-api` exists.
