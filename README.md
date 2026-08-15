# MedTrack — Web

**PS-SS04 — Drug Inventory and Supply Chain Tracking System**

Drug supply chain tracking from factory to hospital shelf: batch provenance, cold-chain telemetry, cross-organization order flow, and a grounded analytics layer.

> **Companion repo:** [`wilbert0838n/medpharm-app`](https://github.com/wilbert0838n/medpharm-app) — Expo mobile client.
> **Full spec:** [ARCHITECTURE.md](ARCHITECTURE.md) · **Agent instructions:** [CLAUDE.md](CLAUDE.md)

---

## Layout

The repo splits along the **frontend / backend** line. UI on one side, everything the browser must never see on the other.

```
web/
├── frontend/          UI only — Next.js 15 App Router
│   ├── vayu/          :3000   manufacturer / supplier
│   └── dhanvantari/   :3001   institution (hospital / CHC / PHC)
│
└── backend/           DB, secrets, cross-org traffic, intelligence
    ├── vayu-api/            :4000  Fastify + Prisma  — schema `vayu`
    ├── dhanvantari-api/     :4001  Fastify + Prisma  — schema `dhanvantari`
    ├── nidana/              :8000  FastAPI — stateless, owns no tables
    ├── simulator/                  GPS + temp telemetry generator
    ├── packages/                   contracts (Zod), crypto (HMAC), ui
    ├── data-gen/                   synthetic generators (Python)
    └── scripts/                    init-schemas.sql
```

Each folder has its own README with a **Part 1 / Part 2** parallel-work split:
[frontend/](frontend/README.md) · [backend/](backend/README.md)

---

## Architecture

```
  frontend/vayu :3000                            frontend/dhanvantari :3001
         │  fetch + SSE                                     │  fetch + SSE
         ▼                                                  ▼
  ┌──────────────────┐    signed webhooks + REST    ┌──────────────────────┐
  │  vayu-api :4000  │ ◄────────  (HMAC)  ────────► │ dhanvantari-api :4001│
  │  schema: vayu    │                              │ schema: dhanvantari  │
  └────────┬─────────┘                              └──────────┬───────────┘
           │          ONE Postgres, TWO schemas                │
           │          No cross-schema FKs. Ever.               │
           └──────────────────┬───────────────────────────────-┘
                              ▼
                  ┌───────────────────────────┐
                  │  nidana :8000  (FastAPI)  │  forecast · risk · RCA · routing
                  │  STATELESS, owns no data  │
                  └───────────────────────────┘
```

Two organisations, two schemas, **no shared tables**. Every cross-organisation interaction goes over a signed HTTP contract — either app could move to a separate database by changing one connection string (§3.1).

> **Deviation from ARCHITECTURE.md §5.3:** the spec put SSE in Next.js route handlers. With UI-only frontends, SSE lives in the Fastify servers. Cross-origin CORS is now required; the Vercel 300s serverless cap no longer applies.

---

## Quick start

**Prerequisites:** Node 20+, Python 3.11+, Docker

```bash
npm install
cp .env.example .env

npm run db:up          # Postgres + both schemas
npm run db:migrate     # prisma migrate, both servers

npm run dev:backend    # :4000 + :4001
npm run dev:frontend   # :3000 + :3001
```

Nidana runs separately:

```bash
cd backend/nidana
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

| Service | URL |
|---|---|
| Vayu (UI) | http://localhost:3000 |
| Dhanvantari (UI) | http://localhost:3001 |
| vayu-api | http://localhost:4000/health |
| dhanvantari-api | http://localhost:4001/health |
| Nidana | http://localhost:8000/docs |

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Everything with a `dev` script |
| `npm run dev:frontend` / `dev:backend` | One tier |
| `npm run dev:vayu` / `dev:vayu-api` | One service |
| `npm run db:up` / `db:down` | Docker Postgres |
| `npm run db:migrate` / `db:generate` | Prisma, both servers |
| `npm run db:studio:vayu` / `:dhanvantari` | Prisma Studio (:5555 / :5556) |
| `npm run typecheck` | All workspaces |

---

## Build status

Phases are defined in [ARCHITECTURE.md §9](ARCHITECTURE.md#9-build-order).

- [x] **Phase 0** — scaffold: monorepo, frontend/backend split, two Prisma schemas, contracts, HMAC helper
- [ ] **Phase 1** — seed data
- [ ] **Phase 2** — Vayu catalog, batch + QR, QC
- [ ] **Phase 3** — 🔒 order loop end-to-end *(hard gate)*
- [ ] **Phase 4** — shipment, simulator, SSE, live map + temp graph
- [ ] **Phase 5** — excursion detection + cross-app warning
- [ ] **Phase 6** — scan-in + complaint round-trip
- [ ] **Phase 7** — risk score + drilldown
- [ ] **Phase 8** — forecasting + SHAP
- [ ] **Phase 9** — chatbot, both sides
- [ ] **Phase 10** — RCA agent, scorecards, coverage gaps, routing
- [ ] **Phase 11** — mobile, hardware, offline PWA

Phase 0 is **structural only** — dependencies are not installed and nothing has been booted. The gate *"both apps boot, both connect"* is not yet met.

---

## Contributing

Branch → push → merge to `main`. Never commit directly to `main`. See [CLAUDE.md §2](CLAUDE.md#2-git-workflow).

```bash
git checkout -b feat/<name>
git push -u origin feat/<name>
```

Each service README defines **Part 1 / Part 2** — two file-disjoint tracks so two people can work the same service without merge conflicts.
