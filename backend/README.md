# backend/

Everything the browser must never see: the database, the HMAC shared secret, cross-organisation traffic, and the intelligence layer.

| Service | Package | Port | Owns |
|---|---|---|---|
| [vayu-api](vayu-api/) | `@medtrack/vayu-api` | 4000 | Postgres schema `vayu`, sensor ingest, SSE, webhook dispatch |
| [dhanvantari-api](dhanvantari-api/) | `@medtrack/dhanvantari-api` | 4001 | Postgres schema `dhanvantari`, webhook receipt, SSE, Expo endpoints |
| [nidana](nidana/) | — (Python) | 8000 | Forecasting, risk, RCA, routing. **Stateless — owns no tables** |
| [simulator](simulator/) | `@medtrack/simulator` | — | GPS + temperature telemetry → `vayu-api` |
| [packages/](packages/) | `@medtrack/*` | — | `contracts` (Zod), `crypto` (HMAC), `ui` |
| [data-gen/](data-gen/) | — (Python) | — | Synthetic generators |

---

## Shape

```
   frontend/vayu :3000                          frontend/dhanvantari :3001
          │  fetch + SSE                                   │  fetch + SSE
          ▼                                                ▼
   ┌──────────────────┐   signed webhooks + REST   ┌──────────────────────┐
   │  vayu-api :4000  │ ◄──────  (HMAC)  ────────► │ dhanvantari-api :4001│
   │                  │                            │                      │
   │  schema: vayu    │                            │ schema: dhanvantari  │
   │  Prisma client A │                            │ Prisma client B      │
   └────────┬─────────┘                            └──────────┬───────────┘
            │        ONE Postgres, TWO schemas                │
            │        No cross-schema FKs. Ever. (§3.1)        │
            └───────────────────┬────────────────────────────-┘
                                ▼
                   ┌─────────────────────────────┐
                   │  nidana :8000  (FastAPI)    │
                   │  STATELESS — owns no tables │
                   └─────────────────────────────┘
                                ▲
                   ┌────────────┴──────────────┐
                   │ simulator → /api/sensors/ │  payload-identical to
                   │ ingest @ 1–2 Hz           │  ESP32+DS18B20+NEO-6M
                   └───────────────────────────┘
```

The two API servers **share no tables**. Every cross-organisation interaction goes over a signed HTTP contract — either could move to a separate database by changing one connection string (§3.1).

> **Deviation from ARCHITECTURE.md §5.3.** The spec put SSE in Next.js route handlers. With UI-only frontends it lives in these Fastify servers instead. Cross-origin CORS is now required; in exchange the Vercel 300s serverless cap no longer applies, so the 5-minute stream cap is a client-reconnect convenience rather than a platform limit.

---

## Quick start

```bash
# from repo root
npm install
cp .env.example .env

npm run db:up          # docker compose — Postgres + both schemas
npm run db:migrate     # prisma migrate, both servers
npm run dev:backend    # :4000 + :4001
```

Nidana runs separately (Python):

```bash
cd backend/nidana
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000                   # /docs for OpenAPI
```

| Check | Expect |
|---|---|
| `curl localhost:4000/health` | `{"ok":true,"service":"vayu-api"}` |
| `curl localhost:4001/health` | `{"ok":true,"service":"dhanvantari-api"}` |
| `curl localhost:8000/health` | `{"ok":true,"service":"nidana",...}` |

---

## Non-negotiables

These are cheap now and expensive to retrofit.

**HMAC-sign every cross-app request (§5.2).** Headers `X-MedTrack-Signature` / `-Timestamp` / `-Event-Id`. Reject on a timestamp older than 5 minutes; compare with `timingSafeEqual` — a plain `===` leaks signature bytes through timing. Implemented in [`packages/crypto`](packages/crypto/src/index.ts).

**Idempotency (§5.2).** Store every seen `X-MedTrack-Event-Id` in `ProcessedEvent`. Duplicate → `200`, do nothing. Webhooks retry; without this you get double stock entries on stage.

