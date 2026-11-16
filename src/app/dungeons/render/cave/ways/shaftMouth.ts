import type { VerticalKind } from '../../../model';
import type { Vec } from '../../geometry';
import { TO_LIGHT } from '../../art/light';
import { valueNoise } from '../../art/noise';
import type { WayFrame } from './narrows';

/**
 * A shaft's mouth: the rim the floor breaks off at, then the ledges it steps down by, each smaller
 * than the last and drawn back towards the light, so the face below the far lip shows wide and lit
 * and the near one narrow, in its rim's shadow. The innermost ring is the dark the shaft falls into.
 * The pitch above and the aven below are drawn from the same rings, so both floors' openings agree.
 */
export interface ShaftMouth {
  /** Rim first, the dark last. */
  rings: Vec[][];
  centre: Vec;
  /** Where the mouth begins along the way, `v` of the frame: the floor before it is the approach. */
  near: number;
  /** Half its size across and along the way, in cells. */
  half: { u: number; v: number };
}

/**
 * How wide a cave's way up or down opens against its cell, as a radius in cells about the cell's
 * middle, by how it is passed: a shaft (wide enough to stand in), a chimney a body braces across,
 * a vertical squeeze barely a body wide.
 */
export const OPENING_RADIUS: Readonly<Record<VerticalKind, number>> = { shaft: 0.6, chimney: 0.4, squeeze: 0.28 };

/** Each ring's size against the rim's. */
const RING_SCALES = [1, 0.79, 0.6, 0.43];
/** How far the inner rings move towards the light, as a share of what they shrink by. */
const DRAWN_BACK = 0.55;
/** The floor kept clear round the mouth, in cells: inside the stairwell's cells, beside its walls. */
const SIDE_MARGIN = 0.13;
const FAR_MARGIN = 0.12;

/** The approach before the mouth, in cells, by how long the stairwell is. */
export function approachLength(along: number): number {
  return Math.min(0.85, along * 0.3);
}

export function shaftMouth(frame: WayFrame, seed: number): ShaftMouth {
  const { at, across, along } = frame;
  const near = -along / 2 + approachLength(along);
  const half = { u: across / 2 - SIDE_MARGIN, v: (along / 2 - FAR_MARGIN - near) / 2 };
  const middle = near + half.v;
  const centre = at(0, middle);
  const rings = mouthRings((u, v) => at(u, middle + v), half, seed);
  return { rings, centre, near, half };
}

/** A round mouth `radius` cells wide about `centre`, as an aven in a chamber's roof opens over one cell. */
export function roundMouth(centre: Vec, radius: number, seed: number): ShaftMouth {
  const half = { u: radius, v: radius };
  return { rings: mouthRings((u, v) => ({ x: centre.x + u, y: centre.y + v }), half, seed), centre, near: -radius, half };
}

/** The rim and the rings stepping down inside it, placed by `place` (across, along) about the mouth's middle. */
function mouthRings(place: (u: number, v: number) => Vec, half: { u: number; v: number }, seed: number): Vec[][] {
  const reach = Math.min(half.u, half.v);
  return RING_SCALES.map((scale, k) => {
    const back = (1 - scale) * reach * DRAWN_BACK;
    const shift = { x: TO_LIGHT.x * back, y: TO_LIGHT.y * back };
    const points: Vec[] = [];
    // The rim breaks into more, sharper facets than the ledges below it, which are seen softer.
    const n = k === 0 ? 34 : 20;
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5 * (valueNoise(i * 1.7, k * 3.1, seed + 5) - 0.5)) / n) * Math.PI * 2;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      // A rounded square more than an ellipse, so the mouth fills its cells; its edge wanders as rock breaks.
      const wander = 1 + 0.16 * (valueNoise(cos * 1.6 + k * 2.3, sin * 1.6 + 7, seed) - 0.5) + (k === 0 ? 0.06 * (valueNoise(i * 0.9, 3, seed + 9) - 0.5) : 0);
      const u = Math.sign(cos) * Math.abs(cos) ** 0.8 * half.u * scale * wander;
      const v = Math.sign(sin) * Math.abs(sin) ** 0.8 * half.v * scale * wander;
      const p = place(u, v);
      points.push({ x: p.x + shift.x, y: p.y + shift.y });
    }
    return points;
  });
}

/** The ring moved by `d` cells along `dir`, wound the other way: with the ring itself, nonzero fills what it no longer covers. */
export function shiftedBack(ring: readonly Vec[], dir: Vec, d: number): Vec[] {
  return ring.map(p => ({ x: p.x + dir.x * d, y: p.y + dir.y * d })).reverse();
}

/** A closed ring (or, `closed` false, an open line) cut into dashes, as a cartographer draws what lies overhead. */
export function dashes(ring: readonly Vec[], dash: number, gap: number, closed = true): Vec[][] {
  const out: Vec[][] = [];
  let run: Vec[] = [];
  let left = dash;
  let drawing = true;
  for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) {
    let a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    if (drawing && !run.length) run.push(a);
    while (len > left) {
      const k = left / len;
      const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      if (drawing) {
        run.push(p);
        out.push(run);
        run = [];
      } else run = [p];
      drawing = !drawing;
      len -= left;
      a = p;
      left = drawing ? dash : gap;
    }
    left -= len;
    if (drawing) run.push(b);
  }
  if (drawing && run.length > 1) out.push(run);
  return out;
}
