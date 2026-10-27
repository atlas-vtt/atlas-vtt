import type { StairEnd } from '../../../floors/stairSpots';
import { rngFrom } from '../../../rng';
import type { PileStone } from '../../art/hand';
import { valueNoise } from '../../art/noise';
import type { Vec } from '../../geometry';
import { chiselled, stoneOutline } from '../../terrain/stones';
import type { WayFrame } from './narrows';

/**
 * A scree slope as a cutting into the rock: a ramp of loose stone between two rock faces. From the
 * floor above (`upper`) the cutting starts level with the floor at the near end and sinks: its faces
 * widen as the floor drops away beside the ramp, until the ramp runs in under a brow of rock into
 * the dark. From the floor below (`lower`) the same slope comes down out of a dark opening under the
 * ceiling, raised between faces that sink to nothing as it reaches the floor at its foot. Between
 * rooms of one floor (no end) the cutting sinks to the lower room and stays open at its foot.
 * `t` runs from the slope's high end (0) to its low end (1), whichever way the floor shown sees it.
 */
export interface ScreeShape {
  /** The ramp's walkable surface, its mouth included. */
  ramp: Vec[];
  /** Each face as a polygon, and which side of the ramp it lies on (−1, +1 of `u`). */
  faces: { poly: Vec[]; side: number }[];
  /** The faces' outer edges, where the floor breaks off (`upper`) or the raised ramp meets the floor (`lower`). */
  rims: Vec[][];
  /** The ramp's edges, at the foot of each face. */
  edges: Vec[][];
  /** Where the cutting leaves the floor at its high end: a ragged edge from one rim to the other, in broken runs (none on the floor below, where the high end is the opening). */
  head: Vec[][];
  /** The brow of rock the ramp runs in under (`upper`), or the ceiling's edge it comes out from (`lower`); none between rooms. */
  brow: Vec[] | null;
  /** The brow's rock, an irregular arch of the cave's own rock over the mouth (`upper` only). */
  browRock: Vec[] | null;
  /** Cracks across the brow's rock. */
  browCracks: Vec[][];
  /** The middle of the cutting's deep end and how far its hollow reaches across and along, for depth that follows its form. */
  hollow: { at: Vec; across: number; along: number };
  /** The dark opening under the ceiling the slope comes out of, between the brow and the stairwell's end (`lower` only). */
  opening: Vec[] | null;
  /** The frame's `v` at `t`. */
  vAt: (t: number) => number;
  /** The cutting's whole outline, rims and brow: where its depth is laid. */
  outline: Vec[];
  /** Half the ramp's width at `t`. */
  halfRamp: (t: number) => number;
  stones: PileStone[];
}

const N = 16;

