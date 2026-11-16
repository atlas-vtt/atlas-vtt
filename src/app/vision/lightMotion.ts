/**
 * How long a light keeps its place before it counts as at rest, in ms: longer than the gaps
 * between a drag's steps, a glide's frames and a key held down, so it rests only when its
 * mover stops.
 */
export const LIGHT_REST_MS = 150;

/** No light moving: what `note` returns then, and what callers without a `LightMotion` pass on. */
export const NO_MOVING_LIGHTS: ReadonlySet<string> = new Set();

/**
 * Which lights are moving: those whose place changed less than `LIGHT_REST_MS` ago (a carried
 * light whose token is dragged or glides, a placed light being dragged). While a light moves,
 * what only makes it look finer waits for it to rest (its soft shadows, the bounce; its
 * reflection does not wait, as it showed up late with a flicker), so each frame of the move costs little and the light is drawn where its token is;
 * once it rests (`restsAt`), it is worked out whole. A light seen for the first time is at rest.
 */
export class LightMotion {
  private readonly places = new Map<string, { x: number; y: number; movedAt: number }>();
  private rest: number | null = null;

  /** Notes where `lights` stand at `now` (ms) and returns the keys of those moving. */
  note(lights: readonly { key: string; x: number; y: number }[], now: number): ReadonlySet<string> {
    let moving: Set<string> | null = null;
    let rest: number | null = null;
    const seen = new Set<string>();
    for (const { key, x, y } of lights) {
      seen.add(key);
      let place = this.places.get(key);
      if (!place) {
        this.places.set(key, { x, y, movedAt: -Infinity });
        continue;
      }
      if (place.x !== x || place.y !== y) {
        place = { x, y, movedAt: now };
        this.places.set(key, place);
      }
      const restsAt = place.movedAt + LIGHT_REST_MS;
      if (now >= restsAt) continue;
      (moving ??= new Set()).add(key);
      rest = Math.min(rest ?? restsAt, restsAt);
    }
    for (const key of this.places.keys()) if (!seen.has(key)) this.places.delete(key);
    this.rest = rest;
    return moving ?? NO_MOVING_LIGHTS;
  }

  /** When the first of the lights moving at the last `note` comes to rest, unless it moves again; null when none was moving. */
  restsAt(): number | null {
    return this.rest;
  }

  /** Forgets every place: the next lights noted are at rest. */
  clear(): void {
    this.places.clear();
    this.rest = null;
  }
}
