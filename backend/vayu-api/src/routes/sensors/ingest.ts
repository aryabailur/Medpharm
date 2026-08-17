/**
 * POST /api/sensors/ingest — telemetry from the simulator or real hardware.
 *
 * ARCHITECTURE.md §6.1, §6.2. README §5 (Phase 4), Part 2.
 *
 * The payload is IDENTICAL whether it comes from the Node simulator or an
 * ESP32 + DS18B20 + NEO-6M. That is the point: swapping in real hardware needs
 * zero server-side change.
 *
 * Fan-out per §6.1:
 *   write TelemetryPoint
 *   update Shipment.lastKnown*, progressPct, etaAt
 *   SSE push to Vayu clients
 *   throttled webhook -> Dhanvantari (10s cadence, not every tick)
 *   excursion detector
 *
 * Not HMAC-verified: this is a device endpoint, not a cross-org contract call
 * (README §5, footnote). Gate it with a device key before any real deployment.
 */

import { SensorIngestSchema } from '@medtrack/contracts';
import type { FastifyInstance } from 'fastify';

import { prisma } from '../../lib/prisma.js';
import {
  classify,
  deviation,
  initialState,
  isOutOfBand,
  step,
  type Band,
  type DetectorState,
} from '../../lib/telemetry/excursion-detector.js';
import { publish } from '../../lib/telemetry/sse-hub.js';

const DHANVANTARI_URL = process.env.DHANVANTARI_API_URL ?? 'http://localhost:4001';
const TELEMETRY_WEBHOOK_MS = 10_000;

/** Per-shipment detector state, rebuilt lazily after a restart. */
const detectors = new Map<string, DetectorState>();
/** Last time we forwarded telemetry to Dhanvantari, per shipment. */
const lastForwardedAt = new Map<string, number>();

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function sensorRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ingest', async (req, reply) => {
    const parsed = SensorIngestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const p = parsed.data;
    const ts = new Date(p.ts);

    const shipment = await prisma.shipment.findUnique({
      where: { id: p.shipmentId },
      select: {
        id: true,
        coldChain: true,
        status: true,
        lastKnownLat: true,
        lastKnownLng: true,
        progressPct: true,
        supplyOrderId: true,
      },
    });
    if (!shipment) return reply.code(404).send({ error: 'unknown_shipment' });

    await prisma.telemetryPoint.create({
      data: {
        shipmentId: p.shipmentId,
        ts,
        lat: p.lat,
        lng: p.lng,
        tempC: p.tempC,
        humidity: p.humidity,
        source: p.deviceId.startsWith('sim-') ? 'SIMULATED' : 'DEVICE',
        deviceId: p.deviceId,
      },
    });

    // Progress: accumulate distance travelled against the shipment's route.
    let progressPct = shipment.progressPct ?? 0;
    if (p.lat != null && p.lng != null && shipment.lastKnownLat != null && shipment.lastKnownLng != null) {
      const stepKm = haversineKm(
        [shipment.lastKnownLat, shipment.lastKnownLng],
        [p.lat, p.lng],
      );
      // Route total is set at dispatch; without it we can only report movement.
      progressPct = Math.min(1, progressPct + stepKm / 100);
    }

    await prisma.shipment.update({
      where: { id: p.shipmentId },
      data: {
        lastKnownLat: p.lat ?? undefined,
        lastKnownLng: p.lng ?? undefined,
        lastTempC: p.tempC ?? undefined,
        progressPct,
        ...(shipment.status === 'DISPATCHED' ? { status: 'IN_TRANSIT' as const } : {}),
      },
    });

    if (p.lat != null && p.lng != null) {
      publish(p.shipmentId, { event: 'position', data: { lat: p.lat, lng: p.lng, ts: p.ts, progressPct } });
    }
    if (p.tempC != null) {
      publish(p.shipmentId, { event: 'temperature', data: { tempC: p.tempC, ts: p.ts } });
    }

    // --- excursion detection (cold-chain shipments only) -------------------
    if (shipment.coldChain && p.tempC != null) {
      const band = await resolveBand(p.shipmentId);
      if (band) {
        let state = detectors.get(p.shipmentId);
        if (!state) {
          const open = await prisma.excursion.findFirst({
            where: { shipmentId: p.shipmentId, endedAt: null },
            select: { id: true },
          });
          state = initialState(open?.id ?? null);
          detectors.set(p.shipmentId, state);
        }

        const ev = step(state, { ts, tempC: p.tempC }, band);

        if (ev.kind === 'open') {
          const dev = deviation(p.tempC, band);
          const created = await prisma.excursion.create({
            data: {
              shipmentId: p.shipmentId,
              startedAt: ev.startedAt,
              minTempC: p.tempC,
              maxTempC: p.tempC,
              severity: classify({ durationMin: 0, maxDeviationC: dev, minTempC: p.tempC }),
            },
          });
          state.openExcursionId = created.id;

          await prisma.shipment.update({
            where: { id: p.shipmentId },
            data: { excursionCount: { increment: 1 }, status: 'EXCEPTION' },
          });

          publish(p.shipmentId, {
            event: 'excursion',
            data: { id: created.id, severity: created.severity, startedAt: created.startedAt, tempC: p.tempC },
          });
          await enqueueExcursionWebhook(created.id, p.shipmentId);
          req.log.warn({ shipmentId: p.shipmentId, tempC: p.tempC, severity: created.severity }, 'excursion opened');
        } else if (ev.kind === 'update' && state.openExcursionId) {
          const cur = await prisma.excursion.findUnique({ where: { id: state.openExcursionId } });
          if (cur) {
            const minTempC = Math.min(cur.minTempC ?? p.tempC, p.tempC);
            const maxTempC = Math.max(cur.maxTempC ?? p.tempC, p.tempC);
            const durationMin = Math.round((ts.getTime() - cur.startedAt.getTime()) / 60000);
            const maxDev = Math.max(deviation(minTempC, band), deviation(maxTempC, band));
            await prisma.excursion.update({
              where: { id: cur.id },
              data: {
                minTempC,
                maxTempC,
                durationMin,
                severity: classify({ durationMin, maxDeviationC: maxDev, minTempC }),
              },
            });
          }
        } else if (ev.kind === 'close' && state.openExcursionId) {
          const cur = await prisma.excursion.findUnique({ where: { id: state.openExcursionId } });
          if (cur) {
            const durationMin = Math.round((ev.endedAt.getTime() - cur.startedAt.getTime()) / 60000);
            await prisma.excursion.update({
              where: { id: cur.id },
              data: { endedAt: ev.endedAt, durationMin },
            });
            await enqueueExcursionWebhook(cur.id, p.shipmentId);
          }
          state.openExcursionId = null;
          publish(p.shipmentId, { event: 'excursion', data: { closed: true, endedAt: ev.endedAt } });
        }
      }
    }

    // --- throttled telemetry webhook to Dhanvantari (10s, not every tick) --
    const last = lastForwardedAt.get(p.shipmentId) ?? 0;
    if (Date.now() - last >= TELEMETRY_WEBHOOK_MS) {
      lastForwardedAt.set(p.shipmentId, Date.now());
      await prisma.outboundEvent.create({
        data: {
          type: 'shipment.telemetry',
          targetUrl: `${DHANVANTARI_URL}/api/webhooks/vayu/shipment-telemetry`,
          payloadJson: {
            shipmentId: p.shipmentId,
            ts: p.ts,
            lat: p.lat,
            lng: p.lng,
            tempC: p.tempC,
            progressPct,
          },
          status: 'PENDING',
          nextRetryAt: new Date(),
        },
      });
    }

    return { ok: true };
  });
}

