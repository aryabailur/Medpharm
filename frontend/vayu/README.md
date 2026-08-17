# Vayu — Manufacturer / Supplier Frontend

**Role:** Manufacturer / supplier side UI.
**Port:** `3000`
**One-liner:** UI only — all server work lives in `backend/vayu-api` (:4000).

---

## Start here

Paste one of these into Claude Code at the repo root. It reads this README, picks up your Part's owned file globs, and stays inside them.

**Part 1:**

```
Read frontend/vayu/README.md. I'm taking Part 1.
Start with the drug catalog screen.
```

**Part 2:**

```
Read frontend/vayu/README.md. I'm taking Part 2.
Start with the shipment dispatch screen.
```

Branch first — never commit to `main`:

```bash
git checkout main && git pull origin main
git checkout -b feat/<short-name>
```

See [WORKPLAN.md](../../WORKPLAN.md) for the assignment table across all six deployables.

---

## 1. What this app is

Vayu is the manufacturer/supplier-facing Next.js 15 App Router app (ARCHITECTURE.md §3). It renders the catalog, batch + QR generation, QC records, supply-order approval queue, shipment dispatch + manifest, live telemetry console (map + temp graph + status stepper), cold-chain excursions, complaints + RCA, the evidence layer, batch trace timeline, risk summary + drilldown, demand forecast, coverage gap map, the Institution Reliability Panel, and the network-scope assistant (§3, §7.3 intents M1–M12).

It talks to exactly one server: `backend/vayu-api` on :4000, via `lib/api.ts`. It never talks to `backend/dhanvantari-api`, never talks to Postgres, and never talks to Nidana directly (Nidana is called server-side by `vayu-api` only, per §3.2).

---

## 2. Boundary — what lives here vs what does NOT

| Concern | Lives here? | Where instead |
|---|---|---|
| Pages, components, charts, maps, client state | **Yes** | — |
| `lib/api.ts` (fetch wrapper + SSE client) | **Yes** | — |
| `@medtrack/contracts` (Zod types) | **Yes** — types are not secrets | — |
| Prisma / SQL / any DB access | No | `backend/vayu-api/prisma/` |
| `MEDTRACK_SHARED_SECRET` | No | `backend/vayu-api` env only |
| `@medtrack/crypto` (HMAC sign/verify) | No | imported by `backend/vayu-api` only |
| Webhook send/receive (§5.1) | No | `backend/vayu-api/src/routes/` |
| SSE stream *origin* | No — this app only **consumes** `GET /api/stream/shipments/:id` | served by `backend/vayu-api` (deviation below) |

> **Deviation from ARCHITECTURE.md §5.3.** The spec put the SSE endpoint in a Next.js route handler. With a hard UI-only split, the stream is served by the Fastify `vayu-api` server instead, so `streamShipment()` in `lib/api.ts` opens a **cross-origin** `EventSource` against :4000. CORS on `vayu-api` must allow `http://localhost:3000`. The Vercel 300s serverless SSE cap no longer applies since the stream isn't a Next.js route — but **reconnect client-side** anyway; a long judging session must not silently die.

---

## 3. Quick start

```bash
# from repo root
npm install
cp .env.example .env

npm run dev:backend   # vayu-api on :4000 must be running first
npm run dev:vayu      # this app, :3000
```

Without `vayu-api` running, every page here renders empty — `lib/api.ts` has nothing to call.

Point this app at a non-default API server with `NEXT_PUBLIC_VAYU_API_URL` (readable in devtools — never put a secret behind `NEXT_PUBLIC_*`).

---

## 4. Proposed folder layout

