# MedTrack — Architecture Decision & Validated Build Plan (v1.1)

**Problem Statement:** PS-SS04 — Drug Inventory and Supply Chain Tracking System
**Status:** Architecture decided. Greenfield build.

> **v1.1 correction.** The v1 doc stated *"Dhanvantari — vendor/hospital side (Next.js, **already ~60% built**)"*. This is **false**. Verified: no Dhanvantari, Vayu, or MedTrack code exists. Both apps are built from zero.
>
> The architecture below is unchanged. What changes is **phasing and effort**: Phase 0 scaffolds two Next.js apps from scratch, and every "existing inventory/POS untouched" note in §4.3 becomes work to be done, not work already done. See §9 for the revised build order.

---

## 0. TL;DR — The Decision

Three deployables:

| Service | Role | Stack |
|---|---|---|
| **Vayu** | Manufacturer / supplier side | Next.js 15 App Router |
| **Dhanvantari** | Institution (hospital/CHC/PHC) side | Next.js 15 App Router |
| **Nidana** | Intelligence service — *Ayurvedic term for diagnosis/etiology* | Python / FastAPI |

**Vayu** — catalog, batches, QC, supply-order approval, shipment dispatch, telemetry, evidence layer.
**Dhanvantari** — inventory, POS, scan-in, complaints, reorder.
**Nidana** — forecasting, multi-signal risk scoring, complaint root-cause analysis, route optimization. **Stateless. Both apps call it. It owns no user data.**

The single most important structural decision: **the AI/analytics is a shared service, not duplicated per app.** Otherwise you write the forecasting logic twice, in TypeScript, badly.

### Repo split