/**
 * The temperature band comes from the drugs in the shipment — the strictest
 * one wins, because a single consignment must satisfy every product in it.
 */
async function resolveBand(shipmentId: string): Promise<Band | null> {
  const rows = await prisma.shipmentBatch.findMany({
    where: { shipmentId },
    select: { batch: { select: { drug: { select: { minTempC: true, maxTempC: true, coldChain: true } } } } },
  });

  const bands = rows
    .map((r) => r.batch.drug)
    .filter((d) => d.coldChain && d.minTempC != null && d.maxTempC != null)
    .map((d) => ({ minTempC: d.minTempC!, maxTempC: d.maxTempC! }));

  if (bands.length === 0) return null;
  return {
    minTempC: Math.max(...bands.map((b) => b.minTempC)),
    maxTempC: Math.min(...bands.map((b) => b.maxTempC)),
  };
}

async function enqueueExcursionWebhook(excursionId: string, shipmentId: string): Promise<void> {
  const e = await prisma.excursion.findUnique({ where: { id: excursionId } });
  if (!e) return;
  await prisma.outboundEvent.create({
    data: {
      type: 'shipment.excursion',
      targetUrl: `${DHANVANTARI_URL}/api/webhooks/vayu/shipment-excursion`,
      payloadJson: {
        shipmentId,
        excursionId: e.id,
        startedAt: e.startedAt.toISOString(),
        endedAt: e.endedAt?.toISOString(),
        minTempC: e.minTempC,
        maxTempC: e.maxTempC,
        durationMin: e.durationMin,
        severity: e.severity,
      },
      status: 'PENDING',
      nextRetryAt: new Date(),
    },
  });
}

export { isOutOfBand };