```
frontend/vayu/
├── app/
│   ├── layout.tsx                    # SHARED — nav/sidebar shell
│   ├── page.tsx                      # landing / redirect to dashboard
│   └── (dashboard)/
│       ├── catalog/                  # Part 1
│       ├── batches/                  # Part 1 — batches + QR generation
│       ├── qc/                       # Part 1 — QC records
│       ├── orders/                   # Part 1 — supply-order approval queue
│       ├── shipments/                # Part 2 — dispatch + manifest
│       ├── telemetry/                # Part 2 — live map + temp graph + stepper
│       ├── excursions/               # Part 2 — cold-chain incidents
│       ├── complaints/               # Part 2 — queue + RCA panel
│       ├── evidence/                 # Part 2 — evidence layer
│       ├── trace/                    # Part 2 — batch trace timeline
│       ├── risk/                     # Part 2 — risk summary + drilldown
│       ├── forecast/                 # Part 2 — demand forecast (band chart + SHAP)
│       ├── coverage/                 # Part 2 — coverage gap choropleth
│       ├── reliability/              # Part 2 — Institution Reliability Panel
│       └── assistant/                # Part 2 — network-scope chatbot
├── components/
│   ├── nav/                          # SHARED — sidebar/nav
│   ├── catalog/                      # Part 1
│   ├── batches/                      # Part 1
│   ├── qc/                           # Part 1
│   ├── orders/                       # Part 1
│   ├── shipments/                    # Part 2
│   ├── telemetry/                    # Part 2
│   ├── excursions/                   # Part 2
│   ├── complaints/                   # Part 2
│   ├── risk/                         # Part 2
│   ├── forecast/                     # Part 2
│   ├── coverage/                     # Part 2
│   ├── reliability/                  # Part 2
│   ├── assistant/                    # Part 2
│   └── ui/                           # SHARED primitives
└── lib/
    └── api.ts                        # SHARED, read-only for both parts
```

---

## 5. PART 1 / PART 2 PARALLEL TRACKS

Two people, zero merge conflicts. Split by **feature vertical** — each part owns whole screens end to end, never "one does components, one does pages."

**Part 1 is the critical path.** It covers Phases 2–3, and Phase 3 (the order loop: place in Dhanvantari → approve in Vayu → status flips back) is ARCHITECTURE.md's 🔒 hard gate — nothing in the build order proceeds until it's green (§9). Part 2 (Phases 4–9) can start scaffolding screens in parallel but its screens are cosmetic until Part 1's order queue and batch data exist.

### Owned globs

| Part | Owns |
|---|---|
| **Part 1** | `app/(dashboard)/catalog/**`, `app/(dashboard)/batches/**`, `app/(dashboard)/qc/**`, `app/(dashboard)/orders/**`, `components/catalog/**`, `components/batches/**`, `components/qc/**`, `components/orders/**` |
| **Part 2** | `app/(dashboard)/shipments/**`, `app/(dashboard)/telemetry/**`, `app/(dashboard)/excursions/**`, `app/(dashboard)/complaints/**`, `app/(dashboard)/evidence/**`, `app/(dashboard)/trace/**`, `app/(dashboard)/risk/**`, `app/(dashboard)/forecast/**`, `app/(dashboard)/coverage/**`, `app/(dashboard)/reliability/**`, `app/(dashboard)/assistant/**`, `components/shipments/**`, `components/telemetry/**`, `components/excursions/**`, `components/complaints/**`, `components/risk/**`, `components/forecast/**`, `components/coverage/**`, `components/reliability/**`, `components/assistant/**` |

### Shared — coordinate before editing

| File | Rule |
|---|---|
| `app/layout.tsx` | **Neither part edits alone.** Contains the app shell + nav mount. |
| `components/nav/**` (sidebar) | **Neither part edits alone.** See append convention below. |
| `lib/api.ts` | **Read-only for both parts.** It already exports `API_URL`, `api()`, `streamShipment()`. If a new server route needs a new wrapper, add it as a new named export at the bottom, don't restructure existing exports, and flag it in your PR. |
| `@medtrack/contracts` | **Read-only for both parts.** Cross-app schema changes are Opus-only (see repo `CLAUDE.md` §1) — never edit from a Vayu-only task. |
| `components/ui/**` (shared primitives) | Coordinate before adding — check it doesn't already exist; append new primitives, don't restructure existing ones. |

**The one unavoidable shared touchpoint** is nav registration. Add a marker comment now and have both parts append below it, one entry per line, in `components/nav/sidebar.tsx` (or equivalent):

```tsx
const NAV_ITEMS: NavItem[] = [
  { href: '/catalog', label: 'Catalog' },
  { href: '/batches', label: 'Batches' },
  { href: '/qc', label: 'QC Records' },
  { href: '/orders', label: 'Supply Orders' },
  // --- NEW NAV ITEMS: append below this line, one per line, do not reorder above ---
];
```

