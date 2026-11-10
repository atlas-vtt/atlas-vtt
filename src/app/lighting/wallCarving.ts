import { Q_SCALE, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { WallInput, WallSegment } from '../types/wallTypes';
import type { RoomArea } from './rooms';
import { shapeContains } from './shapeContains';

/**
 * Carving a room and filling one in, as edits of the map's walls: a room is its walls and nothing
 * else. Carving a shape takes away every wall inside it and walls its edge wherever that borders
 * rock, so a shape carved into a room opens into it and the two are one; filling does the reverse,
 * walling the shape's edge where it runs through a room's floor. Floor is what walls close in
 * (`wallSpaces`), read before the edit.
 */

/** How near a line something lies to be on it, and how short a piece of wall is none, in pixels. */
const ON_LINE = 0.5;

/** Walls to take away by id and walls to add, as one edit (`WallEdit` of the wall editor). */
export interface CarvedWalls {
  remove: string[];
  add: WallInput[];
}

type Segment = { p1: Point; p2: Point };

const at = ({ p1, p2 }: Segment, share: number): Point => ({ x: p1.x + share * (p2.x - p1.x), y: p1.y + share * (p2.y - p1.y) });
const lengthOf = ({ p1, p2 }: Segment): number => Math.hypot(p2.x - p1.x, p2.y - p1.y);

function* edgesOf(shape: QShape): Generator<Segment> {
  for (const ring of shape) {
    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      yield { p1: { x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE }, p2: { x: ring[next]! / Q_SCALE, y: ring[next + 1]! / Q_SCALE } };
    }
  }
}

function distanceTo(segment: Segment, point: Point): number {
  const [dx, dy] = [segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y];
  const lengthSq = dx * dx + dy * dy;
  const share = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - segment.p1.x) * dx + (point.y - segment.p1.y) * dy) / lengthSq));
  return Math.hypot(point.x - (segment.p1.x + share * dx), point.y - (segment.p1.y + share * dy));
}

/** Inside `shape` and off its outline: its floor, not its edge. */
function inside(shape: QShape, edges: readonly Segment[], point: Point): boolean {
  return shapeContains(shape, point) && edges.every((edge) => distanceTo(edge, point) > ON_LINE);
}

/** Where along `segment` (as shares of its length) the lines of `others` cross it or end on it. */
function cuts(segment: Segment, others: Iterable<Segment>): number[] {
  const [dx, dy] = [segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y];
  const lengthSq = dx * dx + dy * dy;
  const shares: number[] = [];
  for (const other of others) {
    const [ex, ey] = [other.p2.x - other.p1.x, other.p2.y - other.p1.y];
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) > 1e-9) {
      const t = ((other.p1.x - segment.p1.x) * ey - (other.p1.y - segment.p1.y) * ex) / denominator;
      const u = ((other.p1.x - segment.p1.x) * dy - (other.p1.y - segment.p1.y) * dx) / denominator;
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) shares.push(t);
    }
    // An end lying on the segment: where a wall along it begins or stops.
    for (const end of [other.p1, other.p2]) {
      const share = ((end.x - segment.p1.x) * dx + (end.y - segment.p1.y) * dy) / lengthSq;
      if (share > 0 && share < 1 && distanceTo(segment, end) <= ON_LINE) shares.push(share);
    }
  }
  return shares;
}

/** The pieces of `segment` between its cuts for which `keep` holds of their middle, neighbours joined. */
function pieces(segment: Segment, shares: readonly number[], keep: (middle: Point) => boolean): Segment[] {
  const stops = [0, ...[...shares].sort((a, b) => a - b), 1];
  const kept: [number, number][] = [];
  for (let i = 1; i < stops.length; i++) {
    const [from, to] = [stops[i - 1]!, stops[i]!];
    if (to - from <= 1e-9 || !keep(at(segment, (from + to) / 2))) continue;
    const last = kept[kept.length - 1];
    if (last && last[1] === from) last[1] = to;
    else kept.push([from, to]);
  }
  return kept.map(([from, to]) => ({ p1: at(segment, from), p2: at(segment, to) })).filter((piece) => lengthOf(piece) > ON_LINE);
}

function withoutIdentity(wall: WallSegment): WallInput {
  const { id: _id, kind: _kind, ...rest } = wall;
  return rest;
}

/**
 * The edit a shape makes of the walls. Every wall loses what lies inside the shape; the shape's edge
 * becomes wall where `walled` says so of the floor it runs through (`true` where it lies on a
 * room's floor), and nowhere a wall stands on it already.
 */
function edit(area: RoomArea, walls: readonly WallSegment[], spaces: readonly RoomArea[], walled: (onFloor: boolean) => boolean, chainId: string): CarvedWalls {
  const outline = [...edgesOf(area)];
  const remove: string[] = [];
  const add: WallInput[] = [];
  const standing: Segment[] = [];
  for (const wall of walls) {
    const length = lengthOf(wall);
    if (!(length > 0)) continue;
    const left = pieces(wall, cuts(wall, outline), (middle) => !inside(area, outline, middle));
    if (left.length === 1 && lengthOf(left[0]!) >= length - ON_LINE) {
      standing.push(wall);
      continue;
    }
    remove.push(wall.id);
    for (const piece of left) {
      add.push({ ...withoutIdentity(wall), ...piece });
      standing.push(piece);
    }
  }
  const floors = spaces.map((space) => ({ space, edges: [...edgesOf(space)] }));
  const onFloor = (point: Point): boolean => floors.some(({ space, edges }) => inside(space, edges, point));
  const others = [...standing, ...floors.flatMap(({ edges }) => edges)];
  for (const edge of outline) {
    if (!(lengthOf(edge) > 0)) continue;
    const fresh = pieces(edge, cuts(edge, others), (middle) => walled(onFloor(middle)) && standing.every((wall) => distanceTo(wall, middle) > ON_LINE));
    for (const piece of fresh) add.push({ type: 'solid', closed: true, chainId, ...piece });
  }
  return { remove, add };
}

/** Carves `area` out of the rock: the walls inside it go, and its edge is wall wherever it does not open into a room's floor. */
export function carvedWalls(area: RoomArea, walls: readonly WallSegment[], spaces: readonly RoomArea[], chainId: string): CarvedWalls {
  return edit(area, walls, spaces, (onFloor) => !onFloor, chainId);
}

/** Fills `area` back in: the walls inside it go, and its edge is wall wherever it runs through a room's floor. */
export function filledWalls(area: RoomArea, walls: readonly WallSegment[], spaces: readonly RoomArea[], chainId: string): CarvedWalls {
  return edit(area, walls, spaces, (onFloor) => onFloor, chainId);
}
