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

import cors from '@fastify/cors';
import Fastify from 'fastify';

const PORT = Number(process.env.PORT ?? 4001);
const FRONTEND_ORIGIN = process.env.DHANVANTARI_WEB_ORIGIN ?? 'http://localhost:3001';

const app = Fastify({ logger: true });

// Allows the web frontend and, on a LAN IP, the Expo client.
await app.register(cors, { origin: [FRONTEND_ORIGIN], credentials: true });

app.get('/health', async () => ({ ok: true, service: 'dhanvantari-api' }));

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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
