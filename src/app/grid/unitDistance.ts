/**
 * The distance one grid cell spans, in game units: what counts as one wherever it is stored or
 * typed (a collection's or a preset's distance per square, a scene's distance per cell).
 */

/** Below a millionth JavaScript writes a number as a power of ten ("1e-7"), which no field reads back. */
export const MIN_UNIT_DISTANCE = 0.000001;
/** Far beyond any map, and short enough to be written out in full. */
export const MAX_UNIT_DISTANCE = 1_000_000;

const DECIMAL = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/** Whether `value` is a distance a cell can span: a number a field can show and read back. */
export function isUnitDistance(value: unknown): value is number {
  return typeof value === 'number' && value >= MIN_UNIT_DISTANCE && value <= MAX_UNIT_DISTANCE;
}

/**
 * What a distance field holds: `undefined` when empty, null when it is no distance.
 * A comma and a point are both the decimal sign, whatever the system writes.
 */
export function typedDistance(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (!DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return isUnitDistance(value) ? value : null;
}
