import { simplifyStroke } from '../pixi/lighting/wallEdits';
import { Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { wallList } from '../vision/wallList';
import { BASE_TEXEL } from './lightingConstants';
import { inflatePolyline, inflateShape, normalizePolygon, subtractShapes, unionShapes } from './polygonClip';
import { quantizeCoordinate } from './quantizedPoint';
import { outlinesWithHoles, type RoomArea } from './rooms';
import { sealedWalls } from './sealWalls';

/**
 * The spaces walls close in: the rooms of a map, which are nothing but its walls. A space is what a
 * wall on every side keeps from the rest of the map: walls of any kind, doors open or closed, and
 * the bridges that seal a joint for light and sight (`sealedWalls`), so a space is closed here
 * exactly where it is closed for them. The rooms mode asks for them to tell floor from rock.
 */

/** Half the width of the strip a wall is given while spaces are told apart, in eighth pixels: a pixel. */
const STRIP = Q_SCALE;
/** How far around the walls the map is looked at, in eighth pixels: whatever reaches this edge is no closed space. */
const MARGIN = 64 * Q_SCALE;
/** A corner this near a wall's end, in pixels, is that end. */
const SNAP = 1.5;
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

/** A space's corners put on the wall ends they stand for, and those that add nothing left out. */
function settled(space: QShape, ends: readonly Point[]): RoomArea {
  const reach = SNAP * SNAP;
  const rings = space.flatMap((ring) => {
    const corners: Point[] = [];
    for (let i = 0; i < ring.length; i += 2) {
      const corner = { x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE };
      let nearest: Point | null = null;
      let least = reach;
      for (const end of ends) {
        const distance = (end.x - corner.x) ** 2 + (end.y - corner.y) ** 2;
        if (distance <= least) {
          least = distance;
          nearest = end;
        }
      }
      corners.push(nearest ?? corner);
    }
    // Round wall ends leave a run of corners where a space turns round one: a third of a pixel says which stay.
    const simpler = simplifyStroke([...corners, corners[0]!], 1 / 3).slice(0, -1);
    return simpler.length >= 3 ? [simpler.flatMap((p) => [quantizeCoordinate(p.x), quantizeCoordinate(p.y)])] : [];
  });
  return rings.length === 0 ? [] : (unionShapes(rings, []) as RoomArea);
}

/**
 * Every space the segments close in, each reaching the middle of its walls. Walls are given a strip
 * a pixel to either side; what the strips leave of the map falls into pieces, and every piece but
 * the one that reaches the map's edge is a closed space, grown back by that pixel. A wall standing
 * free inside a space takes nothing from it, and a closed pillar is a hole in it.
 */
export function enclosedSpaces(segments: readonly Segment[]): RoomArea[] {
  const walls = segments.filter(finite);
  if (walls.length < 3) return [];
  try {
    const strips: QPolygon[] = [];
    const ends: Point[] = [];
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { p1, p2 } of walls) {
      const line = [quantizeCoordinate(p1.x), quantizeCoordinate(p1.y), quantizeCoordinate(p2.x), quantizeCoordinate(p2.y)];
      strips.push(...inflatePolyline(line, STRIP));
      ends.push(p1, p2);
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
      .map(({ outline, holes }) => settled(inflateShape([outline, ...holes], STRIP, 'miter'), ends))
      .filter((space) => space.reduce((sum, ring) => sum + areaOfRing(ring), 0) >= LEAST_AREA);
  } catch (error) {
    // Walls outside what a shape can hold (a damaged file): no space is told apart.
    if (error instanceof RangeError) return [];
    throw error;
  }
}

const cache = new WeakMap<Record<string, WallSegment>, readonly RoomArea[]>();

/** The closed spaces of a level's walls (`levelObjects(state).walls`); the same answer while the record stays. */
export function wallSpaces(walls: Record<string, WallSegment>): readonly RoomArea[] {
  let spaces = cache.get(walls);
  if (!spaces) cache.set(walls, spaces = enclosedSpaces(sealedWalls(wallList(walls), BASE_TEXEL)));
  return spaces;
}
