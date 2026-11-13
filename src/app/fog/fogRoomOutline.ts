/**
 * A room's outline from the raster it was found on (`fogRoomRaster.ts`): the edge of its ground
 * runs up to a texel inside the walls, so every stretch of it is moved out onto the centre line
 * of the wall it faces, and where the edge goes from one wall to the next, the corner the two
 * walls make is put between them. Straight walls then give straight edges whose corners are the
 * walls' own ends and crossings, and two rooms meet on the wall between them.
 */

import { sideOf } from '../lighting/wallSides';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { STEP_X, STEP_Y, type GroundPiece, type RoomRaster } from './fogRoomRaster';
import { distance, ON_LINE, outerLoop, SAME_PLACE, simplified, tidied, twiceArea, withoutInnerWalls, type FacedCorner } from './fogRoomRing';

/** How far from two stretches of the edge, in texels, the corners between their walls are looked for: close by, and where nothing is found there, far off, where two walls that run together at last meet. */
const CORNER_REACH = [{ texels: 8, walls: 48 }, { texels: 48, walls: 256 }] as const;
/** How far from two stretches of the edge, in texels, a corner or a wall's end is theirs without looking further. */
const END_REACH = 2;

export interface RoomOutline {
  /** The room's corners in map pixels, clockwise as the map is drawn. */
  readonly outline: Point[];
  /** What it encloses, in square map pixels. */
  readonly area: number;
  /** Rock that rooms close in between them: more of its walls turn their rock side to it than their floor side (`WallSegment.floor`). */
  readonly rock: boolean;
}

/** A stretch of the edge on the wall it faces. */
interface Spot extends FacedCorner {
  /** The place is an end of that wall. */
  readonly end?: true;
}

/** The place on the wall nearest `point`. */
function nearestOn(wall: WallSegment, point: Point): Point {
  const [dx, dy] = [wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y];
  const lengthSq = dx * dx + dy * dy;
  const share = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - wall.p1.x) * dx + (point.y - wall.p1.y) * dy) / lengthSq));
  if (share === 0) return wall.p1;
  if (share === 1) return wall.p2;
  return { x: wall.p1.x + share * dx, y: wall.p1.y + share * dy };
}

/** Where the lines of two walls cross; null where they run alike. */
function crossing(a: WallSegment, b: WallSegment): Point | null {
  const [dx, dy, ex, ey] = [a.p2.x - a.p1.x, a.p2.y - a.p1.y, b.p2.x - b.p1.x, b.p2.y - b.p1.y];
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) < 1e-9 * Math.hypot(dx, dy) * Math.hypot(ex, ey)) return null;
  const share = ((b.p1.x - a.p1.x) * ey - (b.p1.y - a.p1.y) * ex) / denominator;
  return { x: a.p1.x + share * dx, y: a.p1.y + share * dy };
}

/** Where the look from `eye` along the unit way (`wayX`, `wayY`) meets the wall, as a distance from the eye; null where it misses it. */
function sightOf(wall: WallSegment, eye: Point, wayX: number, wayY: number): number | null {
  const [dx, dy] = [wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y];
  const denominator = wayX * dy - wayY * dx;
  if (denominator === 0) return null;
  const far = ((wall.p1.x - eye.x) * dy - (wall.p1.y - eye.y) * dx) / denominator;
  const share = ((wall.p1.x - eye.x) * wayY - (wall.p1.y - eye.y) * wayX) / denominator;
  return far >= 0 && share >= 0 && share <= 1 ? far : null;
}

/**
 * The wall a stretch of the edge faces, and the place on it: what is seen first from the middle
 * of the ground texel `ground`, looking straight across the edge into the barrier texel `barrier`
 * beside it; where no wall of that texel lies in the way (one only clips its corner), the place
 * nearest the eye on the walls that pass it.
 */
