import { Q_SCALE, type QPolygon } from '../types/shapeTypes';
import type { WallSegment } from '../types/wallTypes';
import { wallList } from '../vision/wallList';
import { BASE_TEXEL } from './lightingConstants';
import { inflatePolyline, inflateShape, normalizePolygon, subtractShapes, unionShapes } from './polygonClip';
import { quantizeCoordinate } from './quantizedPoint';
import { outlinesWithHoles, type RoomArea } from './rooms';
import { sealedWalls } from './sealWalls';
import { boxAround, segmentGrid, type SegmentGrid } from './segmentGrid';
import { shapeContainment, shapeContains } from './shapeContains';
import { along, beside, distanceTo, edgesWithShapeOnLeft, lengthOf, sideOf, type Segment as Line } from './wallSides';

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
 *
 * And a room need not be closed: an entrance without a door, a side left open. Where a wall that
 * knows its floor side ends in the open, the opening is closed for this question alone
 * (`openingClosures`), never for light or sight, and the room behind it is floor as far as that line.
 */

/** Half the width of the strip a wall is given while spaces are told apart, in eighth pixels: a pixel. */
const STRIP = Q_SCALE;
/** How far around the walls the map is looked at, in eighth pixels: whatever reaches this edge is no closed space. */
const MARGIN = 64 * Q_SCALE;
/** A space smaller than this, in square pixels, is a sliver between walls and no room. */
const LEAST_AREA = 64;

/** The strips kept from one question to the next, and the most of them: several maps' walls. */
const strips = new Map<string, readonly QPolygon[]>();
const MOST_STRIPS = 50_000;

/**
 * The strip of a wall with these ends (eighth pixels). Making one is a pass of the clipping
 * library, and an edit changes a few walls of thousands, so the strips are kept by their ends.
 */
function stripOf(line: readonly number[]): readonly QPolygon[] {
  const key = line.join(',');
  let strip = strips.get(key);
  if (!strip) {
    if (strips.size >= MOST_STRIPS) strips.clear();
    strips.set(key, strip = inflatePolyline(line, STRIP));
  }
  return strip;
}

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
    const covered: QPolygon[] = [];
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { p1, p2 } of walls) {
      const line = [quantizeCoordinate(p1.x), quantizeCoordinate(p1.y), quantizeCoordinate(p2.x), quantizeCoordinate(p2.y)];
      covered.push(...stripOf(line));
      left = Math.min(left, line[0]!, line[2]!);
      right = Math.max(right, line[0]!, line[2]!);
      top = Math.min(top, line[1]!, line[3]!);
      bottom = Math.max(bottom, line[1]!, line[3]!);
    }
    const [x0, y0, x1, y1] = [left - MARGIN, top - MARGIN, right + MARGIN, bottom + MARGIN];
    const free = subtractShapes(normalizePolygon([x0, y0, x1, y0, x1, y1, x0, y1]), unionShapes(covered, []));
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
/** The open ends each open end is joined to, and the open ends past which a map's openings are left alone. */
const NEAREST_ENDS = 4;
const MOST_OPEN_ENDS = 400;

const knowsFloor = (wall: WallSegment): boolean => wall.floor === 'left' || wall.floor === 'right';
/** Whether `line` runs along an outline, whose edges are filed for what comes within `ON_OUTLINE` of a place. */
const runsAlong = (line: Line, outline: SegmentGrid<Line>): boolean => [0.1, 0.5, 0.9].every((share) => {
  const point = along(line, share);
  return outline.near(point).some((edge) => distanceTo(edge, point) <= ON_OUTLINE);
});

/** Whether two lines cross between their ends: lines that only meet at an end do not. */
function cross(a: Line, b: Line): boolean {
  const [dx, dy, ex, ey] = [a.p2.x - a.p1.x, a.p2.y - a.p1.y, b.p2.x - b.p1.x, b.p2.y - b.p1.y];
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) < 1e-9) return false;
  const t = ((b.p1.x - a.p1.x) * ey - (b.p1.y - a.p1.y) * ex) / denominator;
  const u = ((b.p1.x - a.p1.x) * dy - (b.p1.y - a.p1.y) * dx) / denominator;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

/** How near another wall comes to a wall's end for the two to be joined there, in pixels. */
const JOINED = 1.5;

