/**
 * Rooms from walls: the ground a level's walls enclose around a point, and every such room of a
 * map. Exact where the structure is known: they read the walls, never the picture. A room ends
 * at every wall that stops sight, at doors open or closed and at walls that stop it one way
 * only, with the joints closed that light and sight take for closed (`sealedWalls`); a wall that
 * stops only light, or only a token, ends none. Ground that runs out to the map's edge is no room.
 *
 * The map is told apart on a raster (`fogRoomRaster.ts`) and each room's outline put back on the
 * walls' centre lines (`fogRoomOutline.ts`). On the raster a wall is a texel thick, so a passage
 * narrower than two texels may read as closed, and a room that narrow as none.
 */

import type { MapRect } from '../grid/cellNumbering';
import { worldTexel } from '../lighting/lightingConstants';
import { sealedWalls } from '../lighting/sealWalls';
import { concerns } from '../lighting/segments';
import { distanceTo, sideOf } from '../lighting/wallSides';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { pointInPolygon } from '../vision/visibility';
import { withoutEnclosed } from './fogRoomHoles';
import { roomOutline, type RoomOutline } from './fogRoomOutline';
import { ringWork, type RingWork } from './fogRoomRing';
import { RoomRaster, roomTexel, type GroundPiece } from './fogRoomRaster';

export { roomTexel };

/** A room's corners in map pixels. The same array for the same room while the walls stay. */
export type RoomCorners = readonly Point[];

/** A room is at least this share of a cell, by area, to be one of a map's rooms. */
const LEAST_CELLS = 0.5;
/** A point nearer than this to a wall's centre line, in map pixels, lies on the wall: on neither side of it. */
const ON_WALL = 1e-6;
/** The pieces of closed ground inside a room that are taken out of it: of more (walls strewn across a room by the thousand), the largest. */
const MOST_ENCLOSED = 128;
/** The texels beside a texel: across its edges first, then across its corners. */
const BESIDE = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const;

/** Whether a wall ends a room: it has a length, and stops sight (a door does, open too). */
function endsRoom(wall: WallSegment): boolean {
  const { p1, p2 } = wall;
  return concerns(wall, 'sight') && [p1.x, p1.y, p2.x, p2.y].every(Number.isFinite) && (p1.x !== p2.x || p1.y !== p2.y);
}

const roomWalls = new WeakMap<readonly WallSegment[], boolean>();

/** Whether `walls`, the walls of a level (`wallList`), hold one that ends a room. The same answer while the list stays. */
export function hasRoomWalls(walls: readonly WallSegment[]): boolean {
  let has = roomWalls.get(walls);
  if (has === undefined) roomWalls.set(walls, has = walls.some(endsRoom));
  return has;
}

