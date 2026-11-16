/**
 * The first room of a floor further from the entrance: a room around the stairs' end from the
 * floor before, the stairwell against one of its walls and its arrival row on the floor (past the
 * low end where the floor lies below, before the high end where it lies above). Its size is drawn, and of
 * every place it may stand one is picked.
 */

import type { CellDir, CellPoint } from '../model';
import { type CellRect, cellKey, cellsOf, contains, wallRect } from '../geometry';
import { MAX_SEED, type Rng, int, pick, shuffled } from '../rng';
import type { FloorRoot } from '../layout/grow';
import { type RoomSize, drawRoomSize, drawSmallRoomSize } from '../layout/sizes';
import { STAIR_DIRS, type StairEnd, type StairSpot, approachCells, spotFits, spotRect } from './stairSpots';

/** Sizes tried before an attempt gives up on its landing. */
const SIZE_TRIES = 4;

/** The floor rectangle of a room of this size whose near wall faces against `axis`, its near corner at (x0, y0). */
function floorDims(axis: CellDir, width: number, depth: number): { w: number; h: number } {
  return axis.x !== 0 ? { w: depth - 2, h: width - 2 } : { w: width - 2, h: depth - 2 };
}

/** The door cell in the middle of the near wall of a room with floor `f` growing along `axis`. */
function originOf(f: CellRect, axis: CellDir): CellPoint {
  const cx = (f.x0 + f.x1) / 2;
  const cy = (f.y0 + f.y1) / 2;
  if (axis.y > 0) return { x: cx, y: f.y0 - 1 };
  if (axis.y < 0) return { x: cx, y: f.y1 + 1 };
  if (axis.x > 0) return { x: f.x0 - 1, y: cy };
  return { x: f.x1 + 1, y: cy };
}

/** The floor rectangles of size `w` × `h` that hold the stairwell and its arrival row, against one wall. */
function placements(spot: StairSpot, end: StairEnd, w: number, h: number): CellRect[] {
  const need = [...cellsOf(spotRect(spot)), ...approachCells(spot, end)];
  const xs = need.map((c) => c.x);
  const ys = need.map((c) => c.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: CellRect[] = [];
  for (let x0 = maxX - w + 1; x0 <= minX; x0++) {
    for (let y0 = maxY - h + 1; y0 <= minY; y0++) out.push({ x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 });
  }
  return out;
}

/** How many cells of `f` lie over `below`. */
function overlap(f: CellRect, below: CellRect): number {
  const w = Math.min(f.x1, below.x1) - Math.max(f.x0, below.x0) + 1;
  const h = Math.min(f.y1, below.y1) - Math.max(f.y0, below.y0) + 1;
  return w > 0 && h > 0 ? w * h : 0;
}

/** A landing room's floor and the axis it grows along. */
interface LandingPlace {
  f: CellRect;
  axis: CellDir;
}

/** Every place a landing room of this size may stand along `axes`, its walls within `ground` where given. */
function landingPlaces(spot: StairSpot, end: StairEnd, size: RoomSize, axes: readonly CellDir[], ground: CellRect | null): LandingPlace[] {
  const options = axes.flatMap((axis) => {
    const { w, h } = floorDims(axis, size.width, size.depth);
    return placements(spot, end, w, h).map((f) => ({ f, axis }));
  });
  return options.filter(({ f }) => {
    const room = { id: 0, x: f.x0, y: f.y0, w: f.x1 - f.x0 + 1, h: f.y1 - f.y0 + 1, kind: 'room' as const, rotunda: false };
    if (ground && !contains(ground, wallRect(room))) return false;
    return spotFits(room, { doors: [], stairs: [], ends: [] }, spot, end);
  });
}

/** Of `places`, those whose floor lies over the most of `over`. */
function coveringMost(places: readonly LandingPlace[], over: CellRect): LandingPlace[] {
  const most = Math.max(...places.map(({ f }) => overlap(f, over)));
  return places.filter(({ f }) => overlap(f, over) === most);
}

/** The small rooms a landing is drawn as most often: where none of them stands on `ground`, no landing does. */
const SMALL_LANDINGS: readonly RoomSize[] = [5, 7].flatMap((width) => [4, 5, 6].map((depth) => ({ width, depth })));

/** Whether a landing room can stand round this end of a stairwell, its walls within `ground`. */
export function landingFits(spot: StairSpot, end: StairEnd, ground: CellRect): boolean {
  return SMALL_LANDINGS.some((size) => landingPlaces(spot, end, size, STAIR_DIRS, ground).length > 0);
}

/** Where a storey's landing stands: over the room the stairs rise from, and within the floor below's outer walls. */
export interface StoreyLanding {
  /** The floor of the room the stairs rise from: the landing covers as much of it as it can, as an upper room of a tower stands over the room below it. */
  over: CellRect | null;
  /** The floor below's outer walls, which the landing's walls never pass. */
  ground: CellRect;
  /** A small room: a stair landing, not the room built over the entrance room (a gate chamber, a grand staircase's landing). */
  small: boolean;
}

/**
 * The landing's first room for an attempt, standing as a storey's does where `storey` is given and
 * with at least `minFloor` cells of floor across; null where no room drawn fits it.
 */
export function landingRoot(rng: Rng, spot: StairSpot, end: StairEnd, storey: StoreyLanding | null = null, minFloor = 0): FloorRoot | null {
  for (let tries = 0; tries < SIZE_TRIES; tries++) {
    // A storey's landing is a small room, as a stair landing is, leaving the floor below's ground to the rooms round it.
    const size = storey?.small ? drawSmallRoomSize(rng) : drawRoomSize(rng, minFloor);
    const fitting = landingPlaces(spot, end, size, shuffled(rng, STAIR_DIRS), storey?.ground ?? null);
    if (fitting.length === 0) continue;
    const { f, axis } = pick(rng, storey?.over ? coveringMost(fitting, storey.over) : fitting);
    return { origin: originOf(f, axis), axis, seed: int(rng, 1, MAX_SEED), landing: size };
  }
  return null;
}

/** The cells no door of the landing's floor may open onto: the stairwell and its arrival row. */
export function landingCells(spot: StairSpot, end: StairEnd): Set<string> {
  return new Set([...cellsOf(spotRect(spot)), ...approachCells(spot, end)].map((c) => cellKey(c.x, c.y)));
}
