/**
 * MedTrack telemetry simulator.
 *
 * ARCHITECTURE.md §6.1, §6.2.
 *
 * Drives GPS + temperature along a route and POSTs to Vayu's
 * /api/sensors/ingest at 1-2 Hz.
 *
 * The payload shape is IDENTICAL to what an ESP32 + DS18B20 + NEO-6M sends.
 * That's the point: swapping the simulator for real hardware needs zero code
 * change on the server. Demo line — "same endpoint, same payload."
 *
 * SCAFFOLD — Phase 4.
 */

import type { SensorIngest } from '@medtrack/contracts';

export interface SimulatorOptions {
  shipmentId: string;
  /** [lng, lat] pairs along the route. */
  route: Array<[number, number]>;
  /** Wall-clock seconds for the whole run. Demo shipments run 60-120s. */
  durationSeconds: number;
  /** Target band, e.g. [2, 8] for a cold-chain product. */
  tempBandC: [number, number];
  ingestUrl: string;
  deviceId?: string;
}

/**
 * Inject a deliberate excursion — the 2:30 demo beat.
 *
 * Must last long enough to clear the hysteresis guard (>= 3 consecutive
 * readings or >= 60s) or the detector will correctly ignore it as sensor
 * noise. §6.1
 */
export interface ExcursionInjection {
  atProgressPct: number;
  peakTempC: number;
  durationSeconds: number;
}

export async function run(
  _options: SimulatorOptions,
  _injection?: ExcursionInjection,
): Promise<void> {
  // Implementation (Phase 4):
  //   1. interpolate position along `route` by elapsed fraction
  //   2. hold temp inside `tempBandC` with light noise; ramp to `peakTempC`
  //      during an injected excursion, then recover
  //   3. POST SensorIngest at 1-2 Hz
  //   4. stop at the end of the route
  throw new Error('Phase 4');
}

export type { SensorIngest };