| Repo | Contains |
|---|---|
| [`aryabailur/Medpharm`](https://github.com/aryabailur/Medpharm) (web) | `apps/vayu`, `apps/dhanvantari`, `services/nidana`, `services/simulator`, `packages/*`, `data-gen/` |
| [`wilbert0838n/medpharm-app`](https://github.com/wilbert0838n/medpharm-app) (app) | Expo React Native — scan-in, photo capture, complaint filing |

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

You need **both directions**, and the *Supplier Scorecard* is the one PS-SS04 explicitly asks for.

> Demo line: *"PS-SS04 asks for vendor activity tracking. We score accountability in both directions — the institution can see its supplier's on-time %, and the supplier can see which institutions mishandle stock."*

**Fix the words in the UI, not just the pitch.**

---

## 2. USP Validation

| # | USP | Verdict | Reasoning |
|---|---|---|---|
| 1 | Photo-to-Stock Capture (YOLOv8) | 🟡 **Rebuild** | §2.1 — highest-risk, lowest-return item. Keep the *idea*, kill the *implementation*. |
| 2 | Explainable Forecasting (LightGBM + SHAP) | 🟢 **Keep** | Cheap, genuinely differentiating, works on synthetic data. Lives in Nidana. |
| 3 | Multi-Signal Risk Score + drilldown | 🟢 **Keep — hero feature** | Deterministic, no training, impossible to hallucinate, demos beautifully. Best effort-to-impact ratio available. |
| 4 | Vendor Accountability Scorecard | 🟢 **Keep + split in two** | §1. Must be bidirectional. |
| 5 | Conversational Diagnosis Assistant | 🟢 **Keep — this is the chatbot** | Spec'd in §7. |
| 6 | Coverage Gap Finder | 🟡 **Keep, Vayu-side only** | Only meaningful when one actor sees many institutions. Meaningless inside a single hospital's app. |
| — | Cold chain + GPS + complaint RCA | 🟢 **Add as USP #1** | Most *visible* differentiator; directly serves the PS's *"Right Condition"*. |
| — | Optimized shipment routing | 🟡 **Keep, scope down** | §6.5. Heuristic only. No Google Maps billing. |

### 2.1 Photo-to-Stock Capture — the honest assessment

**The plan as written:** self-collect 50–100 images per class, label in Roboflow, fine-tune YOLOv8n to count boxes/strips/vials.

**Why it fails in a hackathon:**
- 50–100 images per class is *far* below what's needed for reliable counting of occluded, stacked, identical boxes. Counting is harder than detection, and packed pharmacy shelves are the worst case.
- Barcode/QR is ~100% accurate and instant. **Training a model to do worse than a barcode you already scan is negative-value work.**
- If it misfires on stage, "confirm-before-commit" reads as an excuse rather than a design principle.

**Replace with a three-tier capture ladder** (same UX, same pitch line):

| Tier | Method | When |
|---|---|---|
| 1 | **QR / barcode scan** → resolves batch, drug, expiry, QC status, cold-chain flag from the batch registry | Default. Anything shipped through Vayu has a Vayu-generated QR. |
| 2 | **Label photo → OCR** (Tesseract or a vision-LLM call) → fuzzy-match against the NLEM catalogue | Legacy stock with no Vayu QR |
| 3 | **Manual / photo-assisted count** — generic vision model estimates a count with confidence; worker confirms or corrects | Quantity step, always human-confirmed |

You keep every argument that made the USP good — low-literacy friendly, no typing, confirm-before-commit, offline-first, live dashboard update — and delete the model-training risk. **Do not spend a single day fine-tuning YOLOv8.**

> Pitch line: *"A worker who cannot type can still keep inventory accurate: point the camera, confirm one number. And the AI never commits silently — it proposes, a human confirms."*

---

## 3. Final Architecture

```
┌──────────────────────────┐      ┌──────────────────────────┐
│  VAYU (manufacturer)     │      │ DHANVANTARI (institution)│
│  Next.js 15 App Router   │      │  Next.js 15 App Router   │
│                          │      │                          │
│  catalog / batch / QC    │      │  inventory / POS / billing│
│  supply order approval   │      │  supply order placement  │
│  shipment dispatch       │      │  scan-in + photo evidence│
│  telemetry console       │      │  complaint filing        │
│  evidence layer          │      │  supplier scorecard      │
│  chatbot (network scope) │      │  chatbot (own-data scope)│
└───────┬──────────┬───────┘      └────────┬─────────┬───────┘
        │          │                       │         │
        │          │  signed webhooks +    │         │
        │          │◄──── REST (HMAC) ────►│         │
        │          │                       │         │
        │   Postgres schema: vayu    Postgres schema: dhanvantari
        │      (Prisma client A)        (Prisma client B)
        │          └───────────┬───────────┘
        │                      │  ONE Postgres instance,
        │                      │  TWO logically isolated schemas.
        │                      │  No cross-schema FKs. Ever.
        ▼                      ▼
┌───────────────────────────────────────────────────────────┐
│  NIDANA — Intelligence Service (FastAPI + Pydantic)       │
│  STATELESS. Receives data in the request. Owns no tables. │
│                                                           │
│  POST /forecast          LightGBM point + P10/P90 + SHAP  │
│  POST /risk              deterministic 5-signal + drill   │
│  POST /rca               complaint root-cause evidence    │
│  POST /route/optimize    NN + 2-opt over haversine/OSRM   │
│  POST /assistant/explain LLM narration over given evidence│
└───────────────────────────────────────────────────────────┘
                            ▲
┌───────────────────────────┴────┐
│ SIMULATOR (Node worker / CLI)  │ drives GPS + temperature along a route,
│ POSTs to Vayu /api/sensors/    │ identical payload shape to ESP32+DS18B20+GPS
│ ingest at 1–2 Hz               │ → hardware swap needs zero code change
└────────────────────────────────┘
```

### 3.1 Why one Postgres instance with two schemas

In production these are two organizations with two databases. But two managed Postgres instances means two connection strings, two migration pipelines, two failure modes on demo day, and roughly zero additional marks.

**Compromise:** one Postgres instance, two schemas (`vayu`, `dhanvantari`), two separate Prisma clients, **no foreign keys across the boundary**, and all cross-app data movement forced through the HTTP contract in §5.

> You can truthfully tell judges: *"The two apps share no tables. Every cross-organization interaction goes over a signed HTTP contract — we could move either app to a separate database tomorrow by changing one connection string."* That is true, because it is.

### 3.2 Why Nidana is a separate Python service

- LightGBM + SHAP + scikit-learn have no usable TypeScript equivalent. Reimplementing quantile regression in TS wastes a day.
- Both apps need forecasting and risk scoring. A shared service means you write it **once**.
- Stateless → can't desync, can't hold stale data, needs no migrations.

**Fallback:** every Nidana endpoint has a deterministic TypeScript fallback (rolling-mean forecast, weighted-sum risk). **Ship the fallback path first, then swap in the real model.** Never let Nidana be a single point of demo failure.

**Deploy:** Render / Railway / Fly.io free tier. Warm it with a cron ping 10 minutes before the demo — cold starts on free tiers are 30+ seconds and will kill your pitch.

---

## 4. Data Model

### 4.1 The shared identity contract

Three IDs are **UUIDv7**, global, immutable, meaningful in both databases:

- `batchId` — one manufactured lot
- `shipmentId` — one physical consignment (contains many batches)
- `supplyOrderId` — one request from an institution

Everything else is local. **Neither app ever guesses an ID; it only ever echoes one it received.**

### 4.2 Vayu schema

```
Drug            id, name, genericName, nlemCode, category, packSize,
                coldChain: bool, minTempC, maxTempC, shelfLifeDays

Batch           id (UUIDv7), drugId, lotNumber, mfgDate, expiryDate,
                quantity, qrPayload, status: MANUFACTURED|QC_APPROVED|
                QC_FAILED|WAREHOUSED|DISPATCHED|DELIVERED

QCRecord        id, batchId, result: PASS|FAIL, inspector, notes, testedAt,
                certificateUrl

Institution     id, name, type: PHC|CHC|DISTRICT_HOSPITAL|WAREHOUSE|RETAIL,
                district, state, lat, lng, population, tier

SupplyOrder     id (UUIDv7), institutionId, status: PENDING|APPROVED|
                PARTIAL|REJECTED|DISPATCHED|DELIVERED, requestedWindow,
                rejectionReason, placedAt
SupplyOrderLine orderId, drugId, qtyRequested, qtyApproved

Shipment        id (UUIDv7), supplyOrderId, originWarehouseId,
                destinationInstitutionId, status: DRAFT|DISPATCHED|
                IN_TRANSIT|OUT_FOR_DELIVERY|DELIVERED|EXCEPTION,
                dispatchedAt, etaAt, deliveredAt, routePolyline,
                coldChain: bool, excursionCount
ShipmentBatch   shipmentId, batchId, quantity

TelemetryPoint  id, shipmentId, ts, lat, lng, tempC, humidity,
                source: SIMULATED|DEVICE, deviceId
                -- index (shipmentId, ts); gets big, downsample on read

Excursion       id, shipmentId, startedAt, endedAt, minTempC, maxTempC,
                durationMin, severity: MINOR|MAJOR|CRITICAL, acknowledged

Complaint       id, shipmentId, batchId, institutionId,
                category: BREAKAGE|QTY_MISMATCH|SEAL_TAMPERED|
                          TEMP_DAMAGE|WRONG_ITEM|NEAR_EXPIRY,
                description, photoUrls[], filedAt,
                status: OPEN|INVESTIGATING|RESOLVED,
                assignedTeam: QC|LOGISTICS, resolutionNotes,
                rcaJson  -- Nidana output, cached

ConsumptionFeed id, institutionId, drugId, periodMonth,
                opening, received, dispensed, closing, receivedAt
                -- pushed up from Dhanvantari

OutboundEvent   id, type, payloadJson, targetUrl, attempts,
                status: PENDING|SENT|FAILED, nextRetryAt
```

### 4.3 Dhanvantari schema

> **v1.1:** v1 said "new models only (existing inventory/POS untouched)". There is no existing inventory/POS — **`Drug`, `Inventory`, `StockItem`, and the POS/dispensing ledger must all be built.** They are listed first below.

```
-- BUILT FROM SCRATCH (v1 wrongly assumed these existed)
Drug            local catalogue mirror: id, name, genericName, nlemCode,
                category, packSize, coldChain, unitPrice
Inventory       id, drugId, batchRef, qtyOnHand, reorderPoint, expiryDate,
                location, updatedAt
Dispense        id, drugId, batchRef, qty, dispensedAt, dispensedBy,
                patientRef?  -- the POS / dispensing ledger

-- CROSS-APP MODELS
IncomingShipment id (= Vayu shipmentId), supplyOrderId, status, etaAt,
                coldChain, anomalyFlag, lastKnownLat, lastKnownLng,
                lastTempC, progressPct

ReceivedBatch   id (= Vayu batchId), incomingShipmentId, drugRef,
                qtyExpected, qtyReceived, conditionPhotoUrls[],
                scannedAt, scannedBy, accepted: bool

LocalComplaint  id, batchId, shipmentId, category, description,
                photoUrls[], filedAt, remoteStatus, rcaSummary

SupplierScore   supplierId, onTimePct, rejectionRatePct,
                priceVariancePct, excursionRate, computedAt

OutboundEvent   id, type, payloadJson, targetUrl, attempts,
                status: PENDING|SENT|FAILED, nextRetryAt
```

### 4.4 Prisma notes

- `TelemetryPoint` will be your largest table. **Write raw, read downsampled** — query by `shipmentId` ordered by `ts`, then decimate to ~200 points server-side before sending to Recharts. **Do not ship 4,000 points to the browser.**
- Index `(shipmentId, ts)`; `(status)` on Shipment; `(status, filedAt)` on Complaint.
- Keep `rcaJson` and `signals` as `Json` columns. They're read-mostly display payloads; don't normalize them.

---

## 5. Cross-App Contract

### 5.1 Endpoints

| Direction | Endpoint | Method | Purpose |
|---|---|---|---|
| D → V | `/api/orders/incoming` | POST | Place supply order |
| D → V | `/api/complaints/incoming` | POST | File complaint (+ photo URLs) |
| D → V | `/api/consumption/report` | POST | Periodic consumption push |
| D → V | `/api/shipments/:id/confirm-receipt` | POST | Scan-in complete |
| V → D | webhook `order.status_changed` | POST | Pending→Approved→Dispatched |
| V → D | webhook `shipment.dispatched` | POST | Manifest + route + ETA |
| V → D | webhook `shipment.telemetry` | POST | Throttled position/temp (every 10s, not every tick) |
| V → D | webhook `shipment.excursion` | POST | **Cold chain breach — pre-arrival warning** |
| V → D | webhook `complaint.status_changed` | POST | Open→Investigating→Resolved + RCA |

### 5.2 Non-negotiables

**HMAC signing.** Every request carries:

```
X-MedTrack-Signature: sha256=<hmac(sharedSecret, timestamp + "." + rawBody)>
X-MedTrack-Timestamp: <unix seconds>
X-MedTrack-Event-Id:  <uuid>
```

Reject if the timestamp is more than 5 minutes old (replay protection) or the signature fails. **Use a constant-time compare.** Judges *will* ask "how is this secure between two organizations" — this is a 30-line answer that lands.

**Idempotency.** Store every seen `X-MedTrack-Event-Id`. Duplicate → return `200` and do nothing. Webhooks retry; without this you get double stock entries on stage.

**Retry with backoff.** `OutboundEvent` table + a worker that retries `1s, 4s, 16s, 60s` then parks as `FAILED` with a manual replay button in an admin panel. When the demo wifi drops for 3 seconds, this is what saves you.

### 5.3 The real-time gap

Webhooks are server→server. **They do not update a React page.**

**Decision: Server-Sent Events.** One endpoint per app:

```
GET /api/stream/shipments/:id  → text/event-stream
```

Push `position`, `temperature`, `excursion`, `status` events. SSE is one-directional (all you need), works over plain HTTP, needs no extra infra, ~40 lines with `ReadableStream` in a Next.js route handler.

- **Not WebSockets** — bidirectional complexity you don't need, and serverless-hostile.
- **Not polling** — a 2-second poll looks janky next to a smooth SSE-driven marker.
- **Vercel caveat:** SSE on Vercel serverless caps around 300s. Demo shipments run 60–120s, so you're fine — but **cap the stream at 5 minutes and auto-reconnect client-side**.

---

## 6. Subsystem Specs

### 6.1 Telemetry pipeline (GPS + cold chain)

```
Simulator OR ESP32+DS18B20+NEO-6M
     │  identical JSON, identical endpoint
     ▼
POST /api/sensors/ingest
{ deviceId, shipmentId, ts, lat, lng, tempC, humidity?, battery? }
     │
     ├─► write TelemetryPoint
     ├─► update Shipment.lastKnown*, progressPct, etaAt
     ├─► SSE push to Vayu clients
     ├─► throttled webhook → Dhanvantari (10s cadence)
     └─► excursion detector
```

**Excursion detection — use hysteresis, not a bare threshold.** A single stray reading at 8.1 °C is sensor noise, not a spoiled vaccine. Fire only when out of band for **≥ 3 consecutive readings or ≥ 60 seconds**, then classify:

| Severity | Rule (for a 2–8 °C product) |
|---|---|
| MINOR | out of band < 15 min, deviation < 2 °C |
| MAJOR | out of band 15–60 min, or deviation 2–5 °C |
| CRITICAL | out of band > 60 min, or deviation > 5 °C, or **any excursion below 0 °C** (freezing destroys most vaccines and is worse than mild warming — call this out on stage, it reads as domain knowledge) |

Close the excursion when readings are back in band for 3 consecutive ticks. Store start, end, duration, min/max, and mean kinetic exposure.

**"Zomato-style" progress:** `DRAFT → DISPATCHED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`, rendered as a vertical stepper with timestamps beside the map.
`progressPct = distanceCovered / totalRouteDistance`; `etaAt = now + (remainingDistance / rollingAvgSpeed)`.

### 6.2 Hardware path (optional, do last)

ESP32 + **DS18B20** (waterproof probe, ±0.5 °C — better than DHT22, which is only rated to 0 °C and is inaccurate below 5 °C) + NEO-6M GPS + SIM800L or phone hotspot. Posts the exact payload above every 10s.

> If you get one working: *"Same endpoint, same payload — we swapped the simulator for real hardware with no code change."*

If you don't, **the simulator alone is fully sufficient. Do not let hardware block software progress.**

### 6.3 Complaint RCA agent (`POST /rca`)

Build it **grounded-first**.

**Step 1 — deterministic evidence bundle (code, no LLM):**

```json
{
  "complaint": { "category": "TEMP_DAMAGE", "batchId": "...", "filedAt": "..." },
  "product":   { "drug": "Insulin Glargine", "band": "2-8C", "coldChain": true },
  "excursions": [{ "startedAt": "...", "durationMin": 47, "maxTempC": 14.2,
                   "severity": "MAJOR", "routeSegment": "Nashik–Igatpuri ghat" }],
  "shipment":  { "transitHours": 9.5, "delayVsEtaMin": 130,
                 "carrier": "...", "ambientMaxC": 38 },
  "history":   { "sameRouteExcursions90d": 4, "sameCarrierExcursions90d": 6,
                 "sameBatchComplaints": 2 }
}
```

**Step 2 — LLM narrates only.** Prompt: *"Explain the probable cause and recommend corrective actions using ONLY the evidence below. Cite specific figures. If the evidence is insufficient, say so."* Temperature 0.2.

**Step 3 — output**, shown to the manufacturer with the raw evidence panel beside it:

> **Probable cause:** 47-minute excursion peaking at 14.2 °C on the Nashik–Igatpuri segment, coinciding with a 130-minute transit delay in 38 °C ambient. Consistent with reefer capacity being exceeded during an unplanned halt. **Contributing pattern:** 6 excursions on this carrier in 90 days vs 1.2 network average.
> **Recommended actions:** (1) Re-validate this carrier's reefer unit. (2) Add a pre-cooled gel-pack buffer for this route in summer. (3) Quarantine the remaining units of this batch pending potency assay.

**It cannot invent a number, because it is never asked to produce one.** Say that sentence in the pitch.

### 6.4 Forecasting & risk (Nidana)

**Model:** LightGBM — one point regressor + two quantile regressors (`alpha=0.10`, `alpha=0.90`) for the band.

**Features:** lags 1/2/3/6/12, rolling mean & std 3/6/12, **month sin/cos (cyclical encoding, not a raw integer month** — integer months teach the tree that December ≫ January), institution tier, drug category, disease-signal index.

**Validation:** chronological split, hold out last 2 months. Report MAPE and **coverage of the 80% band** (should land near 80% — if it's at 40%, your bands are cosmetic and a sharp judge will catch it).

**Explainability:** `shap.TreeExplainer`, top 3–5 attributions, mapped to plain language via a lookup table (`lag_1 → "last month's consumption"`, `disease_idx → "rising malaria incidence in this district"`). **Never show raw feature names in the UI.**

**Guard:** train on synthetic data with an honest seasonal + trend + noise generator. If the generator is too clean, the model looks implausibly perfect. **Inject noise, stockout truncation, and reporting gaps deliberately.**

**Risk score** — deterministic weighted sum with drilldown JSON. Two additions:
- **Confidence = signal agreement:** `high` when ≥3 of 5 signals point the same way, `medium` at 2, `low` at 1. Make this rule visible in the UI tooltip.
- **5th signal: supplier reliability** (open excursions / late shipments against that institution's inbound pipeline).

### 6.5 Route optimization

**Problem shape:** one warehouse, N institution deliveries, one vehicle → open TSP.

**Do:** nearest-neighbour construction, then **2-opt improvement**. NN alone lands ~25% above optimal and produces visibly silly crossing routes on a map; 2-opt takes it to ~5% and removes every crossing. It's 30 lines. **Judges look at the map, and crossings look like a bug.**

**Distances:** haversine by default; **OSRM public demo API** for real road distances (free, no key, no billing). **Skip Google Maps Directions** — needs a billing card and adds a hard external dependency.

**Constraints worth adding** (each is one line, each buys a slide):
- Cold-chain deliveries first (minimize temperature-risk exposure window)
- Institutions with a CRITICAL stockout risk score jump the queue
- Vehicle capacity as a simple volume cap

**Show a before/after:** naive order vs optimized, with `km saved` and **`cold-chain minutes-at-risk saved`**. That second number is the one nobody else will have.

### 6.6 Offline (PWA)

**Scope it to one flow only: batch scan-in at the receiving dock.** That's where connectivity actually fails and where the offline story is credible.

- `next-pwa` + Workbox, IndexedDB queue of `{scan, photos, timestamp}`
- Background Sync where supported, manual retry banner where not
- **Deduplicate on `batchId` at the server** — replayed queues are the classic offline bug

**Do not** attempt offline POS, offline forecasting, or offline maps. Scope creep, and no judge will ask.

---

## 7. The Chatbot — Grounding Contract

**The chatbot answers strictly from these routes. It never queries freely and never writes.**

### 7.1 Architecture

```
user question
     │
     ▼
[1] INTENT CLASSIFIER  (LLM, temp 0, or keyword fallback)
    → { intent, entities: {drug?, institution?, period?, shipmentId?} }
     │
     ▼
[2] TOOL DISPATCH  ── deterministic SQL/Prisma from the tables below
    → evidence JSON (typed, from the DB, scoped to the caller's org)
     │
     ▼
[3] LLM NARRATION  "explain using ONLY this evidence; cite the numbers"
     │
     ▼
answer + evidence panel (the raw table/chart shown beside the prose)
```

**Three rules, stated on stage:**
1. **The LLM never sees the database.** It sees a JSON evidence bundle.
2. **Every answer ships with the evidence panel that produced it** — the user can check the model's work.
3. **Scope is enforced server-side by org, before the LLM is invoked.** Dhanvantari's bot physically cannot read another institution's data.

### 7.2 Institution side (Dhanvantari) — bot scope: **own data only**

| # | Intent | Example query | Data source | Computation | Response shape |
|---|---|---|---|---|---|
| V1 | `order.status` | "what's the status of my last order" | `SupplyOrder`, `IncomingShipment` | latest by `placedAt`, join shipment | status stepper + ETA |
| V2 | `shipment.delayed` | "which of my shipments are delayed" | `IncomingShipment` | `now > etaAt AND status != DELIVERED`, sorted by lateness | table: shipment, drug, days late |
| V3 | `shipment.eta` | "when is my next delivery expected" | `IncomingShipment` | min `etaAt` where status IN (DISPATCHED, IN_TRANSIT) | ETA + live map link |
| V4 | `coldchain.status` | "was my insulin shipment kept cold" | `IncomingShipment`, synced excursions | excursion list for shipment | temp graph + excursion badges |
| V5 | `stock.level` | "how much ORS do we have" | `Inventory` | current qty vs reorder point | number + low-stock flag |
| V6 | `stock.expiring` | "what's expiring in 60 days" | `Inventory` | `expiry <= now + 60d`, ordered | table + total value at risk |
| V7 | `consumption.trend` | "what did we consume last month" | `Dispense` ledger | sum dispensed by drug, MoM delta | bar chart + top movers |
| V8 | `reorder.suggest` | "what should I reorder" | `Inventory` + Nidana `/forecast` + `/risk` | items where forecast demand > cover days | ranked list + **one-tap order button** |
| V9 | `complaint.list` | "show me all open complaints" | `LocalComplaint` | `status != RESOLVED` | table + RCA summary per row |
| V10 | `complaint.status` | "what happened with the broken vials" | `LocalComplaint` | latest by category | status + manufacturer's RCA |
| V11 | `supplier.score` | "is this supplier reliable" | `SupplierScore` | on-time %, rejection %, excursion rate | scorecard card |
| V12 | `drug.info` | "what is this" *(after a scan)* | `Drug` catalogue, batch record | resolve QR → batch → drug | drug card: composition, storage, expiry, QC |
| — | `out_of_scope` | anything else | — | — | *"I can only answer questions about this facility's inventory, orders, shipments and complaints."* |

### 7.3 Manufacturer side (Vayu) — bot scope: **whole network**

| # | Intent | Example query | Data source | Computation | Response shape |
|---|---|---|---|---|---|
| M1 | `diagnosis.stockout` | "why does District X keep running low on ORS" | stock, consumption, `SupplyOrder`, `Excursion`, disease signal | multi-signal drilldown for that district+drug over 6 mo | **evidence-backed narrative + signal chart** ← *the money demo* |
| M2 | `demand.forecast` | "what will Nashik need next month" | Nidana `/forecast` | per-drug forecast + P10/P90 | table + band chart + SHAP drivers |
| M3 | `risk.summary` | "where are we about to stock out" | Nidana `/risk` across network | risk ≥ 0.7, sorted | ranked list, each drillable |
| M4 | `institution.reliability` | "which institutions report the most damage" | `Complaint` | complaint rate per 100 shipments | ranked table |
| M5 | `coldchain.incidents` | "how many excursions this month" | `Excursion` | count by severity, route, carrier | breakdown + worst-route callout |
| M6 | `route.performance` | "which route has the most cold chain failures" | `Excursion` + `Shipment` | excursions per 100 shipments by route | ranked routes + map overlay |
| M7 | `order.queue` | "what's pending approval" | `SupplyOrder` | `status = PENDING`, aged | queue with age flags |
| M8 | `batch.trace` | "trace batch B4417" | `Batch`, `Shipment`, `Complaint` | full custody chain | **timeline: mfg → QC → dispatch → transit → delivery → complaints** |
| M9 | `coverage.gap` | "which districts are underserved" | stock, `Institution.population` | stock-per-capita vs peer median | ranked list + choropleth |
| M10 | `consumption.network` | "which drug is moving fastest" | `ConsumptionFeed` | aggregate dispensed, MoM growth | leaderboard |
| M11 | `wastage.flag` | "where are we losing stock to expiry" | `ConsumptionFeed`, expiry data | expiry write-off rate per institution | ranked + ₹ value |
| M12 | `complaint.rca` | "what caused the Pune complaint" | `Complaint.rcaJson` | cached RCA (§6.3) | cause + recommended actions |

### 7.4 Implementation notes

- Use **tool/function calling** with the intents above as the tool schema. Don't roll your own intent classifier if the model does it better — but **do keep a keyword fallback** so the bot works if the LLM API is down or rate-limited mid-demo.
- **Cache aggressively.** Pre-warm the 6 demo questions. An 8-second LLM round trip on stage feels like a crash.
- **Never generate SQL from the LLM.** Every query is a hand-written, parameterized Prisma call. Text-to-SQL is a security hole and a hallucination surface, and it will fail live.
- **Log every `(question → intent → tool → evidence → answer)` tuple.** If a judge says "prove it isn't making that up," you open the log.

---

## 8. Repo Structure

### Web repo — `aryabailur/Medpharm`

```
medpharm/
├── apps/
│   ├── vayu/                       # Next.js — manufacturer
│   │   ├── app/(dashboard)/        # catalog, batches, orders, shipments,
│   │   │                           # telemetry, complaints, evidence, assistant
│   │   ├── app/api/
│   │   │   ├── orders/incoming/
│   │   │   ├── complaints/incoming/
│   │   │   ├── consumption/report/
│   │   │   ├── sensors/ingest/
│   │   │   ├── stream/shipments/[id]/   # SSE
│   │   │   └── assistant/query/
│   │   ├── lib/webhooks/           # sign, verify, dispatch, retry
│   │   └── prisma/schema.prisma
│   │
│   └── dhanvantari/                # Next.js — institution
│       ├── app/(dashboard)/        # inventory, POS, billing, orders,
│       │                           # incoming, scan-in, complaints, assistant
│       ├── app/api/webhooks/vayu/  # receive: order, dispatch, telemetry, excursion
│       └── prisma/schema.prisma
│
├── services/
│   ├── nidana/                     # FastAPI
│   │   ├── main.py
│   │   ├── routers/    forecast.py risk.py rca.py route.py assistant.py
│   │   ├── services/   forecast_service.py risk_service.py rca_service.py
│   │   │               route_service.py evidence_service.py
│   │   ├── models/                 # .pkl artifacts
│   │   └── data/                   # NLEM, facilities, disease signal, population
│   │
│   └── simulator/                  # Node — GPS + temp along route → /sensors/ingest
│
├── packages/
│   ├── contracts/                  # ⭐ shared Zod schemas for EVERY cross-app payload
│   ├── crypto/                     # HMAC sign/verify
│   └── ui/                         # shared shadcn components
│
└── data-gen/                       # synthetic generators (Python)
    ├── gen_consumption.py
    ├── gen_orders_shipments.py
    └── gen_telemetry.py
```

**`packages/contracts` is not optional.** Both apps import the same Zod schemas, so a payload change breaks the build instead of breaking the demo.

### App repo — `wilbert0838n/medpharm-app`

```
medpharm-app/
├── app/                            # Expo Router
│   ├── (tabs)/                     # scan, incoming, complaints
│   └── scan/                       # QR scan → batch resolve → confirm
├── components/
├── lib/
│   ├── api.ts                      # talks to Dhanvantari
│   └── contracts.ts                # mirrors packages/contracts
└── app.json
```

---

## 9. Build Order

> **v1.1:** Phase 0 is larger than v1 assumed — both apps are scaffolded from zero. Budget accordingly.

| Phase | Work | Gate |
|---|---|---|
| **0** | Monorepo, Postgres, **both Next.js apps scaffolded**, two Prisma schemas, `packages/contracts`, HMAC helper, Clerk × 2 | Both apps boot, both connect |
| **1** | Seed data: NLEM catalogue, facility master, synthetic consumption/orders/shipments | DB has 12 months of believable history |
| **2** | Vayu: catalog, batch + QR generation, QC records | Scan a QR → drug card renders |
| **3** | **Order loop end-to-end**: place in D → approve in V → status flips in D | 🔒 **Hard gate. Nothing else until this works.** |
| **4** | Shipment creation, manifest, simulator, `/sensors/ingest`, SSE, live map + temp graph | Marker moves, graph ticks, no refresh |
| **5** | Excursion detection + webhook → **pre-arrival warning banner in Dhanvantari** | Inject spike → banner appears on the other app |
| **6** | Scan-in with photo → complaint flow → lands in Vayu's queue pre-linked | Two taps, zero manual ID entry |
| **7** | Nidana: risk score + drilldown (no ML) → dashboards on both sides | Every flag drills to 5 signals |
| **8** | Nidana: forecasting + SHAP → plain-language drivers | Band chart + top-3 reasons |
| **9** | Chatbot: intent → tool → evidence → narration, both sides | 6 demo questions answer in <3s |
| **10** | RCA agent, supplier scorecard, coverage gaps, route optimizer | Nice-to-have, in this order |
| **11** | Mobile (Expo), hardware (ESP32), offline PWA | Cut freely |

**Rule: at the end of every phase, the demo must run end-to-end.** Never have a half-integrated feature overnight.

**If you're behind, cut in this order:** hardware → mobile apps → offline PWA → coverage gap → route optimizer → SHAP (fall back to rule-based "why") → RCA agent.

**Never cut:** the order loop, the live map + temp graph, the excursion cross-app warning, the complaint round-trip, the chatbot.

---

## 10. Datasets

| Dataset | Source | Type | Priority |
|---|---|---|---|
| Drug catalogue | NLEM (MoHFW/NHSRC) — ~380 items, take 60–80 | Real | P0 |
| Facility master | NHM / state open data; structure yourself | Real-ish | P0 |
| Consumption time-series | **Generate** — trend + seasonality + noise + injected stockouts | Synthetic | P0 |
| Orders / shipments / telemetry | **Generate** — 4–5 carrier "personalities" with distinct excursion profiles | Synthetic | P0 |
| Disease/seasonal signal | IDSP via data.gov.in; fallback: hand-built monsoon/winter calendar | Mixed | P1 |
| Population baseline | Census of India (data.gov.in), district level | Real | P1 |
| Complaint snippets | 60–80 LLM-drafted, hand-edited | Synthetic | P2 |
| Route polylines | 8–10 real corridors (Mumbai–Nashik, Pune–Solapur…) via OSRM | Real | P1 |
| Drug label photos | ~40 self-captured, for the OCR path only | Real | P3 |

**Generator quality matters more than volume.** Give each carrier a personality (one chronically late, one with a failing reefer), each district a seasonal profile, each drug a demand shape. Then every analytical feature has something *true* to find — the forecast has real seasonality to catch, the risk score has real signals to agree on, the RCA has a real culprit carrier. **Clean data makes every downstream feature look fake.**

---

## 11. Demo Script (7 minutes)

| t | Beat | Line |
|---|---|---|
| 0:00 | **The gap.** Two windows side by side: hospital and manufacturer. | *"Once a drug leaves the factory, it's a black box until someone signs for it. Everything you see next is that box, opened."* |
| 0:40 | Low stock → one-tap reorder → order lands in Vayu | *"No phone call, no email, no spreadsheet."* |
| 1:20 | Approve → build shipment → QR manifest → dispatch | |
| 1:50 | **Live map + temp graph, both screens.** Stepper: Dispatched → In Transit. | *"Zomato for medicine — except we also watch the temperature."* |
| 2:30 | **Inject the spike.** Excursion fires in Vayu → warning banner appears in Dhanvantari **before arrival**. | *"The hospital knows the insulin is compromised before the truck reaches the gate. Today they'd find out weeks later, when patients stopped responding."* |
| 3:20 | Scan-in: QR → batch resolved, photo of damage, complaint in two taps | *"No form. No batch number typed. Scan, photo, send."* |
| 4:00 | Complaint lands in Vayu **pre-linked** → **RCA agent** gives cause + fix | *"47-minute excursion, Igatpuri ghat, sixth on this carrier in 90 days. The AI didn't guess that — it's reading our own telemetry."* |
| 4:50 | **Risk drilldown.** Click a red flag → 5 signals. | *"We don't cry wolf. Five independent signals had to agree, and you can see exactly which."* |
| 5:30 | **Chatbot, manufacturer side:** *"Why does Nashik keep running out of ORS?"* → evidence-backed answer + chart | *"The model never touched our database. It got a JSON evidence bundle and explained it. It cannot invent a number it was never given."* |
| 6:20 | **Coverage gap + supplier scorecard.** | *"PS-SS04 asks for vendor activity tracking. We score accountability in both directions."* |
| 6:50 | Close | *"Right product, right place, right time, right condition — and for the first time, provable."* |

**Pre-flight, 30 minutes before:** seed reset script tested; Nidana warmed; six chatbot answers cached; simulator on a 90-second route; offline fallback for every external API; **screen-recorded backup of the full flow on the laptop.**

---

## 12. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| **Greenfield scope** — both apps built from zero, not one | 🔴 | v1.1 correction. Phase 0 is bigger than planned. Scaffold minimally, cut Phase 11 early. |
| Two-app sync half-finished at deadline | 🔴 | Phase 3 is a hard gate; nothing starts until the order loop is green |
| Nidana cold start / deploy failure | 🔴 | TS fallback path for every endpoint; cron warm-up; ship the fallback first |
| LLM API down or rate-limited on stage | 🔴 | Cache the demo answers; keyword-intent + template-narration fallback |
| Venue wifi drops mid-demo | 🔴 | Retry queue + local `.mp4` backup + everything runnable on localhost |
| YOLO training eats two days, produces nothing | 🟠 | **Already cut.** §2.1 |
| SSE dies on Vercel long sessions | 🟠 | 5-min stream cap + client auto-reconnect |
| Telemetry table bloat → slow charts | 🟠 | Server-side decimation to 200 points |
| Scope creep on mobile apps | 🟠 | Mobile is phase 11. Web-responsive is enough for judging |
| Terminology confusion in judging | 🟡 | §1 — fix the words in the UI, not just the pitch |
| Synthetic data looks fake | 🟡 | Personality-driven generators; inject noise and reporting gaps |

---

## 13. What Changed From The Original Docs

**Kept:** two-app model, Next.js/Prisma/Clerk/Mapbox, QR-per-batch, cold-chain monitoring, complaint round-trip, evidence layer, LightGBM+SHAP forecasting, multi-signal risk drilldown, coverage gaps, grounded assistant, heuristic routing, hardware-agnostic ingest.

**Added:** Nidana as a shared stateless intelligence service; SSE real-time layer (the biggest hole in both docs); HMAC signing + idempotency + retry queue; excursion hysteresis and severity classification; the RCA evidence-bundle design; the bidirectional supplier/institution scorecard; the full chatbot grounding table; `packages/contracts`.

**Changed:** YOLOv8 counting → QR/OCR/manual ladder; two Postgres instances → one instance/two schemas; Google Maps → OSRM + 2-opt; DHT22 → DS18B20; 4-signal risk → 5-signal; SQLite → Postgres; MedTrack becomes the platform name over Vayu + Dhanvantari + Nidana.

**Cut:** YOLOv8 fine-tuning, Google Maps Directions billing dependency, offline-everything, standalone single-app MedTrack architecture.

**v1.1 changed:** the "Dhanvantari ~60% built" premise (false — greenfield); §4.3 now lists `Drug`/`Inventory`/`Dispense` as work to be done; §9 Phase 0 expanded.
