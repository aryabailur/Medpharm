# Dhanvantari — Institution Frontend

**Role:** Institution (hospital / CHC / PHC) side UI.
**Port:** `3001`
**One-liner:** UI only — all server work lives in `backend/dhanvantari-api` (:4001).

---

## Start here

Paste one of these into Claude Code at the repo root. It reads this README, picks up your Part's owned file globs, and stays inside them.

**Part 1:**

```
Read frontend/dhanvantari/README.md. I'm taking Part 1.
Start with the inventory screen.
```

**Part 2:**

```
Read frontend/dhanvantari/README.md. I'm taking Part 2.
Start with the incoming shipments list.
```

Branch first — never commit to `main`:

```bash
git checkout main && git pull origin main
git checkout -b feat/<short-name>
```

See [WORKPLAN.md](../../WORKPLAN.md) for the assignment table across all six deployables.

---

## 1. What this app is

Dhanvantari is the institution-facing Next.js 15 App Router app (ARCHITECTURE.md §3). It renders inventory, POS/dispensing, billing, supply-order placement + one-tap reorder, incoming shipments, live shipment tracking (map + ETA + temp graph), the pre-arrival excursion warning banner, scan-in with photo evidence, complaint filing, the Supplier Scorecard, expiring-stock view, reorder suggestions, and the own-data-scope assistant (§3, §7.2 intents V1–V12).

It talks to exactly one server: `backend/dhanvantari-api` on :4001, via `lib/api.ts`. It never talks to `backend/vayu-api`, never talks to Postgres, and never talks to Nidana directly (Nidana is called server-side by `dhanvantari-api` only, per §3.2).

---

## 2. Boundary — what lives here vs what does NOT

| Concern | Lives here? | Where instead |
|---|---|---|
| Pages, components, charts, maps, client state | **Yes** | — |
| `lib/api.ts` (fetch wrapper + SSE client) | **Yes** | — |
| `@medtrack/contracts` (Zod types) | **Yes** — types are not secrets | — |
| Prisma / SQL / any DB access | No | `backend/dhanvantari-api/prisma/` |
| `MEDTRACK_SHARED_SECRET` | No | `backend/dhanvantari-api` env only |
| `@medtrack/crypto` (HMAC sign/verify) | No | imported by `backend/dhanvantari-api` only |
| Webhook send/receive (§5.1) | No | `backend/dhanvantari-api/src/routes/` (receives `order.status_changed`, `shipment.dispatched`, `shipment.telemetry`, `shipment.excursion`, `complaint.status_changed`) |
| SSE stream *origin* | No — this app only **consumes** `GET /api/stream/shipments/:id` | served by `backend/dhanvantari-api` (deviation below) |

> **Deviation from ARCHITECTURE.md §5.3.** The spec put the SSE endpoint in a Next.js route handler. With a hard UI-only split, the stream is served by the Fastify `dhanvantari-api` server instead, so `streamShipment()` in `lib/api.ts` opens a **cross-origin** `EventSource` against :4001. CORS on `dhanvantari-api` must allow `http://localhost:3001`. The Vercel 300s serverless SSE cap no longer applies since the stream isn't a Next.js route — but **reconnect client-side** anyway; a long judging session must not silently die.

---

## 3. Quick start

```bash
# from repo root
npm install
cp .env.example .env

npm run dev:backend        # dhanvantari-api on :4001 must be running first
npm run dev:dhanvantari    # this app, :3001
```

Without `dhanvantari-api` running, every page here renders empty — `lib/api.ts` has nothing to call.

Point this app at a non-default API server with `NEXT_PUBLIC_DHANVANTARI_API_URL` (readable in devtools — never put a secret behind `NEXT_PUBLIC_*`).

---

## 4. Proposed folder layout

