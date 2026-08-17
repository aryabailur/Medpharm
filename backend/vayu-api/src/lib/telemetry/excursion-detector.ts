/**
 * Cold-chain excursion detection.
 *
 * ARCHITECTURE.md §6.1. README §8 (non-negotiable). Part 2.
 *
 * HYSTERESIS, NOT A BARE THRESHOLD. "A single stray reading at 8.1 °C is sensor
 * noise, not a spoiled vaccine." An excursion opens only after the reading has
 * been out of band for >= 3 consecutive readings OR >= 60 seconds, and closes
 * only after 3 consecutive readings back in band.
 *
 * This logic lives ONLY here. Dhanvantari never recomputes it — it receives the
 * result over the webhook contract (§5.1).
 */

export type Severity = 'MINOR' | 'MAJOR' | 'CRITICAL';

export interface Band {
  minTempC: number;
  maxTempC: number;
}

export interface Reading {
  ts: Date;
  tempC: number;
}

/** Consecutive readings required to open or close an excursion. */
export const CONSECUTIVE_THRESHOLD = 3;
/** Or this long out of band, whichever comes first. */
export const DURATION_THRESHOLD_MS = 60_000;

export function isOutOfBand(tempC: number, band: Band): boolean {
  return tempC < band.minTempC || tempC > band.maxTempC;
}

/** How far outside the band, in °C. Zero when in band. */
export function deviation(tempC: number, band: Band): number {
  if (tempC > band.maxTempC) return tempC - band.maxTempC;
  if (tempC < band.minTempC) return band.minTempC - tempC;
  return 0;
}

/**
 * Classify an excursion (§6.1).
 *
 * Freezing is special-cased: any reading below 0 °C is CRITICAL regardless of
 * duration. Freezing destroys most vaccines and is worse than mild warming —
 * a detail worth stating on stage.
 */
export function classify(params: {
  durationMin: number;
  maxDeviationC: number;
  minTempC: number;
}): Severity {
  if (params.minTempC < 0) return 'CRITICAL';
  if (params.durationMin > 60 || params.maxDeviationC > 5) return 'CRITICAL';
  if (params.durationMin >= 15 || params.maxDeviationC >= 2) return 'MAJOR';
  return 'MINOR';
}

/**
 * Rolling state for one shipment. The caller persists `openExcursionId` so
 * detection survives a restart.
 */
export interface DetectorState {
  /** Consecutive out-of-band readings not yet promoted to an excursion. */
  pendingOutOfBand: Reading[];
  /** Consecutive in-band readings while an excursion is open. */
  pendingRecovery: number;
  openExcursionId: string | null;
}

export function initialState(openExcursionId: string | null = null): DetectorState {
  return { pendingOutOfBand: [], pendingRecovery: 0, openExcursionId };
}

export type DetectorEvent =
  | { kind: 'none' }
  | { kind: 'open'; startedAt: Date; tempC: number }
  | { kind: 'update'; tempC: number }
  | { kind: 'close'; endedAt: Date };

/**
 * Feed one reading. Returns what the caller should persist.
 *
 * Pure and synchronous — no DB, no clock. That makes the hysteresis rules
 * directly testable, which matters because they are easy to get subtly wrong.
 */
export function step(state: DetectorState, reading: Reading, band: Band): DetectorEvent {
  const out = isOutOfBand(reading.tempC, band);

  if (state.openExcursionId) {
    if (out) {
      state.pendingRecovery = 0;
      return { kind: 'update', tempC: reading.tempC };
    }
    state.pendingRecovery += 1;
    if (state.pendingRecovery >= CONSECUTIVE_THRESHOLD) {
      state.pendingRecovery = 0;
      state.pendingOutOfBand = [];
      return { kind: 'close', endedAt: reading.ts };
    }
    return { kind: 'none' };
  }

  if (!out) {
    state.pendingOutOfBand = [];
    return { kind: 'none' };
  }

  state.pendingOutOfBand.push(reading);
  const first = state.pendingOutOfBand[0]!;
  const spanMs = reading.ts.getTime() - first.ts.getTime();

  if (state.pendingOutOfBand.length >= CONSECUTIVE_THRESHOLD || spanMs >= DURATION_THRESHOLD_MS) {
    // Backdate to the first out-of-band reading — the excursion began then,
    // not when we became confident about it.
    const startedAt = first.ts;
    state.pendingOutOfBand = [];
    return { kind: 'open', startedAt, tempC: reading.tempC };
  }

  return { kind: 'none' };
}
