import { wallList } from '../../vision/wallList';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';

/** Screen pixels: how close to a wall's end a point lands on it. */
const WALL_END_SNAP = 10;

/** World pixels: ends this close are one joint, which moves as one. */
export const SHARED_END_TOLERANCE = 2;

/** One end of a wall. */
export interface WallEnd {
  wallId: string;
  end: 'p1' | 'p2';
}

/** What `wallEndNear` passes over or counts besides the walls' ends. */
export interface WallEndSearch {
  /** Walls whose ends are passed over: those a dragged joint moves. */
  skip?: ReadonlySet<string>;
  /** Places never landed on: where the far ends of a dragged joint's walls are, which would shrink a wall to a point. */
  avoid?: readonly Point[];
  /** Points that count as wall ends: the start of a stroke not placed yet. */
  also?: readonly Point[];
}

/** The wall end nearest the world `point` within reach at viewport `zoom`, or null. */
export function wallEndNear(point: Point, walls: Record<string, WallSegment>, zoom: number, { skip, avoid = [], also = [] }: WallEndSearch = {}): Point | null {
  const ends = wallList(walls).flatMap((wall) => (skip?.has(wall.id) ? [] : [wall.p1, wall.p2]));
  let found: Point | null = null;
  let best = WALL_END_SNAP / zoom;
  for (const end of [...ends, ...also]) {
    const distance = Math.hypot(point.x - end.x, point.y - end.y);
    if (distance <= best && !avoid.some((place) => sameJoint(place, end))) {
      best = distance;
      found = end;
    }
  }
  return found ? { x: found.x, y: found.y } : null;
}

/** `point`, or the wall end it lies close to: what is drawn along walls ends exactly on them. */
export function snapToWallEnd(point: Point, walls: Record<string, WallSegment>, zoom: number, search?: WallEndSearch): Point {
  return wallEndNear(point, walls, zoom, search) ?? point;
}

/** Every wall end at `point`: the walls that meet in one joint. */
export function endsAt(point: Point, walls: Record<string, WallSegment>): WallEnd[] {
  return wallList(walls).flatMap((wall): WallEnd[] => [
    ...(sameJoint(wall.p1, point) ? [{ wallId: wall.id, end: 'p1' as const }] : []),
    ...(sameJoint(wall.p2, point) ? [{ wallId: wall.id, end: 'p2' as const }] : []),
  ]);
}

/** The chain a wall drawn on from `point` continues: that of the one wall ending there, none where walls meet or none ends. */
export function chainEndingAt(point: Point, walls: Record<string, WallSegment>): string | undefined {
  const ends = endsAt(point, walls);
  return ends.length === 1 ? walls[ends[0]!.wallId]?.chainId : undefined;
}

/** Two points are one joint. */
export function sameJoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < SHARED_END_TOLERANCE && Math.abs(a.y - b.y) < SHARED_END_TOLERANCE;
}
