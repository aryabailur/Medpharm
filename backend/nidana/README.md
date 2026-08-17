# Nidana — Intelligence Service

**Role:** MedTrack's shared analytics/AI brain — forecasting, risk scoring, complaint RCA, route optimization, assistant narration.
**Port:** `8000`
**One-liner:** A stateless FastAPI service that both Vayu and Dhanvantari call over HTTP for anything that needs LightGBM, SHAP, or an LLM — so that logic is written once, not duplicated in TypeScript on both sides (ARCHITECTURE.md §3.2).

Named for the Ayurvedic term for diagnosis/etiology.

---

## Start here

Paste one of these into Claude Code at the repo root. It reads this README, picks up your Part's owned file globs, and stays inside them.

**Part 1:**

```
Read backend/nidana/README.md. I'm taking Part 1.
Start with the 5-signal risk score and its drilldown JSON.
```

**Part 2:**

```
Read backend/nidana/README.md. I'm taking Part 2.
Start with the LightGBM forecast service and its features.
```

Branch first — never commit to `main`:

```bash
git checkout main && git pull origin main
git checkout -b feat/<short-name>
```

See [WORKPLAN.md](../../WORKPLAN.md) for the assignment table across all six deployables.

---

## 1. What it is / what it owns / what it does NOT own

**What it is:**
- A Python/FastAPI service, called server-side by `backend/vayu-api` (4000) and `backend/dhanvantari-api` (4001). **It is never called by the frontends directly** (§3.2, §9 Phase 0 diagram).
- Five endpoints, each doing one job: `/forecast`, `/risk`, `/rca`, `/route/optimize`, `/assistant/explain`, plus `/health`.

**What it owns:**
- Nothing persistent. No database, no Prisma, no migrations.
- Model artifacts on disk only (`models/*.pkl` for LightGBM — Phase 8), and reference data it reads at request time (`data/` — NLEM, facilities, disease signal, population, per ARCHITECTURE.md §8 repo layout).

