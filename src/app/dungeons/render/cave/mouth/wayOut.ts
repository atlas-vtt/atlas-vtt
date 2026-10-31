/**
 * The way out of a cave: before each entrance the cave's floor runs on as trodden ground for a few
 * cells, a little wider and bending a little, and fades into the paper. Pure geometry in cells,
 * shared by the painters, the rock that parts round it, the relief and the grid.
 */

import type { DungeonDoor, DungeonFloor } from '../../../model';
import { mouthLane, mouthsOf, type Mouth } from '../../art/mouths';
import { hash2, valueNoise } from '../../art/noise';
import { smoothstep } from '../../art/paths';
import { pointsBounds, rotate, type Bounds, type Vec } from '../../geometry';

export interface WayOut {
  mouth: Mouth;
  /** How far beyond the mouth the ground reaches before it is gone, in cells. */
  length: number;
  /** How much wider than the mouth its far end is, on either side, in cells. */
  spread: number;
  /** How far its far end lies to one side of straight on, in cells. */
  bend: number;
  /** How far a Forest's trail winds either way of its course, in cells; unset, a cave's way runs straight on. */
  winds?: number;
  seed: number;
}

/** Below the floor field's reach (`FloorField`, 3 cells), so a point farther out than it reads as clear of other floors. */
const FIELD_REACH = 2.5;

/** The ground's strength above which it reads as floor: the grid is drawn there. */
export const FLOOR_STRENGTH = 0.5;

/** Anything that answers the distance to a floor's floors: its `FloorField`. */
interface Field {
  distance(x: number, y: number): number;
}

/** A Forest's trails: at least this many cells long, up to `more` longer, their far end up to half of `bend` to a side, winding about `winds` either way. */
const TRAIL = { length: 7, more: 3, bend: 4, winds: 0.9 } as const;

/** The ways out of a floor's entrances, `seed` its own: none but on a cave floor (a Forest's entry floor is one). */
export function wayOutsOf(floor: DungeonFloor, doors: readonly DungeonDoor[], seed: number): WayOut[] {
  if (!floor.cave) return [];
  return mouthsOf({ doors }).map((mouth) => {
    const key = seed + Math.round(mouth.at.x * 7) * 131 + Math.round(mouth.at.y * 7) * 7919;
    // A Forest's way out is a trail that winds off into the woods, longer and bending more than a cave's.
    if (floor.forest) return { mouth, length: TRAIL.length + hash2(1, 0, key) * TRAIL.more, spread: -0.2 * mouth.width, bend: (hash2(3, 0, key) - 0.5) * TRAIL.bend, winds: TRAIL.winds * (0.5 + hash2(4, 0, key)), seed: key };
    return { mouth, length: 2.6 + hash2(1, 0, key) * 1.1, spread: 0.3 + hash2(2, 0, key) * 0.3, bend: (hash2(3, 0, key) - 0.5) * 0.7, seed: key };
  });
}

/** A point of the way's frame: `u` cells out from the mouth's middle, `v` across. */
export function wayPoint({ mouth: { at, out } }: WayOut, u: number, v: number): Vec {
  return { x: at.x + out.x * u - out.y * v, y: at.y + out.y * u + out.x * v };
}

/** A point in the way's frame: how far out (`u`) and across (`v`). */
export function wayFrameOf({ mouth: { at, out } }: WayOut, p: Vec): { u: number; v: number } {
  const dx = p.x - at.x;
  const dy = p.y - at.y;
  return { u: dx * out.x + dy * out.y, v: -dx * out.y + dy * out.x };
}

/** How far along the way `u` out lies, 0 at the mouth and 1 from its length on. */
function along(way: WayOut, u: number): number {
  return Math.min(1, Math.max(0, u) / way.length);
}

/** The middle of the way at `u` out; a Forest's trail also winds a little either way as it goes (`WayOut.winds`). */
export function wayCentre(way: WayOut, u: number): number {
  const t = Math.max(0, u) / way.length;
  const wind = way.winds ? way.winds * Math.sin(t * Math.PI * 1.6 + way.seed % 7) * Math.min(1, t * 3) : 0;
  return way.bend * t * t + wind;
}

/** Half the way's width at `u` out on `side` (−1, 1): the mouth's at the mouth, wandering wider outwards. */
export function wayHalf(way: WayOut, u: number, side: number): number {
  const t = along(way, u);
  const wander = (valueNoise(u * 1.7 + side * 13.1, side * 3.3, way.seed) - 0.5) * 0.36;
  return way.mouth.width / 2 + (way.spread + wander) * t;
}

/**
 * How strongly the ground shows at `p`, 0..1: whole at the mouth, fading out along the way to
 * nothing at its length with a ragged front, and softening at the sides the farther out it lies.
 * `distance`, where given, is the distance to the floors: the ground gives way where another
 * floor lies nearer than the mouth, so it never runs over the rock round another room.
 */
