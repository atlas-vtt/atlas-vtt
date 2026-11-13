/**
 * Where a point of a fog shape lands: on what lies close to the pointer, so fog drawn along the
 * map's own lines ends exactly on them. In this order, each within `reach` of the pointer: a
 * corner of an area, a wall's end, a point of the grid, then the edge of an area or a wall. A
 * pointer near none of them lands on the grid's nearest point, as every tool's points do while
 * the grid's Snap is on. Rectangles and polygons snap; the brush and the lasso never do.
 */

import type { GridGeometry } from '../grid/gridDistance';
import { isHexGridType } from '../grid/hexGeometry';
import { snapAreaOrigin } from '../measure/measureSnap';
import type { Point } from '../types/visionTypes';
import { heldToEighth, keepsDirection } from './fogConstrain';
import { outlineRings } from './fogKeyhole';

/** A wall as snapping reads it: its two ends. */
export interface FogSnapLine {
  readonly p1: Point;
  readonly p2: Point;
}

/** What a point may snap to. */
export interface FogSnapCandidates {
  /** The grid whose points it snaps to: null where the grid's Snap is off, the map has no grid or the shape takes none. */
  readonly grid: GridGeometry | null;
  readonly walls: readonly FogSnapLine[];
  /** The outlines of the fog's areas, each a closed run of corners. */
  readonly areas: ReadonlyArray<readonly Point[]>;
}

/** What a point snapped to: a place, or a place on a line from `from` to `to`. */
export type FogSnapTarget =
  | { readonly kind: 'area-corner' | 'wall-end' | 'grid'; readonly point: Point }
  | { readonly kind: 'area-edge' | 'wall'; readonly point: Point; readonly from: Point; readonly to: Point };

/** Where a point lands, and what it snapped to there; null where it stays under the pointer. */
export interface FogSnap {
  readonly point: Point;
  readonly to: FogSnapTarget | null;
}

/** Nothing to snap to: every point stays where the pointer is. */
export const NO_SNAP: FogSnapCandidates = { grid: null, walls: [], areas: [] };

const isPlace = (point: Point): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The point of `grid` nearest to `point`: a corner of a square cell; on a hex grid the nearest of
 * a hex's centre and its corners. Null where the grid has no cells.
 */
export function fogGridPoint(grid: GridGeometry, point: Point): Point | null {
  if (!(grid.size > 0) || !Number.isFinite(grid.size)) return null;
  if (isHexGridType(grid.type)) return snapAreaOrigin(grid, point);
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  return { x: offsetX + Math.round((point.x - offsetX) / grid.size) * grid.size, y: offsetY + Math.round((point.y - offsetY) / grid.size) * grid.size };
}

/** Keeps the nearest place within reach. */
class Nearest {
  found: Point | null = null;

  constructor(private readonly point: Point, private best: number) {}

  offer(place: Point): void {
    if (!isPlace(place)) return;
    const away = distance(this.point, place);
    // The first of two as near stays.
    if (away > this.best || (this.found !== null && away === this.best)) return;
    this.best = away;
    this.found = place;
  }
}

/** Keeps the line whose nearest place to the pointer is the nearest within reach; a line without length has no such place. */
class NearestLine {
  private kind: 'area-edge' | 'wall' = 'wall';
  private from: Point | null = null;
  private to: Point | null = null;
  private x = 0;
  private y = 0;

  constructor(private readonly point: Point, private best: number) {}

  offer(kind: 'area-edge' | 'wall', a: Point, b: Point): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    if (!(length > 0) || !Number.isFinite(length)) return;
    const along = Math.min(1, Math.max(0, ((this.point.x - a.x) * dx + (this.point.y - a.y) * dy) / length));
    const x = a.x + dx * along;
    const y = a.y + dy * along;
    const away = Math.hypot(this.point.x - x, this.point.y - y);
    // The first of two as near stays: an area's edge before a wall on the same line.
    if (!(away <= this.best) || (this.from !== null && away === this.best)) return;
    this.best = away;
    this.kind = kind;
    this.from = a;
    this.to = b;
    this.x = x;
    this.y = y;
  }

  target(): FogSnapTarget | null {
    if (!this.from || !this.to) return null;
    return { kind: this.kind, point: { x: this.x, y: this.y }, from: { ...this.from }, to: { ...this.to } };
  }
}

function nearestCorner(point: Point, candidates: FogSnapCandidates, reach: number): FogSnapTarget | null {
  const corners = new Nearest(point, reach);
  for (const area of candidates.areas) for (const corner of area) corners.offer(corner);
  if (corners.found) return { kind: 'area-corner', point: { ...corners.found } };
  const ends = new Nearest(point, reach);
  for (const wall of candidates.walls) {
    ends.offer(wall.p1);
    ends.offer(wall.p2);
  }
  return ends.found ? { kind: 'wall-end', point: { ...ends.found } } : null;
}

function nearestEdge(point: Point, candidates: FogSnapCandidates, reach: number): FogSnapTarget | null {
  const nearest = new NearestLine(point, reach);
  for (const area of candidates.areas) {
    // An area with a hole is its own edge and the hole's: the slit between them is no edge of it.
    for (const ring of outlineRings(area)) {
      for (let i = 0; i < ring.length; i++) nearest.offer('area-edge', ring[i]!, ring[(i + 1) % ring.length]!);
    }
  }
  for (const wall of candidates.walls) nearest.offer('wall', wall.p1, wall.p2);
  return nearest.target();
}

/**
 * Where `point` lands among `candidates`. `reach` is how near the pointer must be to a corner, an
 * end or an edge to land on it, in world pixels (a few pixels on screen).
 */
export function snapPoint(point: Point, candidates: FogSnapCandidates, reach: number): FogSnap {
  const free: FogSnap = { point: { x: point.x, y: point.y }, to: null };
  if (!isPlace(point)) return free;
  const within = Number.isFinite(reach) && reach > 0 ? reach : 0;
  const onGrid = candidates.grid ? fogGridPoint(candidates.grid, point) : null;
  const grid: FogSnap | null = onGrid && isPlace(onGrid) ? { point: onGrid, to: { kind: 'grid', point: onGrid } } : null;
  if (within > 0) {
    const corner = nearestCorner(point, candidates, within);
    if (corner) return { point: corner.point, to: corner };
    if (grid && distance(point, grid.point) <= within) return grid;
    const edge = nearestEdge(point, candidates, within);
    if (edge) return { point: edge.point, to: edge };
  }
  return grid ?? free;
}

/**
 * Where the corner after `from` lands while Shift holds its edge to eighths of a turn: on that
 * line under the pointer, and on what lies close only where that keeps the edge's direction.
 */
export function snapHeldPoint(from: Point, point: Point, candidates: FogSnapCandidates, reach: number): FogSnap {
  const held = heldToEighth(from, point);
  const snapped = snapPoint(held, candidates, reach);
  return snapped.to && keepsDirection(from, held, snapped.point) ? snapped : { point: held, to: null };
}
