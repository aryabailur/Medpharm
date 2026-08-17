/**
 * GET /api/stream/shipments/:id — live incoming-shipment updates over SSE.
 *
 * ARCHITECTURE.md §5.3. README §5 (Phase 4), Part 2.
 *
 * Deviation from §5.3, as documented in the README: the spec put this in a
 * Next.js route handler. With a UI-only frontend it lives here, so the stream
 * is cross-origin (CORS configured in index.ts) and the Vercel 300s serverless
 * cap does not apply — the 5-minute cap below is a client-reconnect
 * convenience, not a platform limit.
 *
 * Fed by the telemetry and excursion webhook receivers, not by a local sensor
 * pipeline: this side never computes excursions, it is told about them (§6.1).
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../../lib/prisma.js';
import { subscribe, type StreamEvent } from '../../lib/stream/sse-hub.js';

const STREAM_MAX_MS = 5 * 60_000;
const HEARTBEAT_MS = 15_000;

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/shipments/:id', async (req, reply) => {
    const shipmentId = req.params.id;

    const shipment = await prisma.incomingShipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) return reply.code(404).send({ error: 'not_found' });

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Set on the raw response too: we bypass Fastify's serializer here, so
      // the CORS plugin's headers are not applied for us.
      'access-control-allow-origin': process.env.DHANVANTARI_WEB_ORIGIN ?? 'http://localhost:3001',
      'access-control-allow-credentials': 'true',
      'x-accel-buffering': 'no',
    });

    const send = (e: StreamEvent) => {
      reply.raw.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };

    // Current state first, so a late joiner renders immediately rather than
    // waiting for the next webhook.
    send({
      event: 'status',
      data: {
        status: shipment.status,
        etaAt: shipment.etaAt,
        progressPct: shipment.progressPct,
        coldChain: shipment.coldChain,
        anomalyFlag: shipment.anomalyFlag,
        lastTempC: shipment.lastTempC,
        lastKnownLat: shipment.lastKnownLat,
        lastKnownLng: shipment.lastKnownLng,
      },
    });

    const unsubscribe = subscribe(shipmentId, send);
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), HEARTBEAT_MS);
    const cap = setTimeout(() => {
      reply.raw.write('event: status\ndata: {"reconnect":true}\n\n');
      reply.raw.end();
    }, STREAM_MAX_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(cap);
      unsubscribe();
    };
    req.raw.on('close', cleanup);
    reply.raw.on('close', cleanup);
  });
}