/**
 * Lines across the openings of rooms: an entrance without a door, a side left open. A wall that
 * knows its floor side and has no closed space on that side (`closed`, the spaces walls close in by
 * themselves) stands at an open room, and an end of it that no other wall meets is where the
 * room's walls stop. Each such end is joined to the wall ends nearest it, open or not (the far
 * jamb of an entrance is open too, the corner a missing side ran to is not), that it reaches
 * without crossing a wall or running along one. A line too many only divides the room, each part
 * floor by what is seen from inside it (`floorOf`); one too few would leave the room rock.
 */
export function openingClosures(walls: readonly WallSegment[], closed: readonly RoomArea[]): Line[] {
  const real = walls.filter(finite);
  const ends = real.flatMap((wall) => [wall.p1, wall.p2].map((point) => ({ point, wall })));
  const atOpenRoom = (wall: WallSegment): boolean => {
    if (!knowsFloor(wall)) return false;
    const inside = beside(wall, 0.5, wall.floor === 'left' ? 'left' : 'right', Math.min(ASIDE, lengthOf(wall) / 2));
    return !closed.some((space) => shapeContains(space, inside));
  };
  // Nearly every end is joined to another wall, which the walls near it tell: the room behind a wall is asked for only at the few that are not.
  const joined = segmentGrid(real, JOINED);
  const open = ends.filter(({ point, wall }) => !joined.near(point).some((other) => other !== wall && distanceTo(other, point) <= JOINED) && atOpenRoom(wall));
  if (open.length === 0 || open.length > MOST_OPEN_ENDS) return [];
  const closures = new Map<string, Line>();
  const key = (point: { x: number; y: number }): string => `${Math.round(point.x * 8)},${Math.round(point.y * 8)}`;
  for (const end of open) {
    const from = key(end.point);
    const near = (among: typeof ends, most: number): void => {
      const others = among
        .map((other) => ({ other, to: key(other.point), distance: Math.hypot(other.point.x - end.point.x, other.point.y - end.point.y) }))
        .filter(({ to }) => to !== from)
        .sort((a, b) => a.distance - b.distance);
      const seen = new Set<string>();
      for (const { other, to } of others) {
        if (seen.size >= most) break;
        if (seen.has(to)) continue;
        const line = { p1: end.point, p2: other.point };
        // A line along a wall closes nothing, and one across a wall is no opening.
        if (real.some((wall) => cross(line, wall) || distanceTo(wall, along(line, 0.5)) <= 0.5)) continue;
        seen.add(to);
        closures.set(from < to ? `${from}|${to}` : `${to}|${from}`, line);
      }
    };
    near(ends, NEAREST_ENDS);
    near(open, 2);
  }
  return [...closures.values()];
}

/** How the walls along a space's outline turn to it, each for its length: `walls` are ones that know their floor side. */
function sidesOf(space: RoomArea, outline: SegmentGrid<Line>, walls: readonly WallSegment[]): { floor: number; rock: number } {
  const inside = shapeContainment(space);
  let [floor, rock] = [0, 0];
  for (const wall of walls) {
    const length = lengthOf(wall);
    if (!(length > 0) || !runsAlong(wall, outline)) continue;
    const step = Math.min(ASIDE, length / 2);
    const onLeft = inside(beside(wall, 0.5, 'left', step));
    const onRight = inside(beside(wall, 0.5, 'right', step));
    if (onLeft === onRight) continue;
    if ((wall.floor === 'left') === onLeft) floor += length;
    else rock += length;
  }
  return { floor, rock };
}

/** The directions looked in from a point, and the points of a space tried for the one deepest inside it. */
const DIRECTIONS = 32;
const GRID = 9;

/** A point of `space` far from its outline: the best of a grid over it, or null for a space too thin to hold one. */
function deepPoint(space: RoomArea, outline: readonly Line[]): { x: number; y: number } | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { p1 } of outline) {
    left = Math.min(left, p1.x);
    right = Math.max(right, p1.x);
    top = Math.min(top, p1.y);
    bottom = Math.max(bottom, p1.y);
  }
  let best: { x: number; y: number } | null = null;
  let depth = 0;
  for (let column = 1; column < GRID; column++) {
    for (let row = 1; row < GRID; row++) {
      const point = { x: left + ((right - left) * column) / GRID, y: top + ((bottom - top) * row) / GRID };
      if (!shapeContains(space, point)) continue;
      const clear = outline.reduce((least, edge) => Math.min(least, distanceTo(edge, point)), Infinity);
      if (clear > depth) [best, depth] = [point, clear];
    }
  }
  return best;
}