export function screeShape(frame: WayFrame, seed: number, end?: StairEnd): ScreeShape {
  const { at, along, across } = frame;
  const lower = end === 'lower';
  const upper = end === 'upper';
  // The ramp runs from the stairwell's near end to its far end; on the floor above, it stops at the brow.
  const brow = upper ? Math.min(0.24, along * 0.1) : 0;
  const vHigh = -along / 2 + (lower ? Math.min(0.4, along * 0.18) : 0.04);
  const vLow = along / 2 - 0.05 - brow;
  const vAt = (t: number): number => vHigh + (vLow - vHigh) * t;
  // The rims are natural rock: the cutting's width swells and pinches along the way, its rims break
  // in short runs, its high end rounds off and its mouth narrows as a cave's does.
  const n = (x: number, y: number): number => (valueNoise(x, y, seed) - 0.5) * 2;
  const rounded = (t: number): number => {
    const head = lower ? 0 : 0.2 * Math.max(0, 1 - t / 0.16) ** 2;
    const mouth = upper ? 0.14 * Math.max(0, (t - 0.82) / 0.18) ** 1.5 : lower ? 0.08 * Math.max(0, 1 - t / 0.12) : 0;
    return head + mouth;
  };
  const rimAt = (t: number, side: number): number => across / 2 - 0.1 - 0.06 * n(t * 2.3, side * 3) - 0.035 * n(t * 8, side * 7) - 0.015 * n(t * 21, side * 5) - rounded(t) * across / 2;
  // Worked out once at each of the N + 1 steps along the way, and read between them.
  const rims_ = [-1, 1].map(side => Array.from({ length: N + 1 }, (_, i) => rimAt(i / N, side)));
  const rim = (t: number, side: number): number => {
    const table = rims_[side < 0 ? 0 : 1]!;
    const f = Math.max(0, Math.min(N, t * N));
    const i = Math.min(N - 1, Math.floor(f));
    return table[i]! + (table[i + 1]! - table[i]!) * (f - i);
  };
  // The faces show the drop beside the ramp: nothing where the ramp is level with the floor, widening with depth.
  const depth = (t: number): number => (lower ? 1 - t : t);
  // A short slope drops less, so its faces stay narrower.
  const drop = Math.min(1, along / 2.5);
  const face = (t: number): number => Math.min(across * 0.27, 0.02 + 0.3 * drop * depth(t) ** 1.15);
  const halfRamp = (t: number): number => Math.min(rim(t, 1), rim(t, -1)) - face(t);
  const ts = Array.from({ length: N + 1 }, (_, i) => i / N);
  const edge = (side: number, inner: boolean): Vec[] => ts.map(t => {
    const r = rim(t, side);
    // The face's foot wanders and is ledged: it steps in and out as the rock broke.
    const w = inner ? r - face(t) * (0.8 + 0.3 * n(t * 5, side * 5 + 1) + 0.15 * n(t * 15, side * 9 + 2)) : r;
    return at(side * w, vAt(t));
  });
  const rims = [-1, 1].map(side => edge(side, false));
  const edges = [-1, 1].map(side => edge(side, true));
  const faces = [0, 1].map(k => ({ poly: [...rims[k]!, ...edges[k]!.slice().reverse()], side: k ? 1 : -1 }));
  // The brow: an irregular arch of broken rock across the ramp's end, from one rim to the other.
  let browLine: Vec[] | null = null;
  let browRock: Vec[] | null = null;
  const browCracks: Vec[][] = [];
  let opening: Vec[] | null = null;
  if (upper || lower) {
    const t = lower ? 0 : 1;
    const v = vAt(t);
    const [l, r] = [rim(t, -1), rim(t, 1)];
    const sign = lower ? -1 : 1;
    browLine = Array.from({ length: 13 }, (_, i) => {
      const s = i / 12;
      const u = -l + (l + r) * s;
      // Bowed back over the ramp in the middle, its edge broken as the cave wall's is.
      const arch = Math.sin(Math.PI * s);
      return at(u, v - sign * (0.17 * arch ** 0.7 - 0.02) + 0.06 * n(i * 0.8, 9) * arch);
    });
    if (upper) {
      // The rock over the mouth: from the arch to the stairwell's end, thicker where it bows.
      const end = along / 2 - 0.03;
      const back = browLine.map((p, i) => {
        const s = i / 12;
        const u = -l * 1.25 + (l + r) * 1.25 * s;
        // As thick as the room behind the mouth allows, varying, so its back edge breaks like the front.
        const room = Math.max(0.04, end - v);
        return at(u, v + Math.min(room, 0.18) * (0.45 + 0.55 * Math.sin(Math.PI * s)) * (0.8 + 0.2 * n(i * 2.9, 13)));
      });
      // Two cracks across the rock, from its front edge back, as the cave wall's rock is broken.
      for (const k of [3, 8]) {
        const a = browLine[k]!;
        const b = back[k + (n(k, 19) > 0 ? 1 : -1)]!;
        browCracks.push([a, { x: (a.x + b.x) / 2 + 0.015 * n(k, 21), y: (a.y + b.y) / 2 + 0.015 * n(k, 23) }, { x: a.x + (b.x - a.x) * 0.8, y: a.y + (b.y - a.y) * 0.8 }]);
      }
      browRock = chiselled([...browLine, ...back.reverse()], seed + 6, 0.02);
    } else {
      // An arch of dark under the ceiling: from the brow back towards the stairwell's end, rounded and broken.
      const deep = vHigh - (-along / 2 + 0.03);
      const back = Array.from({ length: 13 }, (_, i) => {
        const s = 1 - i / 12 * 2;
        const u = s > 0 ? s * r : s * l;
        return at(u * (0.9 - 0.12 * s * s), v - deep * Math.sqrt(Math.max(0, 1 - s * s * 0.85)) * (0.88 + 0.12 * n(i * 0.9, 4)));
      });
      opening = chiselled([...browLine, ...back], seed + 4, 0.025);
    }
  }
  // The ragged head where the cutting leaves the floor, bowed back towards the higher ground, in broken runs.
  const head: Vec[][] = [];
  if (!lower) {
    const [l, r] = [rim(0, -1), rim(0, 1)];
    const line = Array.from({ length: 11 }, (_, i) => {
      const s = i / 10;
      return at(-l + (l + r) * s, vAt(0) - 0.06 * Math.sin(Math.PI * s) + 0.03 * n(i * 2.1, 15));
    });
    let run: Vec[] = [];
    line.forEach((p, i) => {
      run.push(p);
      if (n(i * 3.7, 17) > 0.45 && run.length > 1) { head.push(run); run = []; }
    });
    if (run.length > 1) head.push(run);
  }
  // The depth's ellipse: centred past the deep end, as wide as the cutting, so all along the brow it is dark
  // and its contours bow up the ramp's middle.
  const length = vLow - vHigh;
  const hollow = { at: at(0, lower ? vHigh - 0.12 : vLow + 0.18), across: across * 0.9, along: length * (end ? 1.05 : 0.95) };
  const left = edges[0]!;
  const right = edges[1]!;
  // Round the ramp: down its left edge, across under the brow at its low end (`upper`), up its right
  // edge, and across the ceiling's edge at its high end (`lower`).
  const ramp = [...left, ...(upper && browLine ? browLine : []), ...right.slice().reverse(), ...(lower && browLine ? browLine.slice().reverse() : [])];
  const outline = [...rims[0]!, ...(upper && browLine ? browLine : []), ...rims[1]!.slice().reverse(), ...(lower && browLine ? browLine.slice().reverse() : [])];
  return { ramp, faces, rims, edges, head, brow: browLine, browRock, browCracks, hollow, opening, outline, vAt, halfRamp, stones: stonesOf(frame, vAt, halfRamp, end, seed) };
}

