import type { Point } from '../../types/visionTypes';
import type { WallInput, WallSegment } from '../../types/wallTypes';
import { endsAt, sameJoint } from './wallEnds';

/** Walls this close to one line (the sine of the angle between them) continue each other. */
const COLLINEAR = Math.sin(Math.PI / 180);

/** Walls to remove and walls to add in their place, as one edit. */
export interface WallEdit {
  remove: string[];
  add: WallInput[];
}

function withoutIdentity(wall: WallSegment): WallInput {
  const { id: _id, kind: _kind, ...rest } = wall;
  return rest;
}

/** The one wall replacing `kept` and `other`, which meet at `joint`: from `kept`'s far end to `other`'s, with `kept`'s properties and its direction of travel. */
function joined(kept: WallInput, other: Pick<WallInput, 'p1' | 'p2'>, joint: Point): WallInput {
  const far = sameJoint(other.p1, joint) ? other.p2 : other.p1;
  return sameJoint(kept.p2, joint) ? { ...kept, p2: far } : { ...kept, p1: far };
}

function collinear(a: Pick<WallInput, 'p1' | 'p2'>, b: Pick<WallInput, 'p1' | 'p2'>): boolean {
  const ax = a.p2.x - a.p1.x;
  const ay = a.p2.y - a.p1.y;
  const bx = b.p2.x - b.p1.x;
  const by = b.p2.y - b.p1.y;
  const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return lengths > 0 && Math.abs(ax * by - ay * bx) / lengths < COLLINEAR;
}

/**
 * Removing the joint at `point`: the open end of one wall takes that wall with it, and two walls
 * of one type meeting there become one wall between their far ends. Null where that cannot be
 * done (no wall ends there, more than two meet, a wall meets a door).
 */
export function removeJoint(walls: Record<string, WallSegment>, point: Point): WallEdit | null {
  const ends = endsAt(point, walls);
  if (ends.length === 1) return { remove: [ends[0]!.wallId], add: [] };
  if (ends.length !== 2 || ends[0]!.wallId === ends[1]!.wallId) return null;
  const a = walls[ends[0]!.wallId];
  const b = walls[ends[1]!.wallId];
  if (!a || !b || a.type !== b.type) return null;
  const wall = joined(withoutIdentity(a), b, point);
  return sameJoint(wall.p1, wall.p2) ? null : { remove: [a.id, b.id], add: [wall] };
}

/**
 * Removing a door: it becomes wall again, and joins the walls it was placed between where one
 * continues it in a straight line at either end, so a door placed and removed leaves the wall
 * it was placed in. Null for a wall that is no door.
 */
export function removeDoor(walls: Record<string, WallSegment>, doorId: string): WallEdit | null {
  const door = walls[doorId];
  if (!door || (door.type !== 'door' && door.type !== 'secret-door')) return null;
  const { closed: _closed, locked: _locked, ...rest } = withoutIdentity(door);
  let wall: WallInput = { ...rest, type: 'solid' };
  const remove = [doorId];
  for (const end of [door.p1, door.p2]) {
    const others = endsAt(end, walls).filter((other) => other.wallId !== doorId);
    const other = others.length === 1 ? walls[others[0]!.wallId] : undefined;
    if (!other || other.type !== 'solid' || !collinear(other, wall)) continue;
    wall = joined(withoutIdentity(other), wall, end);
    remove.push(other.id);
  }
  return { remove, add: [wall] };
}