```
frontend/dhanvantari/
├── app/
│   ├── layout.tsx                    # SHARED — nav/sidebar shell
│   ├── page.tsx                      # landing / redirect to dashboard
│   └── (dashboard)/
│       ├── inventory/                # Part 1
│       ├── pos/                      # Part 1 — POS / dispensing
│       ├── billing/                  # Part 1
│       ├── orders/                   # Part 1 — placement + one-tap reorder
│       ├── shipments/                # Part 2 — incoming shipments list
│       ├── tracking/                 # Part 2 — live map + ETA + temp graph
│       ├── excursions/                # Part 2 — pre-arrival warning banner
│       ├── scan-in/                  # Part 2 — scan-in + photo evidence
│       ├── complaints/               # Part 2 — complaint filing
│       ├── scorecard/                # Part 2 — Supplier Scorecard
│       ├── expiring/                 # Part 2 — expiring-stock view
│       ├── reorder/                  # Part 2 — reorder suggestions
│       └── assistant/                # Part 2 — own-data-scope chatbot
├── components/
│   ├── nav/                          # SHARED — sidebar/nav
│   ├── inventory/                    # Part 1
│   ├── pos/                          # Part 1
│   ├── billing/                      # Part 1
│   ├── orders/                       # Part 1
│   ├── shipments/                    # Part 2
│   ├── tracking/                     # Part 2
│   ├── excursions/                    # Part 2
│   ├── scan-in/                      # Part 2
│   ├── complaints/                   # Part 2
│   ├── scorecard/                    # Part 2
│   ├── expiring/                     # Part 2
│   ├── reorder/                      # Part 2
│   ├── assistant/                    # Part 2
│   └── ui/                           # SHARED primitives
└── lib/
    └── api.ts                        # SHARED, read-only for both parts
```

---

## 5. PART 1 / PART 2 PARALLEL TRACKS

Two people, zero merge conflicts. Split by **feature vertical** — each part owns whole screens end to end, never "one does components, one does pages."

**Part 1 is the critical path.** It covers Phases 2–3, and Phase 3 (the order loop: place in Dhanvantari → approve in Vayu → status flips back) is ARCHITECTURE.md's 🔒 hard gate — nothing in the build order proceeds until it's green (§9). Part 2 (Phases 4–9) can start scaffolding screens in parallel but its screens are cosmetic until Part 1's inventory and order placement exist.

### Owned globs

| Part | Owns |
|---|---|
| **Part 1** | `app/(dashboard)/inventory/**`, `app/(dashboard)/pos/**`, `app/(dashboard)/billing/**`, `app/(dashboard)/orders/**`, `components/inventory/**`, `components/pos/**`, `components/billing/**`, `components/orders/**` |
| **Part 2** | `app/(dashboard)/shipments/**`, `app/(dashboard)/tracking/**`, `app/(dashboard)/excursions/**`, `app/(dashboard)/scan-in/**`, `app/(dashboard)/complaints/**`, `app/(dashboard)/scorecard/**`, `app/(dashboard)/expiring/**`, `app/(dashboard)/reorder/**`, `app/(dashboard)/assistant/**`, `components/shipments/**`, `components/tracking/**`, `components/excursions/**`, `components/scan-in/**`, `components/complaints/**`, `components/scorecard/**`, `components/expiring/**`, `components/reorder/**`, `components/assistant/**` |

### Shared — coordinate before editing

| File | Rule |
|---|---|
| `app/layout.tsx` | **Neither part edits alone.** Contains the app shell + nav mount. |
| `components/nav/**` (sidebar) | **Neither part edits alone.** See append convention below. |
| `lib/api.ts` | **Read-only for both parts.** It already exports `API_URL`, `api()`, `streamShipment()`. If a new server route needs a new wrapper, add it as a new named export at the bottom, don't restructure existing exports, and flag it in your PR. |
| `@medtrack/contracts` | **Read-only for both parts.** Cross-app schema changes are Opus-only (see repo `CLAUDE.md` §1) — never edit from a Dhanvantari-only task. |
| `components/ui/**` (shared primitives) | Coordinate before adding — check it doesn't already exist; append new primitives, don't restructure existing ones. |

**The one unavoidable shared touchpoint** is nav registration. Add a marker comment now and have both parts append below it, one entry per line, in `components/nav/sidebar.tsx` (or equivalent):

```tsx
const NAV_ITEMS: NavItem[] = [
  { href: '/inventory', label: 'Inventory' },
  { href: '/pos', label: 'POS' },
  { href: '/billing', label: 'Billing' },
  { href: '/orders', label: 'Supply Orders' },
  // --- NEW NAV ITEMS: append below this line, one per line, do not reorder above ---
];
```

