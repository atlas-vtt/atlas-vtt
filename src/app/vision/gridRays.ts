import type { Point } from '../types/visionTypes';
import type { WallChannel, WallSegment } from '../types/wallTypes';
import { covers, spanBetween } from './angularSpans';
import { angleTo, distSqToSegment, rayHit } from './visionGeometry';
import { blocksFrom, blocksInReach } from './wallReach';
import { seenEdgeOn, stopOnEdgeOn } from './edgeOn';
import { forCellRows, type WallGrid } from './wallGrid';

/** A walk stops once its nearest hit lies this much (relatively) before the cell's far side: in doubt, one more cell. */
const STOP_SLACK = 1e-9;

/** One sweep's questions to a wall grid: from where, how far, and the walls in reach then. */
export interface RayQuery {
  grid: WallGrid;
  origin: Point;
  radius: number;
  /** The call's mark in the grid's scratch: a wall is in reach when `scratch.inReach` holds it. */
  call: number;
  /** How many of `scratch.reach` are the walls in reach. */
  reachCount: number;
  /** A limited wall is in reach: such a sweep is not culled. */
  limited: boolean;
  /** The walls in reach seen edge-on (`seenEdgeOn`). */
  edgeOn: number[];
}

/** Where a ray stops: its reach, and the wall it stops on (an index into the grid's walls), or −1 at the limit. */
export interface RayStop {
  t: number;
  wall: number;
}

function nextMark(value: number): number {
  return value >= 0xfffffffe ? 1 : value + 1;
}

/**
 * The walls of `grid` that block `channel` from `origin` within `radius`, with the angles each
 * covers: the same walls and spans the full sweep works with (`wallsInReach`, `angularSpans`).
 */
export function rayQuery(grid: WallGrid, origin: Point, radius: number, channel?: WallChannel): RayQuery {
  const { scratch, walls } = grid;
  scratch.call = nextMark(scratch.call);
  if (scratch.call === 1) { scratch.inReach.fill(0); scratch.endCall.fill(0); }
  const query: RayQuery = { grid, origin, radius, call: scratch.call, reachCount: 0, limited: false, edgeOn: [] };
  const radiusSq = radius * radius;
  const { minX, minY, cell, cols, rows } = grid;
  const maxX = minX + cols * cell, maxY = minY + rows * cell;
  // Where the circle holds the whole grid with room to spare, every wall is within the radius whatever the rounding.
  const far = Math.max(Math.hypot(minX - origin.x, minY - origin.y), Math.hypot(maxX - origin.x, minY - origin.y), Math.hypot(minX - origin.x, maxY - origin.y), Math.hypot(maxX - origin.x, maxY - origin.y));
  const allInRadius = far + 1e-9 * (far + Math.abs(minX) + Math.abs(minY) + Math.abs(maxX) + Math.abs(maxY)) < radius;
  const consider = (i: number): void => {
    const wall = walls[i]!;
    if (scratch.inReach[i] === query.call || !(allInRadius ? blocksFrom(wall, origin, channel) : blocksInReach(wall, origin, radiusSq, channel))) return;
    scratch.inReach[i] = query.call;
    scratch.reach[query.reachCount++] = i;
    if (wall.limited) query.limited = true;
    if (seenEdgeOn(wall, origin)) query.edgeOn.push(i);
    const span = spanBetween(endAngleOf(query, i * 2), endAngleOf(query, i * 2 + 1));
    scratch.from[i] = span.from;
    scratch.to[i] = span.to;
    scratch.wraps[i] = span.wraps ? 1 : 0;
  };
  if (origin.x - radius <= minX && origin.y - radius <= minY && origin.x + radius >= maxX && origin.y + radius >= maxY) {
    for (let i = 0; i < walls.length; i++) consider(i);
  } else {
    forCellRows(grid, origin.x, origin.y, origin.x, origin.y, radius, (row, first, last) => {
      for (let c = row * cols + first; c <= row * cols + last; c++) for (let k = grid.starts[c]!; k < grid.starts[c + 1]!; k++) consider(grid.items[k]!);
    });
  }
  return query;
}

/** The bearing from the origin of wall end `slot` (2 × wall, + 1 for p2), worked out once per call for each distinct end. */
export function endAngleOf(query: RayQuery, slot: number): number {
  const { scratch, ends, coords } = query.grid;
  const end = ends[slot]!;
  if (scratch.endCall[end] !== query.call) {
    scratch.endCall[end] = query.call;
    scratch.endAngle[end] = angleTo(query.origin, { x: coords[slot * 2]!, y: coords[slot * 2 + 1]! });
    scratch.endHidden[end] = 0;
  }
  return scratch.endAngle[end]!;
}

const found: RayStop = { t: 0, wall: -1 };

/**
 * Leaves in `found` the nearest hit before `limit` of the ray at `angle` from the origin, as the
 * full sweep works it out; with `any`, the first hit found. The walls the cells along the ray
 * list, and the walls seen edge-on, which a ray may stop on outside their cells (`stopOnEdgeOn`).
 */
function walk(query: RayQuery, angle: number, limit: number, any: boolean, dx: number, dy: number): void {
  found.t = limit;
  found.wall = -1;
  walkCells(query, angle, any, dx, dy);
  if (query.edgeOn.length > 0 && !(any && found.wall >= 0)) stopOnEdgeOn(query, angle, dx, dy, found);
}

/**
 * Walks the cells along the ray at `angle` from the origin, nearest first, testing each wall in
 * reach whose span covers the angle with the full sweep's arithmetic. Moves `found` to the
 * nearest hit before it; with `any`, stops at the first.
 */
