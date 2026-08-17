# WORKPLAN — who works on what

Every deployable is split into two **file-disjoint tracks**. Two people can take Part 1 and Part 2 of the same service and work simultaneously without ever touching the same file.

**Full detail — owned file globs, task tables, dependencies — lives in each service's own README.** This page is the map, not the territory.

> **Two split documents, two different questions.** This one answers *"which files may I touch without colliding with someone?"* — it's about merge safety. [`tasks_split.md`](tasks_split.md) answers *"who on the team should take this, given their tooling?"* — it's about task difficulty and Claude Pro access. Use `tasks_split.md` to decide **who** takes a track; use this page and the service READMEs to know **which files** that track owns.

> Enforcement: [CLAUDE.md §2](CLAUDE.md#2-part-ownership--read-this-before-editing-anything). Every Claude Code session must read its service README and establish its Part before editing.

---

## The assignment table

| Deployable | Part 1 | Part 2 | README |
|---|---|---|---|
| `backend/vayu-api` | 🔒 Prisma singleton, HMAC middleware, idempotency, **order intake + approval**, catalog/batch reads | Sensor ingest, excursion detector, SSE, webhook dispatch + retry queue, complaints, assistant | [→](backend/vayu-api/README.md) |
| `backend/dhanvantari-api` | 🔒 Prisma singleton, inventory/POS APIs, **order placement**, outbound queue | Webhook receivers, SSE, scan-in + complaints, Expo endpoints, supplier scorecard, assistant | [→](backend/dhanvantari-api/README.md) |
| `frontend/vayu` | 🔒 Catalog, batches + QR, QC, **order approval queue** | Shipments, telemetry console, excursions, complaints + RCA, risk/forecast, coverage, assistant | [→](frontend/vayu/README.md) |
| `frontend/dhanvantari` | 🔒 Inventory, POS/dispensing, billing, **order placement + one-tap reorder** | Incoming shipments, live tracking, excursion banner, scan-in, complaints, scorecard, assistant | [→](frontend/dhanvantari/README.md) |
| `backend/nidana` | Risk score + drilldown (Phase 7, deterministic, no ML) | Forecast + SHAP (8), RCA + route optimizer (10) | [→](backend/nidana/README.md) |
| `backend/simulator` | Route interpolation, CLI, ingest POST loop | Temperature model, excursion injection, carrier personalities | [→](backend/simulator/README.md) |

🔒 = on the **Phase 3 critical path**. See below.

---

## The critical path

**Phase 3 — the order loop — is a hard gate (§9).** Place an order in Dhanvantari → approve it in Vayu → status flips back in Dhanvantari. *Nothing else ships until this works.*

Four Part 1 tracks carry it, and they must land in this order:

```
  1. backend/vayu-api Part 1          ─┐
     Prisma + HMAC + idempotency       │  the two servers first —
  2. backend/dhanvantari-api Part 1   ─┘  frontends have nothing to call
     Prisma + outbound queue              until these exist

  3. frontend/dhanvantari Part 1      ─┐  then the UI that places
     order placement                   │  and approves
  4. frontend/vayu Part 1             ─┘
     order approval queue
```

Everything marked Part 2 is **Phase 4+** and starts only once the gate is green.

---

## Team sizes

**Two people** — one takes all backend, one takes all frontend. Backend goes first (frontends have nothing to call until the APIs exist), so the frontend person starts on static screens and layout while waiting.

**Four people** — one per Part 1 track above, in that dependency order. This is the fastest route to the Phase 3 gate.

**Six or more** — the four Part 1 tracks, plus `nidana` Part 1 (risk scoring is deterministic and needs no ML, so it can start immediately and in parallel), plus `simulator` Part 1. Both are independent of the order loop.

**One person** — ignore the Part split entirely. Work the phases in order from [ARCHITECTURE.md §9](ARCHITECTURE.md#9-build-order).

---

## What nobody owns alone

These files are **shared**. Neither Part edits them unilaterally.

| File | Why | Rule |
|---|---|---|
| `backend/packages/contracts` | Both servers, both frontends, and the Expo app import it | Opus-only. A payload change ripples everywhere — that's the point (it breaks the build, not the demo), but announce it. |
| `backend/packages/crypto` | Both API servers | A signing change breaks every cross-app call at once. |
| `*/prisma/schema.prisma` | Migrations affect everyone on that service | Coordinate, then run `npm run db:migrate` and tell the team. |
| `src/index.ts` route registration | Both Parts add routes | Append below the marker comment. Never reorder what's above. |
| `app/layout.tsx`, nav/sidebar | Both Parts add screens | Append below the marker comment. |
| `frontend/*/lib/api.ts` | Both Parts call the API | Read-only. Need a new wrapper? Add a named export at the bottom; don't restructure. |
| `.env.example` | Everyone | Adding a var means telling everyone. |

---

## Starting a session

Each service README opens with a **Start here** block containing the exact prompt to paste. The pattern:

```
Read backend/vayu-api/README.md. I'm taking Part 1.
Start with the Prisma client singleton and the HMAC middleware.
```

Claude reads the README, sees Part 1's owned globs and task table, and works only inside them. `CLAUDE.md` loads automatically, so the git workflow and non-negotiables are already in context.

**Before starting, always:**

```bash
git checkout main && git pull origin main
git checkout -b feat/<short-name>
```

Never commit to `main` ([CLAUDE.md §3](CLAUDE.md#3-git-workflow)).