### Part 1 — Catalog, Batches, QC, Order Queue (critical path)

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Drug catalogue list + detail view | `app/(dashboard)/catalog/**`, `components/catalog/**` | 2 | seed data (Phase 1) |
| Batch list + QR generation (scan a QR → drug card renders) | `app/(dashboard)/batches/**`, `components/batches/**` | 2 | catalog above |
| QC records (PASS/FAIL, inspector, notes, certificate link) | `app/(dashboard)/qc/**`, `components/qc/**` | 2 | batches above |
| Supply-order approval queue (PENDING → APPROVED/PARTIAL/REJECTED) | `app/(dashboard)/orders/**`, `components/orders/**` | 3 | catalog, batches |
| Order status reflects Dhanvantari's placement in real time (poll or refetch) | `app/(dashboard)/orders/**` | 3 | 🔒 Phase 3 gate — order loop end-to-end |

### Part 2 — Shipments, Telemetry, Excursions, Complaints, Risk/Forecast, Assistant

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Shipment dispatch + manifest build | `app/(dashboard)/shipments/**`, `components/shipments/**` | 4 | Part 1's order queue (approved orders become shipments) |
| Telemetry console: live map + temp graph + Zomato-style status stepper | `app/(dashboard)/telemetry/**`, `components/telemetry/**` | 4 | shipments above; `streamShipment()` from `lib/api.ts` |
| Cold-chain excursion list + severity badges | `app/(dashboard)/excursions/**`, `components/excursions/**` | 5 | telemetry above |
| Complaints queue + RCA panel (evidence bundle beside prose, §6.3) | `app/(dashboard)/complaints/**`, `components/complaints/**` | 6, 10 | shipments, excursions |
| Evidence layer (batch trace supporting docs) | `app/(dashboard)/evidence/**` | 6 | batches (Part 1, read-only consumption) |
| Batch trace timeline (mfg → QC → dispatch → transit → delivery → complaints) | `app/(dashboard)/trace/**` | 6 | all of the above |
| Risk summary + drilldown (5-signal, confidence = agreement) | `app/(dashboard)/risk/**`, `components/risk/**` | 7 | Nidana `/risk` via `vayu-api` |
| Demand forecast: band chart + plain-language SHAP drivers | `app/(dashboard)/forecast/**`, `components/forecast/**` | 8 | Nidana `/forecast` via `vayu-api` |
| Coverage gap choropleth | `app/(dashboard)/coverage/**`, `components/coverage/**` | 10 | risk, forecast |
| Institution Reliability Panel | `app/(dashboard)/reliability/**`, `components/reliability/**` | 10 | complaints above |
| Assistant, network scope (M1–M12) | `app/(dashboard)/assistant/**`, `components/assistant/**` | 9 | risk, forecast, trace (evidence sources for narration) |

---

## 6. Phase mapping (§9)

| Phase | Vayu work | Gate |
|---|---|---|
| **2** | Catalog, batch + QR generation, QC records | Scan a QR → drug card renders |
| **3** | 🔒 Supply-order approval queue — half of the order loop | Place in Dhanvantari → approve here → status flips back |
| **4** | Shipment manifest, live map + temp graph | Marker moves, graph ticks, no refresh |
| **5** | Excursion list | Inject spike → visible here, banner appears in Dhanvantari |
| **6** | Complaints queue, evidence layer, batch trace | Complaint lands pre-linked, zero manual ID entry |
| **7** | Risk summary + drilldown | Every flag drills to 5 signals |
| **8** | Demand forecast | Band chart + top-3 plain-language reasons |
| **9** | Assistant (network scope) | 6 demo questions answer in <3s |
| **10** | RCA panel, coverage gap, Institution Reliability Panel | Nice-to-have, cut first if behind |

---

## 7. Conventions

**Terminology (§1) — fix the words in the UI, not just the pitch.**

| Never write | Always write |
|---|---|
| Vendor | **Supplier / Manufacturer** |
| Vendor | **Institution** (the receiving hospital/CHC/PHC) |
| Vendor Reliability Dashboard | **Institution Reliability Panel** (this is the Vayu-side panel; the mirror-image *Supplier Scorecard* lives in Dhanvantari) |

**Other rules:**
- **Never render raw SHAP feature names.** Map every attribution through a plain-language lookup (`lag_1` → "last month's consumption") before it reaches the forecast screen (§6.4).
- **Telemetry is decimated to ~200 points server-side.** Don't request or chart raw multi-thousand-point series in Recharts — trust `vayu-api` to have already downsampled (§4.4).
- **Confirm-before-commit** applies to any scanned/inferred quantity surfaced here (e.g. QC counts) — treat it as a proposal until a human confirms (§2.1).
- `NEXT_PUBLIC_*` env vars are readable in devtools. Never put a secret behind that prefix.