function faced(raster: RoomRaster, ground: Point, barrier: number, wayX: number, wayY: number): Spot {
  const { walls, texel } = raster;
  let [wall, away, place]: [number, number, Point] = [-1, Infinity, ground];
  raster.wallsAt(barrier, (index) => {
    const far = sightOf(walls[index]!, ground, wayX, wayY);
    // The barrier texel ends a texel and a half from the eye.
    if (far !== null && far <= 1.5 * texel + SAME_PLACE && far < away) [wall, away, place] = [index, far, { x: ground.x + wayX * far, y: ground.y + wayY * far }];
  });
  if (wall >= 0) return { x: place.x, y: place.y, wall, left: sideOf(walls[wall]!, ground) === 'left' };
  raster.wallsAt(barrier, (index) => {
    const nearest = nearestOn(walls[index]!, ground);
    const far = distance(nearest, ground);
    if (far < away) [wall, away, place] = [index, far, nearest];
  });
  const found = walls[wall];
  const end = found !== undefined && (place === found.p1 || place === found.p2);
  return { x: place.x, y: place.y, wall, left: found !== undefined && sideOf(found, ground) === 'left', ...(end && { end: true as const }) };
}

/**
 * The corner two walls make: the end they share, or the place where they cross or one ends on
 * the other. Null where they do not meet: walls that stop short of each other are joined, where
 * light takes them for joined, by a wall of their own (`sealedWalls`).
 */
function cornerOf(a: WallSegment, b: WallSegment): Point | null {
  for (const end of [a.p1, a.p2]) {
    if (distance(end, b.p1) < SAME_PLACE || distance(end, b.p2) < SAME_PLACE) return end;
  }
  const cross = crossing(a, b);
  if (!cross) return null;
  const onA = nearestOn(a, cross);
  return distance(onA, cross) <= ON_LINE && distance(nearestOn(b, cross), cross) <= ON_LINE ? onA : null;
}

/** The walls that pass within `reach` of the box around two places, in the order of the walls; null where they are more than `most`: a crowded place is taken as the raster shows it. */
function wallsAround(raster: RoomRaster, from: Point, to: Point, reach: number, most: number): number[] | null {
  const { texel, width, height } = raster;
  const column = (x: number): number => Math.min(width - 1, Math.max(0, Math.floor((x - raster.left) / texel)));
  const row = (y: number): number => Math.min(height - 1, Math.max(0, Math.floor((y - raster.top) / texel)));
  const found = new Set<number>();
  for (let y = row(Math.min(from.y, to.y) - reach); y <= row(Math.max(from.y, to.y) + reach); y++) {
    for (let x = column(Math.min(from.x, to.x) - reach); x <= column(Math.max(from.x, to.x) + reach); x++) raster.wallsAt(y * width + x, (index) => found.add(index));
  }
  return found.size > most ? null : [...found].sort((a, b) => a - b);
}

/**
 * The corners on the way round from one wall to another that make no corner right there: the
 * two are joined by walls the ground does not face (the back of a narrow nook, the wall that
 * cuts off a sharp corner's tip, a short piece of a curved wall, the wall that seals a joint).
 * Of the ways from wall to wall over the corners they make with each other within `reach`, the
 * shortest. Null where there is none.
 */
function wayRound(raster: RoomRaster, from: Spot, to: Spot, reach: number, most: number): Point[] | null {
  const { walls } = raster;
  const around = wallsAround(raster, from, to, reach, most);
  if (!around) return null;
  const close = (place: Point): boolean => distance(place, from) <= reach && distance(place, to) <= reach;
  /** For each wall reached: how long the way to it is, the corner at which the way arrives on it, and the wall before it. */
  const reached = new Map<number, { length: number; at: Point; before: number }>([[from.wall, { length: 0, at: from, before: -1 }]]);
  const open = new Set(around);
  open.add(from.wall);
  while (open.size > 0) {
    let nearest = -1;
    for (const wall of open) {
      const way = reached.get(wall);
      if (way && (nearest < 0 || way.length < reached.get(nearest)!.length)) nearest = wall;
    }
    if (nearest < 0 || nearest === to.wall) break;
    open.delete(nearest);
    const way = reached.get(nearest)!;
    for (const next of open) {
      const corner = cornerOf(walls[nearest]!, walls[next]!);
      if (!corner || !close(corner)) continue;
      const length = way.length + distance(way.at, corner) + (next === to.wall ? distance(corner, to) : 0);
      if (length < (reached.get(next)?.length ?? Infinity)) reached.set(next, { length, at: corner, before: nearest });
    }
  }
  if (!reached.has(to.wall)) return null;
  const corners: Point[] = [];
  for (let wall = to.wall; wall !== from.wall; wall = reached.get(wall)!.before) corners.unshift(reached.get(wall)!.at);
  return corners;
}