**What it explicitly does NOT own:**
- No `TelemetryPoint`, `Shipment`, `Inventory`, `Complaint`, or any table in the `vayu` / `dhanvantari` Postgres schemas. Those live in the Prisma schemas of the two API servers.
- No user identity, no auth session, no HMAC verification of cross-app webhooks (that's `backend/packages/crypto` + the two `-api` servers).
- No direct database queries, ever — **every request must arrive with all the data it needs already in the body.** That's what "stateless" means here (§3.2): it "receives data in the request, owns no tables."

---

## 2. Quick start

```bash
cd backend/nidana
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open **http://localhost:8000/docs** for the auto-generated OpenAPI/Swagger UI — this is the fastest way to hit each stub while it's under construction.

CORS is already configured in `main.py` for `http://localhost:3000` (Vayu) and `http://localhost:3001` (Dhanvantari) — but remember, the frontends don't call Nidana directly; this CORS entry is a convenience for local testing from the browser, not the production call path (production calls come server-to-server from the `-api` servers).

---

## 3. Endpoint reference

| Endpoint | Method | Phase | Purpose | Router file |
|---|---|---|---|---|
| `/health` | GET | — | Liveness + cron warm-up target (§3.2) | `main.py` |
| `/forecast` | POST | 8 | LightGBM point regressor + P10/P90 quantile band (`alpha=0.10/0.90`) + SHAP drivers | `routers/forecast.py` |
| `/risk` | POST | 7 | Deterministic 5-signal weighted-sum stockout risk + drilldown | `routers/risk.py` |
| `/rca` | POST | 10 | LLM narrates a pre-built evidence bundle for complaint root cause | `routers/rca.py` |
| `/route/optimize` | POST | 10 | Nearest-neighbour + 2-opt TSP over haversine/OSRM | `routers/route.py` |
| `/assistant/explain` | POST | 9 | LLM narration over evidence for the chatbot's answer step | `routers/assistant.py` |

Request/response shapes are already declared as Pydantic models in each router (see the stubs) — implement the body, don't change the schema without updating both callers.

---

## 4. PART 1 / PART 2 PARALLEL TRACKS

Two people, zero merge conflicts. **Strict rule: each file glob below is owned by exactly one part. Never edit a file outside your part's list.**

### Owned globs

| Part | Owns |
|---|---|
| **Part 1** | `routers/risk.py`, `services/risk_service.py`, `data/plain_language_lookup.py` (or `.json`), `main.py`'s `/health` docstring/behavior only |
| **Part 2** | `routers/forecast.py`, `services/forecast_service.py`, `routers/rca.py`, `services/rca_service.py`, `routers/route.py`, `services/route_service.py`, `models/*.pkl` training scripts |

### Shared — coordinate before editing

| File | Why it's shared | Rule |
|---|---|---|
| `main.py` (the `include_router()` block) | Both parts register a router here | **Neither part edits alone.** Append your `include_router(...)` line at the marker comment below — do not reformat or reorder existing lines. |
| `services/__init__.py` | Common service exports (if you add shared helpers, e.g. a signal-agreement util) | Discuss in chat/PR description before adding an export; whoever adds second rebases on the other's addition. |
| `requirements.txt` | Both parts may need new pip packages | Append only, don't reorder or delete existing pinned versions; re-run `pip install -r requirements.txt` after merge. |

**The one unavoidable shared touchpoint** is the `include_router()` call in `main.py`. To avoid a two-line diff conflict, add a marker comment now and have both parts append below it:

```python
app.include_router(forecast.router)
app.include_router(risk.router)
app.include_router(rca.router)
app.include_router(route.router)
app.include_router(assistant.router)
# --- NEW ROUTERS: append below this line, one per line, do not reorder above ---
```

Since all five routers are already registered in the current stub, in practice neither part needs to touch this block for Phase 7/8/10 — **only touch it if you add a genuinely new router file.** If both parts are just filling in existing stubs (`risk.py`, `forecast.py`, `rca.py`, `route.py`), `main.py` needs no edits at all and this becomes a non-issue. Call this out explicitly in your PR so the other person knows you didn't touch it.

### Part 1 — Risk (critical path)

Unblocks both dashboards (Vayu risk view, Dhanvantari reorder-suggest chatbot intent V8) the moment it's done — **this is the critical path.**

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Implement 5-signal weighted sum (cover days, consumption trend, disease signal, supply reliability, supplier reliability) | `routers/risk.py`, `services/risk_service.py` | 7 | — |
| Confidence-as-agreement rule (`high` ≥3/5 signals agree, `medium` 2, `low` 1) | `services/risk_service.py` | 7 | signal weights above |
| Drilldown JSON (per-signal name/value/weight/contribution/explanation) | `services/risk_service.py` | 7 | 5-signal sum |
| Plain-language explanation strings for each signal (feeds `RiskSignal.explanation`) | `data/plain_language_lookup.py` | 7 | — (can start immediately, independent) |
| `/health` cron warm-up doc check (no code change expected, verify it works standalone) | `main.py` (read-only verification) | 7 | — |

### Part 2 — Forecast, RCA, Route (in that order)

| Task | Files created/edited | Phase | Depends on |
|---|---|---|---|
| Feature engineering: lags 1/2/3/6/12, rolling mean/std 3/6/12, **month sin/cos** (not integer month), institution tier, drug category, disease-signal index | `services/forecast_service.py` | 8 | synthetic training data (data-gen, Phase 1) |
| Train LightGBM point regressor + two quantile regressors (`alpha=0.10`, `alpha=0.90`) | `services/forecast_service.py`, `models/*.pkl` | 8 | features above |
| Chronological split validation (hold out last 2 months), report MAPE + 80%-band coverage | `services/forecast_service.py` | 8 | trained model |
| SHAP top 3-5 attributions → plain-language lookup (`lag_1` → "last month's consumption", etc.) | `services/forecast_service.py`, shared lookup table | 8 | trained model. **Note:** if Part 1's `data/plain_language_lookup.py` exists, reuse/extend it rather than forking a second lookup table — coordinate naming. |
| Wire `routers/forecast.py` to the service | `routers/forecast.py` | 8 | service complete |
| Evidence-bundle-in RCA narration (LLM prompt, temp 0.2) | `routers/rca.py`, `services/rca_service.py` | 10 | — |
| Nearest-neighbour + 2-opt route construction, haversine default / OSRM optional | `routers/route.py`, `services/route_service.py` | 10 | — |
| Cold-chain-first + CRITICAL-risk-jumps-queue + capacity constraints | `services/route_service.py` | 10 | NN+2-opt base |
| `km_saved` / `cold_chain_minutes_at_risk_saved` before/after reporting | `services/route_service.py` | 10 | route optimizer base |

**Assistant (`/assistant/explain`, Phase 9)** is unassigned by design — it's short (LLM narration + template fallback + demo-question cache, §7.4) and should go to **whichever part finishes first.** It touches only `routers/assistant.py`, so it can't conflict with either part's other files.

---

## 5. Phase mapping (§9)

| Phase | Nidana work | Gate |
|---|---|---|
| **7** | Risk score + drilldown (no ML) → dashboards on both sides | Every flag drills to 5 signals |
| **8** | Forecasting + SHAP → plain-language drivers | Band chart + top-3 reasons |
| **9** | Assistant narration wired into the chatbot's evidence→narration step | 6 demo questions answer in <3s |
| **10** | RCA agent, route optimizer | Nice-to-have, in this order — cut first if behind schedule |

Per §9's cut order: if behind, SHAP falls back to rule-based "why" before the RCA agent is cut. Risk (Phase 7) is never cut — it's the hero feature (§2).

---

## 6. Non-negotiables / gotchas

- **Ship the TypeScript fallback FIRST, on the caller side, before Nidana's real logic lands** (§3.2). Vayu/Dhanvantari need a rolling-mean forecast and weighted-sum risk in TS so a Nidana outage never blackscreens the demo. This is not Nidana's code to write, but Nidana's implementers must not treat their endpoint as the only path.
- **Cold starts are 30+ seconds on free tiers** (Render/Railway/Fly.io). Warm `/health` with a cron ping ~10 minutes before any demo (§3.2, §11 pre-flight).
- **Cyclical month encoding only.** Forecast features use `sin(2π·month/12)` / `cos(2π·month/12)`, never a raw integer month — integer months teach the tree that December ≫ January (§6.4).
- **Validation is chronological, not random.** Hold out the last 2 months; report MAPE and 80%-band coverage. If coverage lands at 40%, the bands are cosmetic and a sharp judge will catch it (§6.4).
- **Never expose raw SHAP feature names in any UI.** Every attribution goes through the plain-language lookup table before it reaches a response (§6.4).
- **Risk confidence is signal agreement, not model certainty.** `high` at ≥3 of 5 signals pointing the same way, `medium` at 2, `low` at 1 — make this rule visible in the UI tooltip; it's the "we don't cry wolf" demo line (§6.4, §11 t=4:50).
- **RCA and assistant never invent numbers.** The evidence bundle is assembled entirely by the caller, with no LLM involvement, before it reaches Nidana. The LLM's job is narration only, temperature 0.2, and it must say "insufficient evidence" rather than guess (§6.3, §7).
- **No SQL, no DB client, in this codebase.** If an endpoint implementation seems to need to "look something up," that data belongs in the request payload — push it back to the caller, don't reach for a database connection.
- **Deploy target:** Render / Railway / Fly.io free tier (§3.2). Keep `requirements.txt` lean — every extra package is slower cold-start.
