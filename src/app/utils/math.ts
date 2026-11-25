/** `value` within `min` and `max`; where the two cross, `min`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The value `t` of the way from `from` to `to`: `from` at 0, `to` at 1. */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
