/**
 * How an area's effect moves over time, on the liquids' rules (`liquids/liquidMotion.ts`): the
 * shader's clock arrives wrapped to `MOTION_LOOP`, every drift is worked out here in doubles and
 * handed over wrapped to `PATTERN_TILE`, and frames fall on the map's one animation clock, so an
 * effect shares its render with a liquid's and a flickering light's.
 */

import type { MeasureEffect } from '../../../measure/measureEffects';
import { liquidFrameDue, PATTERN_TILE } from '../../liquids/liquidMotion';

/** One pattern's drift over the map, cells a second; up the screen is the way flames rise. */
interface Drift { x: number; y: number }

/** The four drifts each look's shader reads (`uDriftA.xy`, `.zw`, `uDriftB.xy`, `.zw`), as it names them there. */
const DRIFTS: Readonly<Record<MeasureEffect, readonly [Drift, Drift, Drift, Drift]>> = {
  // The fire's body and tongues (each at a part of it), unused, the turbulence that bends them, embers.
  fire: [{ x: 0, y: -0.32 }, { x: 0, y: -0.66 }, { x: 0.03, y: -0.13 }, { x: 0.02, y: -0.45 }],
  // The breath that moves where the frost lies thick, the mist over it; the needles lie still.
  frost: [{ x: 0.022, y: 0.012 }, { x: -0.015, y: 0.02 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  // The charged haze.
  lightning: [{ x: 0.03, y: -0.02 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  // Two banks of fog crossing, and the slow field that rolls them.
  mist: [{ x: 0.085, y: 0.028 }, { x: -0.05, y: 0.07 }, { x: 0.03, y: -0.06 }, { x: 0, y: 0 }],
  // Motes; the rays turn by the clock.
  radiance: [{ x: 0.012, y: -0.03 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  // The field that curls it, the dark itself, its finer wisps.
  shadow: [{ x: 0.045, y: 0.06 }, { x: -0.06, y: 0.02 }, { x: 0.05, y: -0.09 }, { x: 0, y: 0 }],
};

/** The moment an effect shows while nothing moves (maps not animated, reduced motion): past every look's first seconds. */
export const EFFECT_STILL_SECONDS = 23.4;

/** The longest step the clock takes between two frames: a stalled window resumes where it was. */
const MAX_STEP_MS = 100;

const wrap = (value: number, period: number): number => value - Math.floor(value / period) * period;

/** The drifts of `effect` at `seconds` of motion, eight numbers, each wrapped to `PATTERN_TILE`. */
export function effectDrifts(effect: MeasureEffect, seconds: number, into: Float32Array = new Float32Array(8)): Float32Array {
  DRIFTS[effect].forEach((drift, index) => {
    into[index * 2] = wrap(drift.x * seconds, PATTERN_TILE);
    into[index * 2 + 1] = wrap(drift.y * seconds, PATTERN_TILE);
  });
  return into;
}

/**
 * The clock every effect of a view moves by. Its owner calls `tick` once a display frame while
 * effects play and are in view; when it answers true a frame is due: set `seconds` on every mesh
 * (`MeasureEffectMesh.setTime`) and ask for one render. While they are still or out of view it
 * calls `hold`, and the next tick goes on from the moment shown.
 */
export class EffectClock {
  private elapsed = 0;
  private lastTick: number | null = null;
  private lastFrame: number | null = null;

  /** Seconds of motion so far. */
  get seconds(): number {
    return this.elapsed;
  }

  /**
   * Moves the clock on to `now` (the display frame's time in ms, `frameTime(ticker)`) and says
   * whether a frame is due at `fps` frames a second (30 / 15 / 10 by quality; 0 holds the picture).
   */
  tick(now: number, fps: number): boolean {
    if (this.lastTick !== null) this.elapsed += Math.min(Math.max(now - this.lastTick, 0), MAX_STEP_MS) / 1000;
    this.lastTick = now;
    if (!(fps > 0) || !liquidFrameDue(now, this.lastFrame, fps)) return false;
    this.lastFrame = now;
    return true;
  }

  /** Holds the moment shown: time that passes until the next tick is not counted. */
  hold(): void {
    this.lastTick = null;
    this.lastFrame = null;
  }
}
