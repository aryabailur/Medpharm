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

import cors from '@fastify/cors';
import Fastify from 'fastify';

const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.VAYU_WEB_ORIGIN ?? 'http://localhost:3000';

const app = Fastify({ logger: true });

// The frontend is a separate origin now. SSE and fetch both need this.
await app.register(cors, { origin: [FRONTEND_ORIGIN], credentials: true });

app.get('/health', async () => ({ ok: true, service: 'vayu-api' }));

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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
