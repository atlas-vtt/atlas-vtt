import { Q_SCALE, type QPolygon } from '../types/shapeTypes';
import type { WallSegment } from '../types/wallTypes';
import { wallList } from '../vision/wallList';
import { BASE_TEXEL } from './lightingConstants';
import { inflatePolyline, inflateShape, normalizePolygon, subtractShapes, unionShapes } from './polygonClip';
import { quantizeCoordinate } from './quantizedPoint';
import { outlinesWithHoles, type RoomArea } from './rooms';
import { sealedWalls } from './sealWalls';
import { shapeContains } from './shapeContains';
import { along, beside, distanceTo, edgesWithShapeOnLeft, lengthOf } from './wallSides';

/**
 * The spaces walls close in: the rooms of a map, which are nothing but its walls. A space is what a
 * wall on every side keeps from the rest of the map: walls of any kind, doors open or closed, and
 * the bridges that seal a joint for light and sight (`sealedWalls`), so a space is closed here
 * exactly where it is closed for them. The rooms mode asks for them to tell floor from rock.
 *
 * Not every closed space is a room: rock that rooms and corridors close in between them is closed
 * too. The walls the rooms mode makes say which side their floor lies on (`WallSegment.floor`),
 * and a space is rock where more of its walls turn their rock side to it than their floor side.
 * A space of walls drawn by hand, which say nothing, is a room.
 */

/** Half the width of the strip a wall is given while spaces are told apart, in eighth pixels: a pixel. */
const STRIP = Q_SCALE;
/** How far around the walls the map is looked at, in eighth pixels: whatever reaches this edge is no closed space. */
const MARGIN = 64 * Q_SCALE;
/** A space smaller than this, in square pixels, is a sliver between walls and no room. */
const LEAST_AREA = 64;

type Segment = Pick<WallSegment, 'p1' | 'p2'>;

const finite = ({ p1, p2 }: Segment): boolean => [p1.x, p1.y, p2.x, p2.y].every(Number.isFinite) && (p1.x !== p2.x || p1.y !== p2.y);

function areaOfRing(ring: QPolygon): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const next = (i + 2) % ring.length;
    twice += ring[i]! * ring[next + 1]! - ring[next]! * ring[i + 1]!;
  }
  return twice / 2 / (Q_SCALE * Q_SCALE);
}

/**
 * Every space the segments close in, each reaching the middle of its walls. Walls are given a strip
 * a pixel to either side; what the strips leave of the map falls into pieces, and every piece but
 * the one that reaches the map's edge is a closed space, grown back by that pixel (its corners are
 * within a fraction of a pixel of the walls' ends; nothing is kept of it, so it is not cleaned up
 * further). A wall standing free inside a space takes nothing from it, and a closed pillar is a hole in it.
 */
export function enclosedSpaces(segments: readonly Segment[]): RoomArea[] {
  const walls = segments.filter(finite);
  if (walls.length < 3) return [];
  try {
    const strips: QPolygon[] = [];
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { p1, p2 } of walls) {
      const line = [quantizeCoordinate(p1.x), quantizeCoordinate(p1.y), quantizeCoordinate(p2.x), quantizeCoordinate(p2.y)];
      strips.push(...inflatePolyline(line, STRIP));
      left = Math.min(left, line[0]!, line[2]!);
      right = Math.max(right, line[0]!, line[2]!);
      top = Math.min(top, line[1]!, line[3]!);
      bottom = Math.max(bottom, line[1]!, line[3]!);
    }
    const [x0, y0, x1, y1] = [left - MARGIN, top - MARGIN, right + MARGIN, bottom + MARGIN];
    const free = subtractShapes(normalizePolygon([x0, y0, x1, y0, x1, y1, x0, y1]), unionShapes(strips, []));
    return outlinesWithHoles(free)
      // The piece around everything reaches the edge that was looked at.
      .filter(({ outline }) => !outline.some((value, index) => (index % 2 === 0 ? value === x0 || value === x1 : value === y0 || value === y1)))
      .map(({ outline, holes }) => inflateShape([outline, ...holes], STRIP, 'miter') as RoomArea)
      .filter((space) => space.reduce((sum, ring) => sum + areaOfRing(ring), 0) >= LEAST_AREA);
  } catch (error) {
    // Walls outside what a shape can hold (a damaged file): no space is told apart.
    if (error instanceof RangeError) return [];
    throw error;
  }
}

/** How near a space's outline a wall runs to be one of its walls, and how far to its side the space is looked for, in pixels. */
const ON_OUTLINE = 1.5;
const ASIDE = 3;

/**
 * Whether a closed space is rock closed in by rooms, not a room: the walls along its outline that
 * know their floor side are asked, each for its length, and the space is rock where more of them
 * turn their rock side to it.
 */
export function isRockBetweenRooms(space: RoomArea, walls: readonly WallSegment[]): boolean {
  const outline = edgesWithShapeOnLeft(space);
  let [floor, rock] = [0, 0];
  for (const wall of walls) {
    if (wall.floor !== 'left' && wall.floor !== 'right') continue;
    const length = lengthOf(wall);
    if (!(length > 0) || ![0.1, 0.5, 0.9].every((share) => outline.some((edge) => distanceTo(edge, along(wall, share)) <= ON_OUTLINE))) continue;
    const step = Math.min(ASIDE, length / 2);
    const onLeft = shapeContains(space, beside(wall, 0.5, 'left', step));
    const onRight = shapeContains(space, beside(wall, 0.5, 'right', step));
    if (onLeft === onRight) continue;
    if ((wall.floor === 'left') === onLeft) floor += length;
    else rock += length;
  }
  return rock > floor;
}

const cache = new WeakMap<Record<string, WallSegment>, readonly RoomArea[]>();

/**
 * The floor of a level's walls (`levelObjects(state).walls`): the spaces they close in that are
 * rooms, without the rock between rooms. The same answer while the record stays.
 */
export function wallSpaces(walls: Record<string, WallSegment>): readonly RoomArea[] {
  let spaces = cache.get(walls);
  if (!spaces) {
    const list = wallList(walls);
    cache.set(walls, spaces = enclosedSpaces(sealedWalls(list, BASE_TEXEL)).filter((space) => !isRockBetweenRooms(space, list)));
  }
  return spaces;
}
