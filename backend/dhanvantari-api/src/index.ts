/**
 * Dhanvantari API — institution server.
 *
 * ARCHITECTURE.md §5.
 *
 * Owns Prisma, the HMAC shared secret, webhook receipt from Vayu, and the SSE
 * stream to this app's frontend and to the Expo client.
 *
 * SCAFFOLD — Phase 0.
 */

// Load .env before anything reads process.env.
//
// Not a `--env-file` flag: `tsx watch` re-spawns a child on each change and the
// flag does not reach it, so the secret silently goes missing on reload.
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile(new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
} catch {
  // No .env (e.g. production, where the platform injects real env vars).
}

import cors from '@fastify/cors';
import Fastify from 'fastify';

import { startOutboundWorker } from './lib/outbound/sender.js';
import { registerRawBodyParser } from './lib/webhooks/verify-middleware.js';
import { webhookRoutes } from './lib/webhooks/receivers.js';
import { assistantRoutes } from './routes/assistant/index.js';
import { expoRoutes } from './routes/expo/index.js';
import { streamRoutes } from './routes/stream/shipments.js';
import { supplierScorecardRoutes } from './routes/supplier-scorecard/index.js';
import { inventoryRoutes } from './routes/inventory/index.js';
import { ordersListRoutes } from './routes/orders/list.js';
import { ordersPlaceRoutes } from './routes/orders/place.js';
import { posRoutes } from './routes/pos/index.js';

const PORT = Number(process.env.PORT ?? 4001);
const FRONTEND_ORIGIN = process.env.DHANVANTARI_WEB_ORIGIN ?? 'http://localhost:3001';

const app = Fastify({ logger: true });

// Allows the web frontend and, on a LAN IP, the Expo client.
await app.register(cors, { origin: [FRONTEND_ORIGIN], credentials: true });

// Must come before any HMAC-verified route: the signature covers the exact
// request bytes, so we keep the raw body alongside the parsed JSON.
registerRawBodyParser(app);

app.get('/health', async () => ({ ok: true, service: 'dhanvantari-api' }));

// --- ROUTES: append registration below, one per line, do not reorder above ---
await app.register(inventoryRoutes, { prefix: '/api/inventory' });
await app.register(posRoutes, { prefix: '/api/pos' });
await app.register(ordersListRoutes, { prefix: '/api/orders' });
await app.register(ordersPlaceRoutes, { prefix: '/api/orders' });
await app.register(webhookRoutes, { prefix: '/api/webhooks/vayu' });
await app.register(streamRoutes, { prefix: '/api/stream' });
await app.register(expoRoutes, { prefix: '/api' });
await app.register(supplierScorecardRoutes, { prefix: '/api/supplier-scorecard' });
await app.register(assistantRoutes, { prefix: '/api/assistant' });

// ─── Routes to implement, by phase (§9) ──────────────────────────────────────
//
// Webhooks from Vayu — HMAC-verified, idempotent on X-MedTrack-Event-Id (§5.1):
//   POST /api/webhooks/vayu/order-status         Phase 3  🔒 hard gate
//   POST /api/webhooks/vayu/shipment-dispatched  Phase 4
//   POST /api/webhooks/vayu/shipment-telemetry   Phase 4   throttled, 10s
//   POST /api/webhooks/vayu/shipment-excursion   Phase 5   pre-arrival warning
//   POST /api/webhooks/vayu/complaint-status     Phase 6
//
// Outbound to Vayu, via the OutboundEvent retry queue (1s, 4s, 16s, 60s):
//   place order, file complaint, report consumption, confirm receipt
//
// Real-time to frontend + mobile (§5.3):
//   GET  /api/stream/shipments/:id               Phase 4   text/event-stream
//
// Serves the Expo client (medpharm-app) — it talks only to this server:
//   GET  /api/batches/resolve?qr=                Phase 6
//   GET  /api/shipments/incoming                 Phase 4
//   POST /api/shipments/confirm-receipt          Phase 6
//   POST /api/complaints                         Phase 6
//
// Assistant — own-data scope, enforced server-side before the LLM (§7.2):
//   POST /api/assistant/query                    Phase 9
//
// Read APIs for the UI: inventory, POS/dispense, orders, supplier scorecard.

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    // Drains OutboundEvent to Vayu with 1s/4s/16s/60s backoff (§5.2).
    startOutboundWorker(app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
