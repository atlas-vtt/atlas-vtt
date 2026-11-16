/**
 * Hiding every room: which of a map's rooms (`fogRooms.ts`) still need fog. A room the fog
 * covers all but whole already gets none, so pressing again paints nothing twice; every other is
 * painted whole, as the room it is.
 */

import { intersectShapes } from '../lighting/polygonClip';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { areaOfShape, shapeOf } from './fogOutlineShape';

type Outline = readonly Point[];

/** A room the fog covers more than this share of is hidden already: what is left is the width of its walls' lines. */
const HIDDEN_SHARE = 0.98;

/** The share of `room` that `coverage` covers, from 0 to 1; 0 where the room cannot be read or encloses nothing. */
export function coveredShare(room: Outline, coverage: QShape): number {
  const own = shapeOf(room);
  const whole = own ? areaOfShape(own) : 0;
  if (!own || !(whole > 0) || coverage.length === 0) return 0;
  return areaOfShape(intersectShapes(own, coverage)) / whole;
}

/** Those of `rooms` that `coverage`, the fog of their level, does not hide yet. */
export function roomsToHide(rooms: ReadonlyArray<Outline>, coverage: QShape): Outline[] {
  return rooms.filter((room) => room.length >= 3 && coveredShare(room, coverage) <= HIDDEN_SHARE);
}
