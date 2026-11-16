/**
 * How liquid surfaces move over time, without the numbers ever growing: every pattern the shader
 * draws repeats every `PATTERN_TILE` cells, every pulse completes whole cycles in `MOTION_LOOP`
 * seconds, and the drifts are worked out here in double precision and handed over wrapped. So a map
 * left playing for days moves as smoothly as in its first minute, and a wrap shows no seam.
 */

import type { LiquidKind } from '../../types/liquidTypes';
import { animationFrameDue, slotsOf } from '../utils/animationFrames';

/** Seconds after which the shader's clock starts again; every pulse of a pattern completes whole cycles in it. */
export const MOTION_LOOP = 4096;
/** Cells after which every pattern repeats, so a drift may wrap by it unseen. */
export const PATTERN_TILE = 64;
/** At most this many frames a second while a surface moves: liquids move slowly and every frame is a render. */
export const LIQUID_FPS = 30;

/** One pattern's drift: cells per second along the surface's frame (its flow, or the map's axes). */
interface Drift { across: number; along: number }

/**
 * The four drifts each kind's shader reads (`uDriftA.xy`, `.zw`, `uDriftB.xy`, `.zw`), as it names
 * them there. In a flowing surface's frame `along` is downstream; a still one drifts in place.
 */
const DRIFTS: Readonly<Record<LiquidKind, { flowing: readonly Drift[]; still: readonly Drift[] }>> = {
  water: {
    // The body drifting downstream, the ripples at Saver (above it the shader carries them at the
    // current's own speed), glints riding the current, unused.
    flowing: [{ across: 0, along: 0.24 }, { across: 0, along: 0.28 }, { across: 0, along: 0.26 }, { across: 0, along: 0 }],
    // A breath of air over still water: its body and glints sway; the flow noise does the rest.
    still: [{ across: 0.012, along: 0.007 }, { across: 0, along: 0 }, { across: 0.012, along: 0.007 }, { across: 0, along: 0 }],
  },
  lava: {
    // Churn, plates, heat, fine crust grain: everything molten creeps.
    flowing: [{ across: 0.01, along: 0.035 }, { across: 0, along: 0.05 }, { across: -0.012, along: 0.03 }, { across: 0, along: 0.05 }],
    still: [{ across: 0.012, along: 0.008 }, { across: -0.006, along: 0.01 }, { across: 0.01, along: -0.012 }, { across: -0.006, along: 0.01 }],
  },
  acid: {
    // Slow pigment drift, unused, bubbles creeping downstream, unused.
    flowing: [{ across: 0.006, along: 0.024 }, { across: -0.02, along: 0.2 }, { across: 0, along: 0.012 }, { across: 0, along: 0 }],
    still: [{ across: 0.008, along: 0.005 }, { across: -0.025, along: 0.03 }, { across: 0, along: 0 }, { across: 0, along: 0 }],
  },
};

const wrap = (value: number, period: number): number => value - Math.floor(value / period) * period;

/** The shader's clock at `seconds` of motion. */
export function loopTime(seconds: number): number {
  return wrap(seconds, MOTION_LOOP);
}

/** The drifts of a surface of `kind` at `seconds` of motion, eight numbers in its frame, each wrapped to `PATTERN_TILE`. */
export function liquidDrifts(kind: LiquidKind, flowing: boolean, seconds: number, into: Float32Array = new Float32Array(8)): Float32Array {
  const drifts = DRIFTS[kind][flowing ? 'flowing' : 'still'];
  drifts.forEach((drift, index) => {
    into[index * 2] = wrap(drift.across * seconds, PATTERN_TILE);
    into[index * 2 + 1] = wrap(drift.along * seconds, PATTERN_TILE);
  });
  return into;
}

/**
 * Whether a new frame is due `now` (ms) after the last one shown at `last`: at most `fps`
 * (`LIQUID_FPS` unless less is asked for) a second, on the map's animation clock
 * (`animationFrameDue`), so a liquid's frame shares its render with a flickering light's.
 */
export function liquidFrameDue(now: number, last: number | null, fps = LIQUID_FPS): boolean {
  return animationFrameDue(now, last, slotsOf(1000 / fps));
}