function walkCells(query: RayQuery, angle: number, any: boolean, dx: number, dy: number): void {
  const { grid, origin } = query;
  const { scratch, walls, minX, minY, cell, cols, rows, starts, items } = grid;
  const limit = found.t;
  let enter = 0, leave = Infinity;
  const maxX = minX + cols * cell, maxY = minY + rows * cell;
  if (dx !== 0) {
    const a = (minX - origin.x) / dx, b = (maxX - origin.x) / dx;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  } else if (origin.x < minX || origin.x > maxX) return;
  if (dy !== 0) {
    const a = (minY - origin.y) / dy, b = (maxY - origin.y) / dy;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  } else if (origin.y < minY || origin.y > maxY) return;
  if (enter > leave || enter > limit) return;
  scratch.walk = nextMark(scratch.walk);
  if (scratch.walk === 1) scratch.seen.fill(0);
  const walkMark = scratch.walk;
  let cx = Math.min(cols - 1, Math.max(0, Math.floor((origin.x + dx * enter - minX) / cell)));
  let cy = Math.min(rows - 1, Math.max(0, Math.floor((origin.y + dy * enter - minY) / cell)));
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  for (;;) {
    const c = cy * cols + cx;
    for (let k = starts[c]!; k < starts[c + 1]!; k++) {
      const i = items[k]!;
      if (scratch.seen[i] === walkMark) continue;
      scratch.seen[i] = walkMark;
      if (scratch.inReach[i] !== query.call || !covers(scratch.from[i]!, scratch.to[i]!, scratch.wraps[i] === 1, angle)) continue;
      const wall = walls[i]!;
      const t = rayHit(origin, dx, dy, wall.p1, wall.p2);
      if (t < found.t) {
        found.t = t;
        found.wall = i;
        if (any) return;
      }
    }
    const tx = stepX > 0 ? (minX + (cx + 1) * cell - origin.x) / dx : stepX < 0 ? (minX + cx * cell - origin.x) / dx : Infinity;
    const ty = stepY > 0 ? (minY + (cy + 1) * cell - origin.y) / dy : stepY < 0 ? (minY + cy * cell - origin.y) / dy : Infinity;
    const exit = Math.min(tx, ty);
    if (found.t < exit * (1 - STOP_SLACK)) return;
    if (tx <= ty) cx += stepX;
    else cy += stepY;
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return;
  }
}

/** Where the full sweep's ray at `angle` (direction `dx`, `dy`) stops, up to `limit`: the same value to the last bit, and the wall it stops on. */
export function firstHit(query: RayQuery, angle: number, limit: number, dx = Math.cos(angle), dy = Math.sin(angle)): RayStop {
  walk(query, angle, limit, false, dx, dy);
  return { t: found.t, wall: found.wall };
}

/** Whether the full sweep's ray at `angle` stops on a wall before `limit`. */
export function anyHitBefore(query: RayQuery, angle: number, limit: number): boolean {
  return occluder(query, angle, limit, Math.cos(angle), Math.sin(angle)) >= 0;
}

/** A wall on which the full sweep's ray at `angle` (direction `dx`, `dy`) stops before `limit`, or −1. */
export function occluder(query: RayQuery, angle: number, limit: number, dx: number, dy: number): number {
  walk(query, angle, limit, true, dx, dy);
  return found.t < limit ? found.wall : -1;
}

/** Whether the full sweep's ray at `angle` (direction `dx`, `dy`) tests wall `i` and stops on it before `limit`. */
export function stopsOn(query: RayQuery, i: number, angle: number, dx: number, dy: number, limit: number): boolean {
  const { scratch, walls } = query.grid;
  if (scratch.inReach[i] !== query.call || !covers(scratch.from[i]!, scratch.to[i]!, scratch.wraps[i] === 1, angle)) return false;
  return rayHit(query.origin, dx, dy, walls[i]!.p1, walls[i]!.p2) < limit;
}

/** The walls in reach (indices) that come within `margin` of the segment from `a` to `b`. */
export function wallsNear(query: RayQuery, a: Point, b: Point, margin: number): number[] {
  const { grid } = query;
  const { scratch, walls, cols, starts, items } = grid;
  scratch.walk = nextMark(scratch.walk);
  if (scratch.walk === 1) scratch.seen.fill(0);
  const walkMark = scratch.walk;
  const near: number[] = [];
  forCellRows(grid, a.x, a.y, b.x, b.y, margin, (row, first, last) => {
    for (let c = row * cols + first; c <= row * cols + last; c++) {
      for (let k = starts[c]!; k < starts[c + 1]!; k++) {
        const i = items[k]!;
        if (scratch.seen[i] === walkMark) continue;
        scratch.seen[i] = walkMark;
        if (scratch.inReach[i] === query.call && segmentsWithin(a, b, walls[i]!, margin)) near.push(i);
      }
    }
  });
  return near;
}

/** Whether segment a–b and `wall` come within `margin` of each other. */
function segmentsWithin(a: Point, b: Point, wall: WallSegment, margin: number): boolean {
  const { p1, p2 } = wall;
  const side = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(a, b, p1), d2 = side(a, b, p2), d3 = side(p1, p2, a), d4 = side(p1, p2, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const m = margin * margin;
  return distSqToSegment(p1, a, b) <= m || distSqToSegment(p2, a, b) <= m || distSqToSegment(a, p1, p2) <= m || distSqToSegment(b, p1, p2) <= m;
}
