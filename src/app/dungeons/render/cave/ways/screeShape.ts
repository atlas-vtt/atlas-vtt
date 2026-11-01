import type { StairEnd } from '../../../floors/stairSpots';
import { rngFrom } from '../../../rng';
import type { PileStone } from '../../art/hand';
import { valueNoise } from '../../art/noise';
import type { Vec } from '../../geometry';
import { rubbleStone } from '../../vertical/rubble';
import { bowed, broken, wobbled } from '../../vertical/runs';
import type { WayFrame } from './narrows';

/**
 * A scree slope's lines, as surveys and Dyson Logos draw loose rock between two heights. `t` runs
 * down the slope, from its high end (0) to its foot (1), along the frame's `v`.
 *
 * - From the floor above (`upper`) the slope sinks into the floor: one edge all round it, low on its
 *   inside, from a short break at its head down both sides, across the lip of floor it runs in
 *   under at its foot, the drop growing as it goes down.
 * - From the floor below (`lower`) it comes out from under the ceiling, whose edge is dashed across
 *   its head, and stands above the floor beside it: its sides are edges low on their outside, the
 *   drop shrinking to nothing at its foot, where its stones spill out onto the floor.
 * - Between two rooms of one floor (a steps door), a break across the passage at the head and the
 *   slope down over the door's cell and the next, spilling onto the lower room's floor.
 */
export interface ScreeSlope {
  /** The frame's `v` at `t`. */
  vAt: (t: number) => number;
  /** How far the slope reaches either side of its middle at `t`, in cells; past the walls in a passage. */
  half: (t: number) => number;
  /** `upper`: the edge all round the slope, closed, its inside low. */
  ring: Vec[] | null;
  /** `lower`: the two sides, each run with its low side on `low`. */
  sides: { run: Vec[]; low: number }[];
  /** `lower`: the ceiling's edge across the head, dashed. Steps: the break the slope falls from, low side on `low`. */
  head: { run: Vec[]; low: number } | null;
  /** Where the slope's tone lies between rooms: below the break, between the passage's walls, past the foot; null where its edges bound it. */
  area: Vec[] | null;
  /** Lines across the slope, in pieces. */
  contours: Vec[][];
  /** Short wedges down the fall line, thick end uphill, thinning down the slope. */
  wedges: Vec[][];
  stones: PileStone[];
}

/** How far a slope between rooms reaches past its passage's middle: into the walls, which the floor clip cuts it at. */
const PAST_WALLS = 0.6;

/** Where the walls stand either side of the way's middle (−1, +1) at `v`, in cells (`neckFaces`). */
export type Faces = (side: number, v: number) => number;

export function screeSlope(frame: WayFrame, seed: number, end: StairEnd | undefined, faces?: Faces): ScreeSlope {
  const { at, along, across } = frame;
  const passage = end === undefined;
  // Between rooms the break lies across the door's own cell, where the walls close in on it.
  const vTop = -along / 2 + (passage ? 0.45 : 0.14);
  const vFoot = along / 2 - (end === 'upper' ? 0.16 : passage ? 0.35 : 0.1);
  const vAt = (t: number): number => vTop + (vFoot - vTop) * t;
  const n = (x: number, k: number): number => (valueNoise(x, k, seed) - 0.5) * 2;
  // A slope swells and pinches as it goes down; its head rounds off where it starts.
  const head = (t: number): number => (end === 'upper' ? 0.18 * Math.max(0, 1 - t / 0.2) ** 2 : 0);
  // A fan: narrow where it comes from, widest at its foot, its sides wandering as loose rock lies.
  const fan = (t: number): number => (across / 2 - 0.12) * (0.62 + 0.38 * t ** 0.8) - 0.07 * n(t * 2.5, 1) - 0.03 * n(t * 7, 2) - head(t);
  const half = (t: number): number => (passage ? across / 2 + PAST_WALLS : fan(t));
  const tAt = (k: number, count: number): number => k / count;
  const side = (s: number, from: number, to: number): Vec[] => Array.from({ length: 13 }, (_, k) => {
    const t = from + (to - from) * tAt(k, 12);
    return at(s * half(t), vAt(t));
  });
  let ring: Vec[] | null = null;
  const sides: ScreeSlope['sides'] = [];
  let headRun: ScreeSlope['head'] = null;
  let area: Vec[] | null = null;
  if (end === 'upper') {
    // Round the slope: down its left side, across the lip it runs in under (bowed back up the slope), up its right side, across its head.
    const lip = bowed(at(-half(1), vAt(1)), at(half(1), vAt(1)), -0.14, 10);
    const top = bowed(at(half(0), vAt(0)), at(-half(0), vAt(0)), 0.08, 8);
    ring = wobbled([...side(-1, 0, 1), ...lip.slice(1, -1), ...side(1, 1, 0), ...top.slice(1, -1)], seed + 1, 0.035, true);
  } else if (end === 'lower') {
    // Run down the slope, a side's left is towards the slope's middle on the right side, away from it on the left.
    for (const s of [-1, 1]) sides.push({ run: wobbled(side(s, 0.08, 1), seed + 2 + s, 0.035), low: -s });
    headRun = { run: wobbled(bowed(at(-half(0) - 0.05, vAt(0.06)), at(half(0) + 0.05, vAt(0.06)), -0.1, 10), seed + 4, 0.03), low: 1 };
  } else {
    const tilt = 0.12 * n(3.3, 5);
    // From wall to wall: a little into the rock either side, which the floor clip cuts it at.
    const reach = (s: number): number => (faces ? faces(s, vAt(0) + s * tilt) + 0.08 : half(0));
    // Across from −u to +u its left is down the slope: the low side.
    headRun = { run: wobbled(bowed(at(-reach(-1), vAt(0) - tilt), at(reach(1), vAt(0) + tilt), 0.12, 12), seed + 4, 0.035), low: 1 };
    // Between the walls the passage has at each step down, never a box: no wider than the passage past its walls.
    const wall = (side: number, t: number): number => Math.min(faces ? faces(side, vAt(t)) + 0.06 : across / 2, across / 2 * (0.7 + 0.3 * t) + 0.08 * n(t * 3, side * 4 + 9));
    const steps = Array.from({ length: 9 }, (_, k) => 0.05 + k * 0.13);
    area = wobbled([...headRun.run, ...steps.map(t => at(wall(1, t), vAt(t))), ...steps.slice().reverse().map(t => at(-wall(-1, t), vAt(t)))], seed + 6, 0.05, true);
  }
  return { vAt, half, ring, sides, head: headRun, area, ...surface(frame, vAt, half, seed, end) };
}

