import type { Point } from '../grid/hexGeometry';
import { readMapStretch } from '../grid/mapStretch';
import type { GridState } from '../types/gridTypes';
import type { LevelAlignment, SceneLevel } from '../types/sceneLevelTypes';
import type { AlignedScene } from './levelAlignment';
import { gridPeriod } from './levelAlignmentFit';

/**
 * Placing a floor by hand: its image moved over the other floors of its scene, by whole cells of the
 * scene's grid, so a floor whose cells are fitted stays fitted. Only where the floor's art lies
 * changes; its scale and stretch stay as its alignment (or the frame) has them.
 */

/** How level `levelId` is drawn now, as an alignment: its own, or the frame's drawing for a frame level. */
export function floorAlignment(scene: AlignedScene, levelId: string): LevelAlignment {
  return scene.levelAlignments?.[levelId] ?? { offset: { x: 0, y: 0 }, scale: 1, stretch: readMapStretch(scene.grid?.mapStretch) };
}

/** The two steps that lay the grid on itself: a cell along and across a square grid; a neighbour along a hex row and one in the next row. */
function latticeSteps({ size, type }: Pick<GridState, 'size' | 'type'>): [Point, Point] {
  const half = size / 2;
  const row = (size * Math.sqrt(3)) / 2;
  if (type === 'hex-vertical') return [{ x: size, y: 0 }, { x: half, y: row }];
  if (type === 'hex-horizontal') return [{ x: 0, y: size }, { x: row, y: half }];
  return [{ x: size, y: 0 }, { x: 0, y: size }];
}

/** `delta` moved to the nearest shift that lays the grid on itself. */
export function snapToCells(delta: Point, grid: Pick<GridState, 'size' | 'type'>): Point {
  const [a, b] = latticeSteps(grid);
  const det = a.x * b.y - a.y * b.x;
  const i = (delta.x * b.y - delta.y * b.x) / det;
  const j = (a.x * delta.y - a.y * delta.x) / det;
  let best: Point = { x: 0, y: 0 };
  let bestDistance = Infinity;
  // The nearest lattice point is one of the four around the delta's place in the lattice's own coordinates.
  for (const m of [Math.floor(i), Math.ceil(i)]) {
    for (const n of [Math.floor(j), Math.ceil(j)]) {
      const point = { x: m * a.x + n * b.x, y: m * a.y + n * b.y };
      const distance = Math.hypot(point.x - delta.x, point.y - delta.y);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** A thousandth of a pixel: what rounding leaves below 0 is 0. */
const EPSILON = 1e-3;

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** A floor placed by a move: its alignment, and whether the world's edge stopped it short of where the move went. */
export interface MovedFloor {
  alignment: LevelAlignment;
  stopped: boolean;
}

/**
 * Level `levelId`'s alignment with its image moved by `delta` world pixels from `from` (its
 * alignment when the move began): by whole cells of the scene's grid unless `free` (or the scene
 * has no grid). The world begins at (0, 0), so an image never lies left of or above it: a move
 * past that edge stops at the last place on the grid before it.
 */
export function movedFloorAlignment(scene: AlignedScene, from: LevelAlignment, delta: Point, free: boolean): MovedFloor {
  const grid = scene.grid;
  const snapped = !free && !!grid && grid.size > 0;
  const shift = snapped ? snapToCells(delta, grid) : delta;
  const wanted = { x: from.offset.x + shift.x, y: from.offset.y + shift.y };
  const placed = snapped ? nearestInWorld(wanted, grid) : wanted;
  const offset = { x: Math.max(0, round(placed.x)), y: Math.max(0, round(placed.y)) };
  const stopped = Math.abs(offset.x - wanted.x) > EPSILON || Math.abs(offset.y - wanted.y) > EPSILON;
  return { alignment: { ...from, offset }, stopped };
}

/** How many lattice steps either way the place at the world's edge is looked for, around a place known to lie in the world. */
const EDGE_SEARCH = 4;

/**
 * The place nearest to lattice place `wanted` that lays the grid on itself and lies in the world
 * (never left of or above its corner): `wanted` itself where it does. On a hex grid moving by a
 * whole period along each axis alone would put a floor pushed against the top edge a row lower
 * than it was, so the lattice around such a place is searched.
 */
function nearestInWorld(wanted: Point, grid: Pick<GridState, 'size' | 'type'>): Point {
  if (wanted.x >= -EPSILON && wanted.y >= -EPSILON) return wanted;
  const period = gridPeriod(grid);
  // Whole periods along each axis lay the grid on itself and bring `wanted` into the world.
  const inside = { x: intoWorld(wanted.x, period.x), y: intoWorld(wanted.y, period.y) };
  const [a, b] = latticeSteps(grid);
  let best = inside;
  let bestDistance = Infinity;
  for (let m = -EDGE_SEARCH; m <= EDGE_SEARCH; m++) {
    for (let n = -EDGE_SEARCH; n <= EDGE_SEARCH; n++) {
      const point = { x: inside.x + m * a.x + n * b.x, y: inside.y + m * a.y + n * b.y };
      if (point.x < -EPSILON || point.y < -EPSILON) continue;
      const distance = Math.hypot(point.x - wanted.x, point.y - wanted.y);
      if (distance < bestDistance - EPSILON) {
        best = point;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** `value` moved by whole `period`s to 0 or above, where it lies below. */
function intoWorld(value: number, period: number): number {
  return value < -EPSILON ? value + Math.ceil((-value - EPSILON) / period) * period : value;
}

/**
 * The floor a floor is placed against: the one right below it, else the one right above it; null
 * where the scene has no other floor.
 */
export function referenceFloor(levels: readonly SceneLevel[] | undefined, levelId: string | null): string | null {
  if (!levels || levels.length < 2 || levelId === null) return null;
  const index = levels.findIndex((level) => level.id === levelId);
  if (index < 0) return null;
  return (levels[index - 1] ?? levels[index + 1])?.id ?? null;
}
