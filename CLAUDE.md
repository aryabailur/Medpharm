# CLAUDE.md — MedTrack (web)

Instructions for Claude Code working in this repository.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before starting any feature. It is the single source of truth for the data model, cross-app contract, and build order.

---

## 1. Orchestration model

**Opus 5 orchestrates. Sonnet 5 executes.**

- The **top-level session runs on Opus 5** (`claude-opus-5`). It owns planning, architecture decisions, task decomposition, integration, and review.
- **Delegate implementation work to Sonnet 5 subagents** (`claude-sonnet-5`) via the Agent tool with `model: "sonnet"`.
- Launch independent subagents **in parallel** — one message, multiple Agent tool calls.

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  description: "Implement excursion detector",
  prompt: "<full context: files, contract, acceptance criteria>"
)
```

**What Opus keeps for itself:**
- Cross-app contract changes (`backend/packages/contracts`) — a bad payload change breaks both tiers and the mobile app
- Prisma schema design and migrations
- Anything touching the Phase 3 order loop (the hard gate)
- The frontend/backend boundary — deciding what may cross it
- Final review before merge

**Part 1 / Part 2 tracks.** Every service README defines two file-disjoint tracks so two workers never touch the same file. When parallelising, assign one subagent per track and give it the owned file globs verbatim from that README. Do not let a subagent stray outside its track.

**What goes to Sonnet subagents:**
- Single-surface UI components and pages
- One API route with a defined request/response shape
- Test writing, seed/generator scripts
- Nidana endpoint implementations against a fixed Pydantic schema

**Rules for delegation:**
- Give each subagent the **full contract it must honour** — the Zod/Pydantic schema, the file paths, and the acceptance criteria. A subagent that has to guess the payload shape will invent one.
- Never have two subagents edit the same file concurrently.
- Opus verifies every subagent's output against the phase gate before merging.

---

## 2. Part ownership — read this before editing anything

Every deployable is split into two **file-disjoint tracks**, Part 1 and Part 2, so two people can work the same service simultaneously without merge conflicts. The split lives in that service's `README.md`.

**Before editing any file under a service directory, this session MUST:**

1. **Read that service's `README.md`** — `frontend/vayu/`, `frontend/dhanvantari/`, `backend/vayu-api/`, `backend/dhanvantari-api/`, `backend/nidana/`, `backend/simulator/`.
2. **Establish which Part this session owns.** If the user hasn't said, **ask** — do not guess. One question, then proceed.
3. **Edit only files inside that Part's owned globs.**

**If a task appears to need a file owned by the other Part:** stop and tell the user. Do not edit it silently — the other person may have it open right now. Either the task belongs to the other Part, or the two need to coordinate.

**Files marked "Shared — coordinate before editing"** (route registration, `prisma/schema.prisma`, `lib/api.ts`, `packages/contracts`, app shell/nav) are owned by **neither** Part. Where a README defines a marker-comment append convention, use it: append below the marker, never reorder or reformat what's above.

See [WORKPLAN.md](WORKPLAN.md) for the full assignment table across all six deployables.

---

## 3. Git workflow

**Never commit directly to `main`.**

Every feature follows this cycle:

```bash
git checkout main && git pull origin main
git checkout -b feat/<short-name>
# ... work ...
git add -A && git commit -m "<message>"
git push -u origin feat/<short-name>
gh pr create --fill        # or merge directly if solo
git checkout main && git merge --no-ff feat/<short-name>
git push origin main
```

**Branch naming:**

| Prefix | Use |
|---|---|
| `feat/` | new feature |
| `fix/` | bug fix |
| `chore/` | tooling, deps, config |
| `docs/` | documentation only |
| `phase/N-<name>` | a whole build-order phase from §9 |

**Rules:**
- **Branch → push → merge to main.** Push the branch before merging, so the work is recoverable if a laptop dies mid-hackathon.
- Merge with `--no-ff` so each feature is a visible unit in history.
- `main` must always boot. If a merge breaks `main`, revert first and fix on a branch.
- Commit at every phase gate in ARCHITECTURE.md §9, even if the phase is incomplete.

---

## 4. Stack & layout

The repo splits **frontend / backend**. Frontends are UI-only; everything the browser must never see lives in `backend/`.

```
frontend/vayu          :3000  Next.js 15  — UI only
frontend/dhanvantari   :3001  Next.js 15  — UI only
backend/vayu-api       :4000  Fastify + Prisma — schema `vayu`
backend/dhanvantari-api :4001 Fastify + Prisma — schema `dhanvantari`
backend/nidana         :8000  FastAPI — stateless
backend/simulator             telemetry generator
backend/packages/             contracts (Zod), crypto (HMAC), ui
```

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | **npm workspaces** | pnpm needs admin on this machine; workspaces suffice |
| Frontend | Next.js 15 App Router, TypeScript | **No Prisma, no secrets, no HMAC** |
| Backend | Fastify + TypeScript | Owns DB, secrets, webhooks, SSE |
| DB | Postgres, **one instance, two schemas** | `vayu` + `dhanvantari`. **No cross-schema FKs. Ever.** |
| ORM | Prisma, **two separate clients** | One per API server |
| Intelligence | Python 3.11+ / FastAPI | `backend/nidana`, stateless |
| Real-time | **SSE** from the Fastify servers | Not WebSockets, not polling. §5.3 |
| Validation | Zod in `backend/packages/contracts` | Imported by both tiers — **not optional** |
| Charts | Recharts | Decimate telemetry to ~200 points server-side |

**Deviation from ARCHITECTURE.md §5.3:** the spec put SSE in Next.js route handlers. With UI-only frontends it lives in the Fastify servers. Cross-origin CORS is now required; the Vercel 300s cap no longer applies.

**Boundary rule:** if it touches Prisma, `MEDTRACK_SHARED_SECRET`, `@medtrack/crypto`, or the other organisation, it belongs in `backend/`. A secret behind a `NEXT_PUBLIC_` prefix is not a secret.

**Local DB:** Docker Compose Postgres (`docker-compose.yml`). Swap `DATABASE_URL` for Neon/Supabase before deploy.

---

## 5. Non-negotiables

These are in ARCHITECTURE.md but are repeated here because they are easy to skip and expensive to retrofit:

- **HMAC-sign every cross-app request.** Timestamp + constant-time compare + 5-minute replay window. §5.2
- **Idempotency on every webhook receiver.** Store `X-MedTrack-Event-Id`; duplicate → `200`, do nothing. Without this you get double stock entries on stage.
- **The LLM never sees the database.** Intent → deterministic Prisma call → evidence JSON → LLM narrates. **Never generate SQL from an LLM.** §7
- **Every Nidana endpoint needs a deterministic TypeScript fallback** shipped *first*. Nidana must never be a single point of demo failure. §3.2
- **UUIDv7 for `batchId`, `shipmentId`, `supplyOrderId`.** Neither app ever invents an ID; it only echoes one it received. §4.1
- **Terminology:** supplier/manufacturer vs institution. Fix the words in the UI, not just the pitch. §1

---

## 6. Working rules

- **End of every phase, the demo runs end-to-end.** Never leave a half-integrated feature overnight. §9
- **Phase 3 (order loop) is a hard gate.** Nothing else starts until placing an order in Dhanvantari flips its status in Vayu.
- Don't add a dependency without checking whether the stack already covers it.
- Don't build Phase 10–11 items (mobile, hardware, offline PWA, route optimizer) until Phases 0–9 are green. They are the cut list.
- When a subagent reports "done," verify against the phase gate — don't take it at face value.