export function wayStrength(way: WayOut, p: Vec, distance?: (p: Vec) => number): number {
  const { u, v } = wayFrameOf(way, p);
  if (u < -0.1) return 0;
  const across = v - wayCentre(way, u);
  const side = across < 0 ? -1 : 1;
  const t = along(way, u);
  const soft = 0.05 + 0.32 * t;
  const sides = smoothstep(0, soft, wayHalf(way, u, side) - Math.abs(across));
  if (sides <= 0) return 0;
  const ragged = valueNoise(across * 2.6 + 5.1, u * 0.4, way.seed + 1) * 0.9 * t;
  const fade = 1 - smoothstep(way.length * 0.18, way.length, Math.max(0, u) + ragged);
  if (fade <= 0) return 0;
  const clear = distance ? smoothstep(-0.55, -0.15, distance(p) - Math.min(Math.max(0, u), FIELD_REACH)) : 1;
  return sides * fade * clear;
}

/** Rays from the mouth's middle, out over a half turn, that the ground's contours are found along. */
const RAYS = 48;
/** Steps a ray is walked in before its last crossing is refined, in cells. */
const RAY_STEP = 0.04;

/** One ray of a way: where its points lie, and the ground's strength at each step out. */
interface Ray {
  at: (r: number) => Vec;
  steps: number[];
}

/** The rays of a way, each walked once: every level's ring is found along the same samples. */
function raysOf(way: WayOut, distance: (p: Vec) => number): Ray[] {
  const reach = way.length + way.spread + Math.abs(way.bend) + way.mouth.width;
  return Array.from({ length: RAYS + 1 }, (_, k) => {
    const dir = rotate(way.mouth.out, -(-Math.PI / 2 + (k / RAYS) * Math.PI));
    const at = (r: number): Vec => ({ x: way.mouth.at.x + dir.x * r, y: way.mouth.at.y + dir.y * r });
    const steps: number[] = [];
    for (let r = RAY_STEP; r <= reach; r += RAY_STEP) steps.push(wayStrength(way, at(r), distance));
    return { at, steps };
  });
}

/**
 * The ring round the ground at least `level` strong, closed `tuck` cells inside the mouth: the
 * ground is star-shaped seen from the mouth's middle, so each ray's last crossing of the level is
 * the ring.
 */
function ringOf(way: WayOut, rays: readonly Ray[], level: number, distance: (p: Vec) => number, tuck: number): Vec[] {
  const half = way.mouth.width / 2;
  const ring: Vec[] = [wayPoint(way, -tuck, -half)];
  for (const { at, steps } of rays) {
    let last = 0;
    let r = RAY_STEP;
    for (const strength of steps) {
      if (strength >= level) last = r;
      r += RAY_STEP;
    }
    let lo = last;
    let hi = last + RAY_STEP;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      if (wayStrength(way, at(mid), distance) >= level) lo = mid;
      else hi = mid;
    }
    ring.push(at(lo));
  }
  ring.push(wayPoint(way, -tuck, half));
  return ring;
}

/** The box round the way's sides out to `reach` cells beyond its mouth, for sizing the map round it. */
export function wayExtent(way: WayOut, reach: number): Bounds {
  return pointsBounds([-1, 1].flatMap((side) => [0, reach].map((u) => wayPoint(way, u, wayCentre(way, u) + side * wayHalf(way, u, side)))));
}

/** How far the rock keeps back from the faintest trodden ground, in cells: room for the scree that ends the walls. */
const ROCK_CLEAR = 0.04;
/** How far inside the mouth a ring closes, so it overlaps the floor. */
const TUCK = 0.06;

/**
 * The open ground before every way in, where no rock stands and no wall's shadow falls: before a
 * cave's mouth its way out, before a built entrance its lane (`mouthLane`).
 */
export function openGroundOf(shown: { floor: DungeonFloor; doors: readonly DungeonDoor[]; ways: readonly WayOut[]; field: Field }): Vec[][] {
  if (!shown.floor.cave) return mouthsOf(shown).map(mouthLane);
  return shown.ways.map((way) => groundRing(shown.field, way, ROCK_CLEAR));
}

const cache = new WeakMap<WayOut, { rays: Ray[]; rings: Map<string, Vec[]> }>();

/** The ring round a way's ground at least `level` strong, giving way to the floors `field` measures, kept for the next ask. */
export function groundRing(field: Field, way: WayOut, level: number, tuck = TUCK): Vec[] {
  const distance = groundDistance(field);
  let kept = cache.get(way);
  if (!kept) {
    kept = { rays: raysOf(way, distance), rings: new Map() };
    cache.set(way, kept);
  }
  const key = `${level}/${tuck}`;
  let ring = kept.rings.get(key);
  if (!ring) {
    ring = ringOf(way, kept.rays, level, distance, tuck);
    kept.rings.set(key, ring);
  }
  return ring;
}

/** The ground drawn as floor, closed on its mouth's edge so it meets the floor without overlapping it: where the grid runs on. */
export function floorRing(field: Field, way: WayOut): Vec[] {
  return groundRing(field, way, FLOOR_STRENGTH, 0);
}

/** The distance to the floors `field` measures, as `wayStrength` reads it. */
export function groundDistance(field: Field): (p: Vec) => number {
  return (p) => field.distance(p.x, p.y);
}