/**
 * What lies between two stretches of the edge that face different walls: the corner the walls
 * make where it is right there; else the corners on the shortest way round from one to the
 * other, close by or, for the tip of a sharp corner the ground is too coarse to reach into, far
 * off; else the ends at which the edge leaves one wall and takes up the other; else the corner
 * the walls make farther off still.
 */
function between(raster: RoomRaster, from: Spot, to: Spot): Point[] {
  const a = raster.walls[from.wall]!;
  const b = raster.walls[to.wall]!;
  const near = (place: Point): boolean => distance(place, from) <= END_REACH * raster.texel && distance(place, to) <= END_REACH * raster.texel;
  const corner = cornerOf(a, b);
  // No wall can lie between the edge and a corner this close without the ground facing it.
  if (corner && near(corner)) return [corner];
  for (const { texels, walls } of CORNER_REACH) {
    const round = wayRound(raster, from, to, texels * raster.texel, walls);
    if (round) return round;
  }
  const leaves = distance(a.p1, to) <= distance(a.p2, to) ? a.p1 : a.p2;
  const takesUp = distance(b.p1, from) <= distance(b.p2, from) ? b.p1 : b.p2;
  const ends = [leaves, takesUp].filter(near);
  if (ends.length > 0) return ends;
  return corner ? [corner] : [];
}

/** The end of a wall nearest `corner` within a texel of it, or the corner itself. */
function onWallEnd(raster: RoomRaster, corner: Point): Point {
  const column = Math.floor((corner.x - raster.left) / raster.texel);
  const row = Math.floor((corner.y - raster.top) / raster.texel);
  let best = corner;
  let reach = raster.texel;
  for (let y = Math.max(0, row - 1); y <= Math.min(raster.height - 1, row + 1); y++) {
    for (let x = Math.max(0, column - 1); x <= Math.min(raster.width - 1, column + 1); x++) {
      raster.wallsAt(y * raster.width + x, (index) => {
        for (const end of [raster.walls[index]!.p1, raster.walls[index]!.p2]) {
          const away = distance(end, corner);
          if (away < reach) [best, reach] = [end, away];
        }
      });
    }
  }
  return best;
}

/** The outline of `piece`, a closed piece of the raster's ground; null where what the walls leave of it encloses nothing. */
export function roomOutline(raster: RoomRaster, piece: GroundPiece): RoomOutline | null {
  const { texel, left, top, walls } = raster;
  const edge = raster.edgeOf(piece);
  /** Corners that lie somewhere along a wall: where the outline bends at one, no wall's corner was found for it. */
  const loose = new Set<Point>();
  let [floorSides, rockSides] = [0, 0];
  const spots: Spot[] = [];
  for (let at = 0; at < edge.length; at += 3) {
    const [column, row, way] = [edge[at]!, edge[at + 1]!, edge[at + 2]!];
    // The ground texel this stretch of the edge runs along, and the way across the edge, out of the room.
    const [groundX, groundY] = [way === 0 || way === 3 ? column : column - 1, way === 0 || way === 1 ? row : row - 1];
    const [wayX, wayY] = [STEP_Y[way]!, -STEP_X[way]!];
    const ground = { x: left + (groundX + 0.5) * texel, y: top + (groundY + 0.5) * texel };
    const spot = faced(raster, ground, (groundY + wayY) * raster.width + groundX + wayX, wayX, wayY);
    if (!spot.end) loose.add(spot);
    spots.push(spot);
    const floor = walls[spot.wall]?.floor;
    if (floor !== 'left' && floor !== 'right') continue;
    if ((floor === 'left') === spot.left) floorSides++;
    else rockSides++;
  }

  const ring: Array<Point | Spot> = [];
  spots.forEach((spot, index) => {
    const next = spots[(index + 1) % spots.length]!;
    ring.push(spot);
    if (spot.wall >= 0 && next.wall >= 0 && spot.wall !== next.wall) ring.push(...between(raster, spot, next));
  });
  const corners = simplified(tidied(outerLoop(tidied(withoutInnerWalls(ring, walls, 1.5 * texel)))));
  const outline = tidied(corners.map((corner) => (loose.has(corner) ? onWallEnd(raster, corner) : corner))).map(({ x, y }) => ({ x, y }));
  const area = twiceArea(outline) / 2;
  if (outline.length < 3 || area < texel * texel) return null;
  return { outline, area, rock: rockSides > floorSides };
}
