/**
 * Hiding every room: which of a map's rooms (`fogRooms.ts`) become fog areas, remembered pieces
 * of fog. A room that an area already is gets none (a revealed one is hidden again), nor does
 * one the areas there are cover most of (a room the GM hid a shape in by hand); every other gets
 * one, fitted to the areas there are like any new area.
 */

import { coveredShare, coveredShareOfAll, fittedArea } from './fogAreaShapes';
import type { FogAreaShape } from './fogAreas';
import type { Point } from '../types/visionTypes';

type Outline = readonly Point[];

/** Two outlines that cover more than this share of each other are one room's. */
const SAME_SHARE = 0.95;
/** A room the areas there are cover more than this share of, together, has its area. */
const COVERED_SHARE = 0.5;
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

/** A remembered piece as the plan reads it. */
export interface RoomPiece {
  readonly outline: Outline;
  /** Whether it hides what it covers. */
  readonly hidden: boolean;
}

export interface RoomAreaPlan {
  /** The outlines of the areas to make, one per room that is none yet. */
  readonly shapes: FogAreaShape[];
  /** The places among the pieces of those that are a room and revealed: they are hidden again. */
  readonly hide: number[];
}

/**
 * What hides `rooms`: no new area for a room that one of `pieces` already is (that piece is
 * hidden again where it is revealed) or that `pieces` cover more than half of together. Each
 * new one is fitted to the areas there are, so it ends where they begin.
 */
export function planRoomAreas(rooms: ReadonlyArray<Outline>, pieces: ReadonlyArray<RoomPiece>, reach: number): RoomAreaPlan {
  const areas = pieces.map((piece) => piece.outline);
  const shapes: FogAreaShape[] = [];
  const hide = new Set<number>();
  for (const room of rooms) {
    const own = areaOfRoom(room, areas, reach);
    if (own >= 0) {
      if (!pieces[own]!.hidden) hide.add(own);
      continue;
    }
    if (coveredShareOfAll(room, areas) <= COVERED_SHARE) shapes.push({ type: 'lasso', points: fittedArea(room, areas) });
  }
  return { shapes, hide: [...hide] };
}

/** What hiding a level's rooms came to (the store's `addRoomAreas`). */
export interface RoomAreasMade {
  /** The rooms the walls enclose. */
  rooms: number;
  /** The rooms hidden: those an area was made of, and those whose area was revealed. */
  made: number;
}
