# MedTrack — Web

**PS-SS04 — Drug Inventory and Supply Chain Tracking System**

Drug supply chain tracking from factory to hospital shelf: batch provenance, cold-chain telemetry, cross-organization order flow, and a grounded analytics layer.

> **Companion repo:** [`wilbert0838n/medpharm-app`](https://github.com/wilbert0838n/medpharm-app) — Expo mobile client.
> **Full spec:** [ARCHITECTURE.md](ARCHITECTURE.md) · **Agent instructions:** [CLAUDE.md](CLAUDE.md)

---

## What's in this repo

| Deployable | Path | Role |
|---|---|---|
| **Vayu** | `apps/vayu` | Manufacturer / supplier side — catalog, batches, QC, order approval, dispatch, telemetry console |
| **Dhanvantari** | `apps/dhanvantari` | Institution side — inventory, POS, scan-in, complaints, reorder |
| **Nidana** | `services/nidana` | Stateless intelligence service — forecasting, risk scoring, RCA, route optimization |
| **Simulator** | `services/simulator` | Drives GPS + temperature along a route into `/api/sensors/ingest` |

Shared code lives in `packages/` — `contracts` (Zod schemas for every cross-app payload), `crypto` (HMAC sign/verify), `ui`.

---

## Architecture in one picture

```
  Vayu (Next.js)  ◄── signed webhooks + REST (HMAC) ──►  Dhanvantari (Next.js)
        │                                                        │
   schema: vayu          ONE Postgres, TWO schemas         schema: dhanvantari
        │                  No cross-schema FKs                   │
        └────────────────────────┬───────────────────────────────┘
                                 ▼
                   Nidana (FastAPI) — stateless, owns no tables
```

Two apps, two schemas, no shared tables. Every cross-organization interaction goes over a signed HTTP contract.

---

## Quick start

**Prerequisites:** Node 20+, Python 3.11+, Docker (for local Postgres)

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres
docker compose up -d

# 3. Configure environment
cp .env.example .env

# 4. Run migrations (creates both schemas)
npm run db:migrate

# 5. Start everything
npm run dev
```

| Service | URL |
|---|---|
| Vayu | http://localhost:3000 |
| Dhanvantari | http://localhost:3001 |
| Nidana | http://localhost:8000 (`/docs` for OpenAPI) |

**Nidana separately:**

```bash
cd services/nidana
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Repo layout

```
├── apps/
│   ├── vayu/            # Next.js — manufacturer
│   └── dhanvantari/     # Next.js — institution
├── services/
│   ├── nidana/          # FastAPI — forecast, risk, RCA, routing
│   └── simulator/       # Node — GPS + temp telemetry generator
├── packages/
│   ├── contracts/       # Zod schemas for every cross-app payload
│   ├── crypto/          # HMAC sign/verify
│   └── ui/              # shared components
└── data-gen/            # synthetic data generators (Python)
```

---

## Build status

Phases are defined in [ARCHITECTURE.md §9](ARCHITECTURE.md#9-build-order).

- [x] **Phase 0** — scaffold: monorepo, Postgres, two Prisma schemas, contracts, HMAC helper
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

---

## Contributing

Branch → push → merge to `main`. Never commit directly to `main`. See [CLAUDE.md §2](CLAUDE.md#2-git-workflow).

```bash
git checkout -b feat/<name>
git push -u origin feat/<name>
```
