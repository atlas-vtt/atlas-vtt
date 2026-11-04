import type { CellPoint } from '../model';
import type { Rng } from '../rng';
import { fractalNoise } from '../water/noise';

/**
 * A river's middle line as rivers lie on the ground. Its heading swings as a sine-generated curve
 * (Langbein and Leopold: the direction, not the position, follows a sine of the distance along the
 * channel), while it steers for the places it must pass. Real rivers are never one regular snake:
 * each half bend is longer or shorter than the last, the swing grows and dies away along the
 * course (a straight reach, then a run of loops), and a river as a whole may barely wander or
 * meander hard (`Winding.swing`). A bend comes back about every `BEND_WIDTHS` widths along the
 * channel and is never tighter than `TIGHTEST_RADIUS` widths, the bends of real rivers lying at
 * two to three; so its banks, half a width out, never fold over each other.
 */

type Vec = CellPoint;

/** The distance along the channel from one bend to the next of the same side and back, in widths, on average. */
const BEND_WIDTHS = 15;
/** The tightest a bend may turn, as its radius in widths. */
const TIGHTEST_RADIUS = 1.6;
/** The spacing of the line's points, in cells. */
export const COURSE_STEP = 0.25;
/** How fast the heading turns towards where it should go, per step. */
const STEER = 0.22;
/** A way counts as reached this near, in cells. */
const REACHED = 1;
/** How many half bends the swing takes to grow or die away along the course. */
const SWELL_BENDS = 2.5;

/** How a river winds: its width and the swing of its heading at a bend's crossing, in radians (0 runs straight; real meanders swing 1 to 1.7). */
export interface Winding {
  width: number;
  swing: number;
}

/**
 * The line from `ways[0]` through every way to the last, `start` the heading it leaves with
 * (radians; unset, towards the next way).
 */
export function riverCourse(ways: readonly Vec[], winding: Winding, rng: Rng, start?: number): Vec[] {
  const { width, swing } = winding;
  const half = (BEND_WIDTHS * Math.max(width, 0.8)) / 2;
  const tightest = 1 / (TIGHTEST_RADIUS * Math.max(width, 0.6));
  // Each half bend its own length and swing.
  const lengths = Array.from({ length: 128 }, () => 0.65 + rng() * 0.75);
  const swings = Array.from({ length: 128 }, () => 0.6 + rng() * 0.8);
  // How much of the swing a stretch of the course has: from a straight reach to full loops.
  const swell = fractalNoise(rng, 2, 0.5, half * SWELL_BENDS);
  let phase = rng() * Math.PI * 2;
  let p = { ...ways[0]! };
  let heading = start ?? Math.atan2(ways[1]!.y - p.y, ways[1]!.x - p.x);
  let next = 1;
  let s = 0;
  const line: Vec[] = [p];
  const limit = 20 * ways.reduce((sum, w, i) => sum + (i ? Math.hypot(w.x - ways[i - 1]!.x, w.y - ways[i - 1]!.y) : 0), 0) / COURSE_STEP;
  while (next < ways.length && line.length < limit) {
    const target = ways[next]!;
    const toward = Math.atan2(target.y - p.y, target.x - p.x);
    const bend = Math.floor(phase / Math.PI) & 127;
    // Never quite straight: a calm reach still wanders a little.
    const strength = Math.max(0.3, Math.min(1, 0.6 + 1.4 * swell(s, 0.37)));
    // The swing fades near a way it must reach, so it reaches it rather than circling it.
    const near = Math.min(1, Math.hypot(target.x - p.x, target.y - p.y) / (half * 0.7));
    const wanted = toward + Math.sin(phase) * swing * swings[bend]! * strength * near;
    const turn = Math.max(-tightest * COURSE_STEP, Math.min(tightest * COURSE_STEP, wrapped(wanted - heading) * STEER));
    heading += turn;
    p = { x: p.x + Math.cos(heading) * COURSE_STEP, y: p.y + Math.sin(heading) * COURSE_STEP };
    s += COURSE_STEP;
    phase += (Math.PI * COURSE_STEP) / (half * lengths[bend]!);
    line.push(p);
    if (Math.hypot(target.x - p.x, target.y - p.y) < REACHED) next += 1;
  }
  return line;
}

function wrapped(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
