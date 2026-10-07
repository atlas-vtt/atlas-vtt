import type { Point } from '../types/visionTypes';
import type { WallChannel, WallSegment } from '../types/wallTypes';
import { blocksNothing, concerns } from '../lighting/segments';
import { distSqToSegment, isOnBlockingSide } from './visionGeometry';

/**
 * Whether `wall` stops what comes from `origin`: open doors never do, one-way walls only from
 * one side, and a wall that blocks one thing only stops `channel` when that is its thing.
 * Without a channel every wall counts whatever it blocks, so a caller that forgets to say what
 * it asks for is stopped by more walls, never by fewer.
 */
export function blocksFrom(wall: WallSegment, origin: Point, channel?: WallChannel): boolean {
  if (blocksNothing(wall) || (channel && !concerns(wall, channel))) return false;
  return !wall.direction || isOnBlockingSide(origin, wall.p1, wall.p2, wall.direction);
}

/** Whether `wall` blocks `channel` from `origin` and comes within `radius` of it (`radiusSq` = radius²). */
export function blocksInReach(wall: WallSegment, origin: Point, radiusSq: number, channel?: WallChannel): boolean {
  return blocksFrom(wall, origin, channel) && distSqToSegment(origin, wall.p1, wall.p2) <= radiusSq;
}