### Part 1 — Inventory, POS/Dispensing, Order Placement (critical path)

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Inventory list (qty on hand, reorder point, expiry, location) | `app/(dashboard)/inventory/**`, `components/inventory/**` | 2 | seed data (Phase 1) |
| POS / dispensing ledger (record a `Dispense`, decrement stock) | `app/(dashboard)/pos/**`, `components/pos/**` | 2 | inventory above |
| Billing view over dispensing records | `app/(dashboard)/billing/**`, `components/billing/**` | 2 | POS above |
| Supply-order placement + one-tap reorder | `app/(dashboard)/orders/**`, `components/orders/**` | 3 | inventory (low-stock trigger) |
| Order status reflects Vayu's approval in real time (poll or refetch) | `app/(dashboard)/orders/**` | 3 | 🔒 Phase 3 gate — order loop end-to-end |

### Part 2 — Incoming Shipments, Tracking, Scan-in, Complaints, Scorecard, Assistant

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Incoming shipments list | `app/(dashboard)/shipments/**`, `components/shipments/**` | 4 | Part 1's approved orders (become incoming shipments) |
| Live shipment tracking: map + ETA + temp graph | `app/(dashboard)/tracking/**`, `components/tracking/**` | 4 | shipments above; `streamShipment()` from `lib/api.ts` |
| Pre-arrival excursion warning banner | `app/(dashboard)/excursions/**`, `components/excursions/**` | 5 | tracking above; fires on `shipment.excursion` webhook data |
| Scan-in with photo evidence (QR → confirm-before-commit quantity) | `app/(dashboard)/scan-in/**`, `components/scan-in/**` | 6 | shipments above |
| Complaint filing (batch/shipment pre-linked from scan-in) | `app/(dashboard)/complaints/**`, `components/complaints/**` | 6 | scan-in above |
| Supplier Scorecard (on-time %, rejection %, excursion rate) | `app/(dashboard)/scorecard/**`, `components/scorecard/**` | 10 | shipments, complaints |
| Expiring-stock view | `app/(dashboard)/expiring/**`, `components/expiring/**` | 7 | Part 1's inventory (read-only consumption) |
| Reorder suggestions (Nidana `/forecast` + `/risk` → ranked list) | `app/(dashboard)/reorder/**`, `components/reorder/**` | 7, 8 | expiring above; Nidana via `dhanvantari-api` |
| Assistant, own-data scope (V1–V12) | `app/(dashboard)/assistant/**`, `components/assistant/**` | 9 | shipments, inventory, complaints, scorecard (evidence sources for narration) |

---

## 6. Phase mapping (§9)

| Phase | Dhanvantari work | Gate |
|---|---|---|
| **2** | Inventory, POS/dispensing, billing | Inventory and POS reflect seed data |
| **3** | 🔒 Order placement + one-tap reorder — half of the order loop | Place here → approve in Vayu → status flips back |
| **4** | Incoming shipments list, live tracking map + temp graph | Marker moves, graph ticks, no refresh |
| **5** | Pre-arrival excursion warning banner | Inject spike in Vayu → banner appears here before arrival |
| **6** | Scan-in with photo → complaint filing | Two taps, zero manual ID entry, lands pre-linked in Vayu |
| **7** | Expiring-stock view, reorder suggestions (risk score, no ML) | Every flag drills to 5 signals |
| **8** | Reorder suggestions upgraded with forecast + SHAP drivers | Band chart + top-3 plain-language reasons |
| **9** | Assistant (own-data scope) | 6 demo questions answer in <3s |
| **10** | Supplier Scorecard | Nice-to-have, cut first if behind |

---

## 7. Conventions

**Terminology (§1) — fix the words in the UI, not just the pitch.**

| Never write | Always write |
|---|---|
| Vendor | **Supplier / Manufacturer** (the one who ships) |
| Vendor Reliability Dashboard | **Supplier Scorecard** (this is the Dhanvantari-side panel; the mirror-image *Institution Reliability Panel* lives in Vayu) |

**Other rules:**
- **Never render raw SHAP feature names.** Map every attribution through a plain-language lookup (`lag_1` → "last month's consumption") before it reaches the reorder-suggestion screen (§6.4).
- **Telemetry is decimated to ~200 points server-side.** Don't request or chart raw multi-thousand-point series in Recharts — trust `dhanvantari-api` to have already downsampled (§4.4).
- **Confirm-before-commit** for scan-in quantities: a scan or photo-assisted count is a *proposal*; a human confirms the number before it writes to `Inventory` (§2.1).
- `NEXT_PUBLIC_*` env vars are readable in devtools. Never put a secret behind that prefix.
