# frontend/

UI only. Two Next.js 15 App Router apps, one per organisation.

**Neither app touches the database, holds a secret, or calls the other organisation.** All of that lives in [`backend/`](../backend/). These apps render, and they call their own API server over HTTP.

| App | Package | Port | Talks to | Role |
|---|---|---|---|---|
| [vayu](vayu/) | `@medtrack/vayu-web` | 3000 | `vayu-api` :4000 | Manufacturer / supplier |
| [dhanvantari](dhanvantari/) | `@medtrack/dhanvantari-web` | 3001 | `dhanvantari-api` :4001 | Institution (hospital / CHC / PHC) |

---

## The boundary

```
  ┌─────────────────────┐                    ┌──────────────────────┐
  │  frontend/vayu      │   fetch + SSE      │  backend/vayu-api    │
  │  Next.js  :3000     │ ─────────────────► │  Fastify  :4000      │
  │                     │ ◄───────────────── │                      │
  │  UI, charts, maps   │   cross-origin     │  Prisma, HMAC, SSE   │
  └─────────────────────┘                    └──────────────────────┘
         no Prisma                                  owns schema `vayu`
         no HMAC secret
         no direct DB
```

**Lives here:** pages, components, charts, maps, client state, `lib/api.ts`.

**Does not live here:**

| Not here | Why | Where instead |
|---|---|---|
| Prisma / SQL | The browser must never reach the DB | `backend/*-api/prisma/` |
| `MEDTRACK_SHARED_SECRET` | A secret in a browser bundle is not a secret | `backend/*-api` env |
| `@medtrack/crypto` | HMAC signing is server-only | imported by API servers only |
| Webhook send/receive | Server→server, per §5.1 | `backend/*-api/src/routes/` |
| SSE stream *origin* | Frontends *consume* the stream, they don't serve it | `backend/*-api` |

`@medtrack/contracts` **is** imported here — Zod schemas are shared types, not secrets.

> **Deviation from ARCHITECTURE.md §5.3.** The spec put SSE in a Next.js route handler. With UI-only frontends it moved to the Fastify servers, so the stream is now cross-origin (CORS is real config) and the Vercel 300s serverless cap no longer applies.

---

## Quick start

Both apps need their API server running, or every page renders empty.

```bash
# from repo root
npm install
cp .env.example .env

npm run dev:backend      # :4000 + :4001 first
npm run dev:frontend     # then :3000 + :3001
```

| URL | App |
|---|---|
| http://localhost:3000 | Vayu |
| http://localhost:3001 | Dhanvantari |

Run one at a time with `npm run dev:vayu` / `npm run dev:dhanvantari`.

---

## Shared client surface

Both apps have an identical `lib/api.ts`:

```ts
export const API_URL: string;
export function api<T>(path: string, init?: RequestInit): Promise<T>;
export function streamShipment(shipmentId: string): EventSource;
```

`streamShipment` opens the cross-origin SSE stream. **Reconnect client-side** — a long judging session must not silently die (§5.3).

Point each app at its server with `NEXT_PUBLIC_VAYU_API_URL` / `NEXT_PUBLIC_DHANVANTARI_API_URL`.

> `NEXT_PUBLIC_*` is readable by anyone who opens devtools. **Never put a secret behind that prefix.**

---

## Conventions

**Terminology (§1) — this costs marks if you get it wrong.**

| Never write | Always write |
|---|---|
| Vendor | **Supplier / Manufacturer** (the one who ships — PS-SS04's "vendor") |
| Vendor | **Institution** (hospital / CHC / PHC — the one who receives) |
| Vendor Reliability | **Supplier Scorecard** (in Dhanvantari) / **Institution Reliability Panel** (in Vayu) |

Fix the words **in the UI**, not just in the pitch.

**Other rules:**
- **Never render raw SHAP feature names.** Map to plain language — `lag_1` → *"last month's consumption"* (§6.4).
- **Decimate telemetry server-side to ~200 points.** Don't ship 4,000 points to Recharts (§4.4).
- **Confirm before commit.** Scanned or inferred quantities are *proposals*; a human confirms (§2.1).

---

## Parallel work

Each app's README carries its own file-disjoint **Part 1 / Part 2** split:

- [vayu/README.md](vayu/README.md)
- [dhanvantari/README.md](dhanvantari/README.md)

Across the two apps the work is already disjoint — one person per app never conflicts. Within one app, two people take Part 1 and Part 2.

**Critical path:** Phase 3, the order loop (place in Dhanvantari → approve in Vayu → status flips back). It is a 🔒 hard gate — nothing else ships until it's green (§9).