/** The slope's own marks: contours closer where it is steeper (high up), wedges thinning down it, stones growing down it. */
function surface(frame: WayFrame, vAt: (t: number) => number, half: (t: number) => number, seed: number, end: StairEnd | undefined): Pick<ScreeSlope, 'contours' | 'wedges' | 'stones'> {
  const { at, along } = frame;
  const rng = rngFrom(seed);
  const length = vAt(1) - vAt(0);
  const reach = (t: number): number => Math.min(half(t), frame.across / 2 + 0.2);
  // Contours: a scree's profile is steepest at its head, so they start 0.22 cells apart and open to 0.4.
  const contours: Vec[][] = [];
  for (let d = 0.16; d < length - 0.12; d += 0.22 + 0.18 * (d / length)) {
    const t = d / length;
    const w = reach(t) - 0.06;
    // Each broken into two to four pieces, as a surveyor's gradient line is.
    if (w > 0.1) contours.push(...broken(bowed(at(-w, vAt(t)), at(w, vAt(t)), 0.06 + 0.04 * rng(), 8), seed + contours.length, 0.72, 2.6));
  }
  // Wedges, six to ten a square cell near the head and fewer down the slope.
  const wedges: Vec[][] = [];
  const count = Math.round(length * reach(0.5) * 2 * 9);
  for (let i = 0; i < count; i++) {
    const t = Math.min(0.85, 0.05 + 0.8 * rng() ** 1.6);
    const u = (rng() * 2 - 1) * (reach(t) - 0.08);
    const len = 0.09 + 0.08 * rng() * (1 - t);
    const p = at(u, vAt(t));
    const tip = at(u + (rng() - 0.5) * 0.02, vAt(t) + len);
    const across = { x: (at(1, 0).x - at(0, 0).x) * 0.016, y: (at(1, 0).y - at(0, 0).y) * 0.016 };
    wedges.push([{ x: p.x - across.x, y: p.y - across.y }, { x: p.x + across.x, y: p.y + across.y }, tip]);
  }
  // Stones: grit high up, angular blocks at the foot, the largest farthest; from below they fan out onto the floor.
  const stones: PileStone[] = [];
  const top = end === 'upper' ? 0.9 : 1;
  for (let i = 0; i < Math.round(length * 6); i++) {
    const t = 0.15 + (top - 0.15) * Math.sqrt(rng());
    const r = 0.014 + 0.05 * t ** 2 * (0.6 + 0.6 * rng());
    stones.push(rubbleStone(rng, at((rng() * 2 - 1) * (reach(t) - r - 0.05), vAt(t)), r));
  }
  if (end !== 'upper') {
    // The apron: a ragged fan past the foot, never more than a cell onto the floor, never wider than the slope.
    const foot = vAt(1);
    const room = Math.min(1, along / 2 + 1 - foot);
    for (let i = 0; i < 7; i++) {
      // Gravity sorts them: the two largest rolled farthest.
      const d = room * (i < 2 ? 0.55 + 0.3 * rng() : 0.1 + 0.75 * rng() ** 1.4);
      const r = 0.025 + 0.05 * (d / room) * rng() + (i < 2 ? 0.07 : 0);
      stones.push(rubbleStone(rng, at((rng() * 2 - 1) * (reach(1) - r) * (0.6 + 0.4 * d / room), foot + d - room * 0.15), r));
    }
  }
  return { contours, wedges, stones };
}

/** What the slope covers on the floor: its ring from above, its tone's area between rooms, else between its two sides. */
export function slopeArea(slope: ScreeSlope): Vec[] {
  if (slope.ring) return slope.ring;
  if (slope.area) return slope.area;
  return [...slope.sides[0]!.run, ...slope.sides[1]!.run.slice().reverse()];
}
