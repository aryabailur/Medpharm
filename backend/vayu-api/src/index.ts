/**
 * Vayu API — manufacturer / supplier server.
 *
 * ARCHITECTURE.md §5.
 *
 * Owns everything the browser must not see: Prisma, the HMAC shared secret,
 * webhook dispatch and verification, and the SSE stream.
 *
 * NOTE — deviation from ARCHITECTURE.md §5.3. The spec put SSE in a Next.js
 * route handler. With a UI-only frontend it lives here instead. One upside:
 * the Vercel 300s serverless cap no longer applies, so the 5-minute stream cap
 * is a client-reconnect convenience rather than a hard platform limit.
 *
 * SCAFFOLD — Phase 0.
 */

// Load .env before anything reads process.env.
//
// Not a `--env-file` flag: `tsx watch` re-spawns a child on each change and the
// flag does not reach it, so the secret silently goes missing on reload. Doing
// it here means the env is loaded however the process was started.
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile(new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
} catch {
  // No .env (e.g. production, where the platform injects real env vars).
}

import cors from '@fastify/cors';
import Fastify from 'fastify';

import { registerRawBodyParser } from './lib/hmac-middleware.js';
import { batchRoutes } from './routes/batches/index.js';
import { catalogRoutes } from './routes/catalog/index.js';
import { ordersApproveRoutes } from './routes/orders/approve.js';
import { ordersIncomingRoutes } from './routes/orders/incoming.js';
import { ordersListRoutes } from './routes/orders/list.js';
import { sensorRoutes } from './routes/sensors/ingest.js';
import { streamRoutes } from './routes/stream/shipments.js';
import { startRetryWorker } from './lib/webhooks/dispatch.js';

const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.VAYU_WEB_ORIGIN ?? 'http://localhost:3000';

const app = Fastify({ logger: true });

// The frontend is a separate origin now. SSE and fetch both need this.
await app.register(cors, { origin: [FRONTEND_ORIGIN], credentials: true });

// Must come before any route that verifies an HMAC signature: the signature
// covers the exact request bytes, so we keep the raw body alongside the
// parsed JSON. See lib/hmac-middleware.ts.
registerRawBodyParser(app);

app.get('/health', async () => ({ ok: true, service: 'vayu-api' }));

// --- ROUTES: append registration below, one per line, do not reorder above ---
await app.register(catalogRoutes, { prefix: '/api/catalog' });
await app.register(batchRoutes, { prefix: '/api/batches' });
await app.register(ordersListRoutes, { prefix: '/api/orders' });
await app.register(ordersIncomingRoutes, { prefix: '/api/orders' });
await app.register(ordersApproveRoutes, { prefix: '/api/orders' });
await app.register(sensorRoutes, { prefix: '/api/sensors' });
await app.register(streamRoutes, { prefix: '/api/stream' });

// ─── Routes to implement, by phase (§9) ──────────────────────────────────────
//
// Inbound from Dhanvantari — HMAC-verified, idempotent (§5.1, §5.2):
//   POST /api/orders/incoming                 Phase 3  🔒 hard gate
//   POST /api/complaints/incoming             Phase 6
//   POST /api/consumption/report              Phase 7
//   POST /api/shipments/:id/confirm-receipt   Phase 6
//
// Telemetry ingest — identical payload from simulator or ESP32 (§6.1):
//   POST /api/sensors/ingest                  Phase 4
//
// Real-time to the frontend (§5.3):
//   GET  /api/stream/shipments/:id            Phase 4   text/event-stream
//
// Assistant — intent, deterministic tool dispatch, LLM narration (§7.3):
//   POST /api/assistant/query                 Phase 9
//
// Read APIs for the UI: catalog, batches, orders, shipments, complaints.

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    // Drains OutboundEvent with 1s/4s/16s/60s backoff (§5.2).
    startRetryWorker(app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