**Retry with backoff (§5.2).** `OutboundEvent` + a worker at `1s, 4s, 16s, 60s`, then park as `FAILED` with a manual replay button. This is what saves the demo when the venue wifi drops for three seconds.

**Never invent an ID (§4.1).** `batchId`, `shipmentId`, `supplyOrderId` are UUIDv7 and global. A server only ever echoes an ID it received.

**Never generate SQL from an LLM (§7.4).** Every assistant query is a hand-written parameterised Prisma call. Text-to-SQL is a security hole and a hallucination surface, and it will fail live.

**Every Nidana call needs a deterministic TS fallback (§3.2)** — rolling-mean forecast, weighted-sum risk. **Ship the fallback first.** Nidana must never be a single point of demo failure. Force-test it with `NIDANA_FORCE_FALLBACK=true`.

**No foreign keys across the schema boundary (§3.1).** Not once. It is the whole basis of the two-organisation claim.

---

## Gotchas that cost real time

Two traps found while building `vayu-api`. Both are fixed in the repo — this is so you recognise the symptoms if they resurface.

**Each service generates its own Prisma client.** Both schemas used to write to the shared `node_modules/.prisma/client`, so whoever ran `prisma generate` last silently overwrote the other server's models. Each `schema.prisma` now declares its own `output` dir.

> **After pulling, run `npx prisma generate` inside your service directory**, not from the repo root.

Symptom if this breaks: `Cannot read properties of undefined (reading 'findMany')` at runtime, on a file that typechecks cleanly.

Related: `lib/prisma.ts` imports the client by **relative path**, not as `@prisma/client`. A bare specifier resolves against the *process* working directory, and `npm run dev:*` starts from the repo root — so it would pick up the hoisted root client. Don't "tidy" that import.

**`.env` is loaded in `index.ts`, not via a flag.** `tsx watch` respawns a child process that doesn't inherit `--env-file`, so the secret silently goes missing on the first reload. Prisma reads `.env` on its own, which is why the database can work while `MEDTRACK_SHARED_SECRET` is undefined.

---

## Environment

Server-only values (never `NEXT_PUBLIC_*`):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Per service — `?schema=vayu` or `?schema=dhanvantari` |
| `MEDTRACK_SHARED_SECRET` | HMAC. **Both servers must hold the same value.** `openssl rand -hex 32` |
| `VAYU_API_URL` / `DHANVANTARI_API_URL` | Where each server reaches the other |
| `VAYU_WEB_ORIGIN` / `DHANVANTARI_WEB_ORIGIN` | CORS allowlist |
| `NIDANA_BASE_URL`, `NIDANA_FORCE_FALLBACK` | Intelligence service |
| `GROQ_API_KEY` | RCA + assistant narration |
| `CLERK_SECRET_KEY` | Auth |

See [`.env.example`](../.env.example).

---

## Parallel work

Each service's README carries a file-disjoint **Part 1 / Part 2** split:

- [vayu-api/README.md](vayu-api/README.md)
- [dhanvantari-api/README.md](dhanvantari-api/README.md)
- [nidana/README.md](nidana/README.md)
- [simulator/README.md](simulator/README.md)

**Critical path:** Phase 3, the order loop — place in Dhanvantari → approve in Vayu → status flips back. 🔒 Hard gate; nothing else starts until it's green (§9).

**Shared across services — coordinate before editing:**

| Path | Why |
|---|---|
| [`packages/contracts`](packages/contracts/src/index.ts) | Both servers *and* both frontends *and* the Expo app import it. A change here ripples everywhere — that's the point (a payload change breaks the build, not the demo), but announce it. |
| [`packages/crypto`](packages/crypto/src/index.ts) | Both servers. A signing change breaks every cross-app call at once. |
| [`../.env.example`](../.env.example) | Adding a var means telling everyone. |
