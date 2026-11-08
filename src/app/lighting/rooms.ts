import { simplifyStroke } from '../pixi/lighting/wallEdits';
import type { OnOneLevel } from '../types/sceneLevelTypes';
import { MAX_Q, Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { isRecord } from '../utils/guards';
import { signedAreaTwice } from './canonicalForm';
import { intersectShapes, normalizePolygon, subtractShapes, unionShapes } from './polygonClip';
import { shapeContains } from './shapeContains';
import { quantizeCoordinate } from './quantizedPoint';

/**
 * An open area carved out of the rock. On a level with rooms everything outside them is solid:
 * the outline of all its shown rooms together stands as walls (`roomWalls`). A hidden room is rock again.
 */
export interface Room extends OnOneLevel {
  id: string;
  kind: 'room';
  name: string;
  /** Rock again until shown: its area makes no opening. */
  hidden?: boolean;
  /** Its place in the list, first at 0. */
  order: number;
  /** The open area, in eighth pixels. */
  area: RoomArea;
}

/** A `QShape` the store may hold: the clipping functions make new rings each time, which nothing else holds. */
export type RoomArea = number[][];

const own = (shape: QShape): RoomArea => shape as RoomArea;

/** Rooms a level holds at most: past that, what is carved goes into the highlighted room. */
export const MAX_ROOMS = 24;

/** How far, in map pixels, a room's outline may stray from what was drawn: brush strokes leave many tiny corners. */
const OUTLINE_TOLERANCE = 1;

const EMPTY: RoomArea = [];

const isRing = (ring: unknown): ring is QPolygon => Array.isArray(ring) && ring.length >= 6 && ring.length % 2 === 0
  && ring.every((value) => Number.isInteger(value) && Math.abs(value as number) <= MAX_Q);

/** Whether `area` is an area a room can have: rings of bounded eighth pixels. */
export const isRoomArea = (area: unknown): area is RoomArea => Array.isArray(area) && area.every(isRing);

/** A room as the file has it, or null where it is none (a hand edit, a newer version): it is then passed over. */
function readRoom(id: string, value: unknown): Room | null {
  if (!isRecord(value) || !isRoomArea(value.area)) return null;
  return value.id === id && typeof value.name === 'string' && Number.isFinite(value.order) ? (value as unknown as Room) : null;
}

const lists = new WeakMap<Record<string, Room>, Room[]>();

/** The rooms that are rooms, in their order, read anew: for a draft the store is changing. */
export function readRooms(rooms: Record<string, Room>): Room[] {
  return Object.entries(rooms).flatMap(([id, room]) => readRoom(id, room) ?? []).sort((a, b) => a.order - b.order);
}

const NO_ROOMS: Room[] = [];

/** The rooms that are rooms, in their order; the same list while the record is the same (one list for none). */
export function roomList(rooms: Record<string, Room> | undefined): readonly Room[] {
  if (!rooms) return NO_ROOMS;
  let list = lists.get(rooms);
  if (!list) lists.set(rooms, list = readRooms(rooms));
  return list;
}

/** A map file's rooms, kept as they are: what is no room is passed over at reading (`roomList`) and saved back. */
export function roomsFromFile(value: unknown): Record<string, Room> | undefined {
  return isRecord(value) ? (value as Record<string, Room>) : undefined;
}

/** The area covered by `polygons` together (world pixels; they may overlap or cross themselves). */
export function areaOf(polygons: readonly (readonly Point[])[]): RoomArea {
  const rings = polygons.filter((polygon) => polygon.length >= 3)
    .flatMap((polygon) => normalizePolygon(polygon.flatMap((p) => [quantizeCoordinate(p.x), quantizeCoordinate(p.y)])));
  return rings.length === 0 ? EMPTY : tidy(unionShapes(rings, EMPTY));
}

// Only what is drawn is simplified (`areaOf`): simplifying every result would wear outlines down edit by edit.
export const joined = (a: RoomArea, b: RoomArea): RoomArea => (b.length === 0 ? a : own(unionShapes(a, b)));
export const without = (a: RoomArea, b: RoomArea): RoomArea => (a.length === 0 || b.length === 0 ? a : own(subtractShapes(a, b)));
export const within = (a: RoomArea, b: RoomArea): RoomArea => (a.length === 0 || b.length === 0 ? EMPTY : own(intersectShapes(a, b)));

/** Fewer corners where they add nothing seen; every one of them is a wall for sight and light. */
function tidy(area: QShape): RoomArea {
  const rings = area.flatMap((ring) => {
    const points: Point[] = [];
    for (let i = 0; i < ring.length; i += 2) points.push({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
    const simpler = simplifyStroke([...points, points[0]!], OUTLINE_TOLERANCE).slice(0, -1);
    return simpler.length >= 3 ? [simpler.flatMap((p) => [quantizeCoordinate(p.x), quantizeCoordinate(p.y)])] : [];
  });
  // Simplifying keeps each ring's turn, so outlines stay outlines and holes holes.
  return rings.length === 0 ? EMPTY : own(unionShapes(rings, EMPTY));
}

/** `area` with every corner moved by `move`, as the map under it moved or turned. */
export function movedArea(area: RoomArea, move: (point: Point) => Point): RoomArea {
  const rings = area.map((ring) => {
    const moved: number[] = [];
    for (let i = 0; i < ring.length; i += 2) {
      const point = move({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
      moved.push(quantizeCoordinate(point.x), quantizeCoordinate(point.y));
    }
    return moved;
  });
  return rings.length === 0 ? EMPTY : own(unionShapes(rings, EMPTY));
}

/** A ring's corners in world pixels, as `[x0, y0, x1, y1, …]`. */
export const ringPoints = (ring: QPolygon): number[] => ring.map((value) => value / Q_SCALE);

/**
 * The outlines of `area`, each with the holes in it, for drawing: a shape keeps its rings apart,
 * outlines turning one way and holes the other, and a hole belongs to the least outline around it.
 */
export function outlinesWithHoles(area: QShape): { outline: QPolygon; holes: QPolygon[] }[] {
  const rings = area.map((ring) => ({ ring, size: signedAreaTwice(ring) }));
  const outlines = rings.filter(({ size }) => size > 0n).sort((a, b) => (a.size < b.size ? -1 : 1)).map(({ ring }) => ({ outline: ring, holes: [] as QPolygon[] }));
  for (const { ring, size } of rings) {
    if (size >= 0n) continue;
    const corner = { x: ring[0]! / Q_SCALE, y: ring[1]! / Q_SCALE };
    outlines.find(({ outline }) => shapeContains([outline], corner))?.holes.push(ring);
  }
  return outlines;
}

/** All shown rooms as one area. */
export function openArea(rooms: Record<string, Room> | undefined): RoomArea {
  return roomList(rooms).filter((room) => !room.hidden).reduce((open, room) => joined(open, room.area), EMPTY);
}

const wallCache = new WeakMap<Record<string, Room>, Record<string, WallSegment>>();

/**
 * The walls the shown rooms' outline makes: solid, one per edge, never edited by hand. An edge is
 * named by its ends, so an edit leaves the walls it did not move as they were (`changedWallRects`).
 */
export function roomWalls(rooms: Record<string, Room>): Record<string, WallSegment> {
  let walls = wallCache.get(rooms);
  if (walls) return walls;
  walls = {};
  for (const ring of openArea(rooms)) {
    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      const [x1, y1, x2, y2] = [ring[i]!, ring[i + 1]!, ring[next]!, ring[next + 1]!];
      const id = `room_${x1}_${y1}_${x2}_${y2}`;
      walls[id] = { id, kind: 'wall', type: 'solid', p1: { x: x1 / Q_SCALE, y: y1 / Q_SCALE }, p2: { x: x2 / Q_SCALE, y: y2 / Q_SCALE }, chainId: 'rooms' };
    }
  }
  wallCache.set(rooms, walls);
  return walls;
}

const blockingCache = new WeakMap<Record<string, WallSegment>, { rooms: Record<string, Room>; walls: Record<string, WallSegment> }>();

/**
 * What stops sight, light, sound and tokens on a level (`levelObjects`): its drawn walls and the
 * outline of its rooms. The same record while neither changes, so whatever compares it by
 * reference works anything out again only then.
 */
export function blockingWalls(objects: { walls: Record<string, WallSegment>; rooms?: Record<string, Room> | undefined }): Record<string, WallSegment> {
  const { walls, rooms } = objects;
  if (!rooms || roomList(rooms).length === 0) return walls;
  const cached = blockingCache.get(walls);
  if (cached?.rooms === rooms) return cached.walls;
  const merged = { ...walls, ...roomWalls(rooms) };
  blockingCache.set(walls, { rooms, walls: merged });
  return merged;
}

/** `end` moved on along the line from `other`, to the first wall within `reach`, and a pixel past it. */
export function extended(end: Point, other: Point, walls: readonly { p1: Point; p2: Point }[], reach: number): Point {
  const length = Math.hypot(end.x - other.x, end.y - other.y);
  if (length === 0) return end;
  const dx = (end.x - other.x) / length;
  const dy = (end.y - other.y) / length;
  let nearest = Infinity;
  for (const { p1, p2 } of walls) {
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((p1.x - end.x) * ey - (p1.y - end.y) * ex) / denom;
    const u = ((p1.x - end.x) * dy - (p1.y - end.y) * dx) / denom;
    if (t >= 0 && t <= reach && u >= 0 && u <= 1) nearest = Math.min(nearest, t);
  }
  return nearest === Infinity ? end : { x: end.x + dx * (nearest + 1), y: end.y + dy * (nearest + 1) };
}
