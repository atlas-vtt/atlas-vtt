/**
 * Areas from walls: which of a map's rooms (`fogRooms.ts`) become fog areas. A room that an area
 * already is gets none; every other gets one, fitted to the areas there are like any new area.
 */

import { coveredShare, fittedArea } from './fogAreaShapes';
import type { FogAreaShape } from './fogAreas';
import type { Point } from '../types/visionTypes';

type Outline = readonly Point[];

/** Two outlines that cover more than this share of each other are one room's. */
const SAME_SHARE = 0.95;
/** Such outlines' boxes differ on no side by more than this share of their width or height. */
const BOX_SLACK = 0.1;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxOf(outline: Outline): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of outline) {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  }
  return box;
}

/** Whether every corner of `outline` has one of `other` within `reach` of it. */
const cornersOn = (outline: Outline, other: Outline, reach: number): boolean =>
  outline.every((corner) => other.some((place) => Math.hypot(place.x - corner.x, place.y - corner.y) <= reach));

/**
 * Whether the outline of an area is the room's: the same corners, each within `reach` (a texel
 * of the room's raster) of its like, or the two covering nearly all of each other.
 */
export function isAreaOfRoom(room: Outline, area: Outline, reach: number): boolean {
  if (room.length < 3 || area.length < 3) return false;
  const [a, b] = [boxOf(room), boxOf(area)];
  // Outlines that are one room's lie in boxes that are all but one: no side further apart than a tenth of the box.
  const [wide, high] = [reach + BOX_SLACK * Math.max(a.maxX - a.minX, b.maxX - b.minX), reach + BOX_SLACK * Math.max(a.maxY - a.minY, b.maxY - b.minY)];
  if (Math.abs(a.minX - b.minX) > wide || Math.abs(a.maxX - b.maxX) > wide || Math.abs(a.minY - b.minY) > high || Math.abs(a.maxY - b.maxY) > high) return false;
  if (room.length === area.length && cornersOn(room, area, reach) && cornersOn(area, room, reach)) return true;
  return coveredShare(room, area) > SAME_SHARE && coveredShare(area, room) > SAME_SHARE;
}

/** Which of `areas`, the outlines of a level's areas, is the room's already: its place among them, or -1. */
export function areaOfRoom(room: Outline, areas: ReadonlyArray<Outline>, reach: number): number {
  return areas.findIndex((area) => isAreaOfRoom(room, area, reach));
}

export interface RoomAreaPlan {
  /** The outlines of the areas to make, one per room that is none yet. */
  readonly shapes: FogAreaShape[];
  /** Rooms were left without an area because the level holds as many as it can. */
  readonly full: boolean;
}

/**
 * The areas to make of `rooms`: none for a room that one of `areas` already is, and no more than
 * `most`. Each is fitted to the areas there are, so it ends where they begin.
 */
export function planRoomAreas(rooms: ReadonlyArray<Outline>, areas: ReadonlyArray<Outline>, reach: number, most: number): RoomAreaPlan {
  const shapes: FogAreaShape[] = [];
  let full = false;
  for (const room of rooms) {
    if (areaOfRoom(room, areas, reach) >= 0) continue;
    if (shapes.length >= most) full = true;
    else shapes.push({ type: 'lasso', points: fittedArea(room, areas) });
  }
  return { shapes, full };
}

/** What making areas of a level's rooms came to (the store's `addRoomAreas`). */
export interface RoomAreasMade {
  /** The rooms the walls enclose. */
  rooms: number;
  /** The areas made of them. */
  made: number;
  /** Rooms were left without an area because the level holds as many as it can. */
  full: boolean;
}
