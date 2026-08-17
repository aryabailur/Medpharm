/**
 * GET /api/stream/shipments/:id — live telemetry over Server-Sent Events.
 *
 * ARCHITECTURE.md §5.3, §4.4. README §5 (Phase 4), Part 2.
 *
 * Deviation from §5.3: the spec put this in a Next.js route handler. With a
 * UI-only frontend it lives here, so the stream is cross-origin (CORS is
 * configured in index.ts) and the Vercel 300s serverless cap does not apply —
 * the 5-minute cap below is a client-reconnect convenience, not a platform
 * limit.
 *
 * Not WebSockets (bidirectional complexity we don't need) and not polling
 * (a 2s poll looks janky next to a smooth SSE-driven marker).
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../../lib/prisma.js';
import { subscribe, type StreamEvent } from '../../lib/telemetry/sse-hub.js';

/** Cap a stream at 5 minutes; the client reconnects (§5.3). */
const STREAM_MAX_MS = 5 * 60_000;
/** Heartbeat so proxies don't kill an idle connection. */
const HEARTBEAT_MS = 15_000;
/** Never send more than this many historical points (§4.4). */
const MAX_POINTS = 200;

/**
 * Evenly decimate to at most `max` points, always keeping the newest.
 * "Do not ship 4,000 points to the browser."
 */
export function decimate<T>(rows: T[], max = MAX_POINTS): T[] {
  if (rows.length <= max) return rows;
  const stride = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * stride)]!);
  const last = rows[rows.length - 1]!;
  if (out[out.length - 1] !== last) out[out.length - 1] = last;
  return out;
}

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/shipments/:id', async (req, reply) => {
    const shipmentId = req.params.id;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, status: true, coldChain: true, etaAt: true, progressPct: true },
    });
    if (!shipment) return reply.code(404).send({ error: 'not_found' });

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // CORS must be set on the raw response too — we bypass Fastify's
      // serializer here, so the plugin's headers don't get applied.
      'access-control-allow-origin': process.env.VAYU_WEB_ORIGIN ?? 'http://localhost:3000',
      'access-control-allow-credentials': 'true',
      'x-accel-buffering': 'no',
    });

    const send = (e: StreamEvent) => {
      reply.raw.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };

    // Replay recent history so a late joiner sees a populated chart
    // immediately rather than an empty one.
    const history = await prisma.telemetryPoint.findMany({
      where: { shipmentId },
      orderBy: { ts: 'asc' },
      select: { ts: true, lat: true, lng: true, tempC: true },
    });
    send({
      event: 'status',
      data: {
        status: shipment.status,
        etaAt: shipment.etaAt,
        progressPct: shipment.progressPct,
        history: decimate(history),
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