/**
 * What stands round a point: of the directions looked in from it, how many end at the floor side
 * of a wall that knows it and how many at a rock side or at no wall at all. Inside a room, open
 * or not, most directions end at its walls' floor sides; out in the open or in rock between
 * rooms, most do not.
 */
function seenFrom(point: { x: number; y: number }, walls: readonly WallSegment[]): { floor: number; rock: number } {
  let [floor, rock] = [0, 0];
  for (let index = 0; index < DIRECTIONS; index++) {
    // Off the axes, so a look never runs along a wall drawn on the grid.
    const angle = ((index + 0.37) / DIRECTIONS) * 2 * Math.PI;
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    let nearest = Infinity;
    let hit: WallSegment | null = null;
    for (const wall of walls) {
      const [ex, ey] = [wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y];
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-12) continue;
      const t = ((wall.p1.x - point.x) * ey - (wall.p1.y - point.y) * ex) / denominator;
      const u = ((wall.p1.x - point.x) * dy - (wall.p1.y - point.y) * dx) / denominator;
      if (t > 0 && t < nearest && u >= 0 && u <= 1) [nearest, hit] = [t, wall];
    }
    if (!hit) rock++;
    else if (knowsFloor(hit)) {
      if (sideOf(hit, point) === hit.floor) floor++;
      else rock++;
    }
  }
  return { floor, rock };
}

/**
 * The floor the walls make: the rooms they close in, open rooms as far as the lines across their
 * openings, and no rock between rooms. A space walls close in by themselves is a room unless more
 * of them turn their rock side to it. A space that an opening's line helps close stands for no
 * such thing by itself, since the line is no wall: it is floor where, from deep inside it, most
 * directions end at the floor side of a wall.
 */
export function floorOf(walls: readonly WallSegment[]): RoomArea[] {
  const sealed = sealedWalls(walls, BASE_TEXEL);
  const closed = enclosedSpaces(sealed);
  const closures = openingClosures(walls, closed);
  const real = walls.filter(finite);
  // A map has many closed pockets, most of them small: each asks only the walls beside it.
  const sided = segmentGrid(walls.filter(knowsFloor), ON_OUTLINE);
  const floors = (closures.length === 0 ? closed : enclosedSpaces([...sealed, ...closures])).filter((space) => {
    const outline = edgesWithShapeOnLeft(space);
    const around = boxAround(outline);
    if (!around) return false;
    const filed = segmentGrid(outline, ON_OUTLINE);
    if (!closures.some((line) => runsAlong(line, filed))) {
      const { floor, rock } = sidesOf(space, filed, sided.touching(around));
      return rock <= floor;
    }
    const point = deepPoint(space, outline);
    if (!point) return false;
    const { floor, rock } = seenFrom(point, real);
    return floor > rock;
  });
  if (closures.length === 0) return floors;
  // The lines across openings are no walls: where floor lies to both sides of one, the strip it was
  // given while the spaces were told apart is floor too, and the two sides are one floor without a seam.
  const onFloor = (point: { x: number; y: number }): boolean => floors.some((space) => shapeContains(space, point));
  const seams = closures.filter((line) => {
    const step = Math.min(ASIDE, lengthOf(line) / 2);
    // Asked at several places: where two such lines cross, the place beside one lies on the other.
    return [0.15, 0.3, 0.5, 0.7, 0.85].filter((share) => onFloor(beside(line, share, 'left', step)) && onFloor(beside(line, share, 'right', step))).length >= 3;
  }).flatMap((line) => inflatePolyline([line.p1.x, line.p1.y, line.p2.x, line.p2.y].map(quantizeCoordinate), STRIP + 1));
  const welded = unionShapes([...floors.flat(), ...seams], []);
  return outlinesWithHoles(welded).map(({ outline, holes }) => [outline, ...holes] as RoomArea);
}

const cache = new WeakMap<Record<string, WallSegment>, readonly RoomArea[]>();

/** The floor of a level's walls (`levelObjects(state).walls`, `floorOf`); the same answer while the record stays. */
export function wallSpaces(walls: Record<string, WallSegment>): readonly RoomArea[] {
  let spaces = cache.get(walls);
  if (!spaces) cache.set(walls, spaces = floorOf(wallList(walls)));
  return spaces;
}