function isMap(rect: MapRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

/** The rooms of one level's walls on one map: found as they are asked for, each once. */
class RoomMap {
  private readonly raster: RoomRaster;
  /** The outline of each closed piece of ground that was asked for; null where it encloses nothing. */
  private readonly outlines = new Map<GroundPiece, RoomOutline | null>();
  /** The same without regard to what the piece encloses: its outer walls alone. */
  private readonly outers = new Map<GroundPiece, RoomOutline | null>();
  private all: readonly RoomCorners[] | null = null;

  constructor(walls: readonly WallSegment[], private readonly mapRect: MapRect, private readonly cell: number) {
    this.raster = new RoomRaster(sealedWalls(walls, worldTexel(mapRect)).filter(endsRoom), mapRect, roomTexel(mapRect, cell));
  }

  roomAt(point: Point): RoomCorners | null {
    const { x, y, width, height } = this.mapRect;
    if (!(point.x >= x && point.y >= y && point.x <= x + width && point.y <= y + height)) return null;
    const piece = this.raster.pieceAt(this.groundAt(point));
    return piece && !piece.open ? this.outlineOf(piece)?.outline ?? null : null;
  }

  /**
   * The ground texel the point lies on, or -1. A point in a texel that a wall passes lies on the
   * ground of the texel beside it that is on its side of every such wall, unless it lies on a wall.
   */
  private groundAt(point: Point): number {
    const { raster } = this;
    const texel = raster.texelAt(point.x, point.y);
    if (texel < 0 || raster.barrier[texel] === 0) return texel;
    const walls: WallSegment[] = [];
    raster.wallsAt(texel, (index) => walls.push(raster.walls[index]!));
    if (walls.some((wall) => distanceTo(wall, point) < ON_WALL)) return -1;
    const column = texel % raster.width;
    const row = (texel - column) / raster.width;
    for (const [dx, dy] of BESIDE) {
      const [x, y] = [column + dx, row + dy];
      if (x < 0 || y < 0 || x >= raster.width || y >= raster.height || raster.barrier[y * raster.width + x] === 1) continue;
      const middle = { x: raster.left + (x + 0.5) * raster.texel, y: raster.top + (y + 0.5) * raster.texel };
      if (walls.every((wall) => sideOf(wall, middle) === sideOf(wall, point))) return y * raster.width + x;
    }
    return -1;
  }

  rooms(): readonly RoomCorners[] {
    if (this.all) return this.all;
    const least = Number.isFinite(this.cell) && this.cell > 0 ? LEAST_CELLS * this.cell * this.cell : 0;
    const rooms: RoomCorners[] = [];
    for (const piece of this.raster.allPieces()) {
      const room = piece.open ? null : this.outlineOf(piece);
      // Rock that rooms close in between them is closed too, and no room.
      if (room && !room.rock && room.area >= least) rooms.push(room.outline);
    }
    return (this.all = rooms);
  }

  private outlineOf(piece: GroundPiece): RoomOutline | null {
    let outline = this.outlines.get(piece);
    if (outline === undefined) {
      const outer = this.outerOf(piece);
      const holed = outer && withoutEnclosed(outer.outline, this.enclosedBy(piece, outer.outline));
      this.outlines.set(piece, outline = outer && holed ? { ...outer, ...holed } : outer);
    }
    return outline;
  }

  private outerOf(piece: GroundPiece, work?: RingWork): RoomOutline | null {
    let outer = this.outers.get(piece);
    if (outer === undefined) this.outers.set(piece, outer = roomOutline(this.raster, piece, work));
    return outer;
  }

  /** The outer outlines of the closed ground inside `outline`, the outer outline of `piece`: rooms and rock that walls close off within it. */
  private enclosedBy(piece: GroundPiece, outline: readonly Point[]): Point[][] {
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { x, y } of outline) [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    const corners = [...outline];
    // Ground lies inside the outline whole or not at all: walls part the two.
    const inside = this.raster.piecesIn(left, top, right, bottom).filter((other) => other !== piece && !other.open && pointInPolygon(this.raster.placeIn(other), corners));
    if (inside.length > MOST_ENCLOSED) inside.sort((a, b) => b.size - a.size).splice(MOST_ENCLOSED);
    // All of them together may cost what one room may.
    const work = ringWork();
    return inside.flatMap((other) => {
      const outer = this.outerOf(other, work);
      return outer ? [outer.outline] : [];
    });
  }
}

/** The map last asked about: a pointer that moves inside a room, or from room to room, works nothing out twice. */
let latest: { walls: readonly WallSegment[]; key: string; map: RoomMap } | null = null;

function roomMap(walls: readonly WallSegment[], mapRect: MapRect, cell: number): RoomMap | null {
  if (!isMap(mapRect) || !hasRoomWalls(walls)) return null;
  const key = `${mapRect.x},${mapRect.y},${mapRect.width},${mapRect.height},${cell}`;
  if (latest?.walls !== walls || latest.key !== key) latest = { walls, key, map: new RoomMap(walls, mapRect, cell) };
  return latest.map;
}

/**
 * The room around `point`: the outline of the ground the walls enclose there, on the walls'
 * centre lines. What walls inside it close off is no part of it (each is a room of its own, or
 * rock): the outline runs to each such hole and round it on a slit of no width (`fogKeyhole.ts`).
 * Null where the point lies on a wall's line or off the map, and where the ground runs out to
 * the map's edge. `walls` are a level's (`wallList`), `mapRect` the map as it is drawn and `cell`
 * the width of a grid cell.
 */
export function roomAt(point: Point, walls: readonly WallSegment[], mapRect: MapRect, cell: number): RoomCorners | null {
  return roomMap(walls, mapRect, cell)?.roomAt(point) ?? null;
}

/**
 * Every room the walls enclose on the map, each as `roomAt` gives it: those of at least half a
 * cell, and none that is rock between rooms (walls that know their floor side turn the other to it).
 */
export function roomsOfWalls(walls: readonly WallSegment[], mapRect: MapRect, cell: number): readonly RoomCorners[] {
  return roomMap(walls, mapRect, cell)?.rooms() ?? [];
}