/**
 * Stones lying in rows across the slope, along its contours, as scree settles: few and small near
 * its high end, cobbles and boulders low down, where they gather; from the floor below they spill
 * out past the ramp's foot onto the floor.
 */
function stonesOf(frame: WayFrame, vAt: (t: number) => number, half: (t: number) => number, end: StairEnd | undefined, seed: number): PileStone[] {
  const { at, along } = frame;
  const rng = rngFrom(seed);
  const stones: PileStone[] = [];
  // The low end lies at t = 1 everywhere; rows closer together down the slope, where the stones gather.
  const rows = Math.max(3, Math.round(along * 1.0));
  for (let k = 0; k < rows; k++) {
    // On the floor above, rows stop where the mouth's dark would swallow them.
    const t = 0.1 + (end === 'upper' ? 0.76 : 0.88) * Math.sqrt((k + 0.4 * rng()) / rows);
    // Below the size that shows facets (the boulders added after are the few that do).
    const r0 = 0.026 + 0.03 * t ** 1.4;
    const w = half(Math.min(1, t)) - r0 - 0.02;
    if (w <= 0) continue;
    const count = Math.max(1, Math.round(w * 2 / (r0 * 3.2 + 0.05)));
    const shift = rng();
    for (let i = 0; i < count; i++) {
      // A row is never full: stones lie in its runs, with gaps between.
      if (rng() < 0.45) continue;
      const r = Math.min(0.056, r0 * (0.7 + 0.6 * rng()));
      const slot = (i + shift + (rng() - 0.5) * 0.9 + count) % count;
      const u = (slot / count * 2 - 1) * w;
      // Each row wanders along the slope, as a contour does.
      const c = at(u, vAt(t) + 0.1 * (valueNoise(u * 3, k, seed) - 0.5) + (rng() - 0.5) * 0.05);
      stones.push({ poly: stoneOutline(rng, c, r), c, r });
    }
  }
  // A few boulders low on the slope, the stones that rolled farthest, faceted where the look models them.
  for (let i = 0; i < 2; i++) {
    const t = end === 'lower' ? 0.8 + 0.15 * rng() : 0.58 + 0.2 * rng();
    const r = 0.068 + 0.03 * rng();
    const c = at(((i + 0.5) / 2 * 2 - 1) * Math.max(0, half(t) - r - 0.03) + (rng() - 0.5) * 0.08, vAt(t));
    stones.push({ poly: stoneOutline(rng, c, r), c, r });
  }
  if (end === 'lower') {
    // Spilled past the foot onto the floor below.
    for (let i = 0; i < 4; i++) {
      const r = 0.035 + 0.04 * rng();
      const c = at((rng() * 2 - 1) * half(1) * 0.9, Math.min(along / 2 - r - 0.02, vAt(1) + 0.02 + 0.06 * rng()));
      stones.push({ poly: stoneOutline(rng, c, r), c, r });
    }
  }
  return stones;
}
