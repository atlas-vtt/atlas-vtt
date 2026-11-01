/** Every Atlas sound is 48 kHz; a position in frames means this rate whatever the device's. */
export const SOUND_RATE = 48_000;

export const FRAMES_PER_MS = SOUND_RATE / 1000;

export function dbToGain(db: number): number {
  return db === -Infinity ? 0 : 10 ** (db / 20);
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** How far a fade has run at `tableMs`: 0 before it begins, 1 once over. */
export function fadeProgress(at: number, ms: number, tableMs: number): number {
  if (ms <= 0) return tableMs >= at ? 1 : 0;
  return clamp01((tableMs - at) / ms);
}

/** Equal power: a fade-in and a fade-out at the same progress add up to the same power. */
export function fadeInGain(progress: number): number {
  return Math.sin((progress * Math.PI) / 2);
}

export function fadeOutGain(progress: number): number {
  return Math.cos((progress * Math.PI) / 2);
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? NaN;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? NaN) + upper) / 2;
}
