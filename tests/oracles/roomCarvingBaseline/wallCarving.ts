// Frozen from d34ba9556b4fcf19293768f5194faa5bbaafbcdd src/app/lighting/wallCarving.ts. Only import paths are adapted.
import type { Point } from '../../../src/app/types/visionTypes';
import type { WallInput, WallSegment } from '../../../src/app/types/wallTypes';
import type { RoomArea } from '../../../src/app/lighting/rooms';
import { shapeContains } from '../../../src/app/lighting/shapeContains';
import { along, beside, distanceTo, edgesWithShapeOnLeft, lengthOf, type Segment } from '../../../src/app/lighting/wallSides';

/**
 * Carving a room and filling one in, as edits of the map's walls: a room is its walls and nothing
 * else. Carving joins a shape to the floor there is, as if both were one area: every wall inside
 * the shape goes, a plain wall along its edge goes where floor lies beyond it, and its edge
 * becomes wall wherever rock lies beyond. So a shape drawn over rooms, or from one room's wall to
 * another's, only gets walls where nothing was open before. Filling takes a shape out of the
 * floor: the walls inside it go, and its edge becomes wall wherever floor lies beyond.
 * Floor is what `wallSpaces` says of the walls before the edit.
 */

/** How near a line something lies to be on it, and how short a piece of wall is none, in pixels. */
const ON_LINE = 0.5;
/** How far beyond a shape's edge the ground there is asked about, in pixels: clear of the edge itself. */
const BEYOND = 1.5;

/** Walls to take away by id and walls to add, as one edit (`WallEdit` of the wall editor). */
export interface CarvedWalls {
  remove: string[];
  add: WallInput[];
}

/** A wall that only stops things as any wall does: no door, no side it lets through, nothing it stops alone. */
const plain = (wall: WallSegment): boolean => wall.type === 'solid' && !wall.direction && !wall.blocks && !wall.limited;

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

/** The pieces of `segment` between its cuts for which `keep` holds (asked of the piece), neighbours joined. */
function pieces(segment: Segment, shares: readonly number[], keep: (piece: Segment) => boolean): Segment[] {
  const stops = [0, ...[...shares].sort((a, b) => a - b), 1];
  const kept: [number, number][] = [];
  for (let i = 1; i < stops.length; i++) {
    const [from, to] = [stops[i - 1]!, stops[i]!];
    if (to - from <= 1e-9 || !keep({ p1: along(segment, from), p2: along(segment, to) })) continue;
    const last = kept[kept.length - 1];
    if (last && last[1] === from) last[1] = to;
    else kept.push([from, to]);
  }
  return kept.map(([from, to]) => ({ p1: along(segment, from), p2: along(segment, to) })).filter((piece) => lengthOf(piece) > ON_LINE);
}

/** `segment` moved `distance` to its `side`, end for end: what lies beside it changes where this line crosses another. */
function shifted(segment: Segment, side: 'left' | 'right', distance: number): Segment {
  return { p1: beside(segment, 0, side, distance), p2: beside(segment, 1, side, distance) };
}

function withoutIdentity(wall: WallSegment): WallInput {
  const { id: _id, kind: _kind, ...rest } = wall;
  return rest;
}

function edit(area: RoomArea, walls: readonly WallSegment[], floors: readonly RoomArea[], carving: boolean, chainId: string): CarvedWalls {
  // The shape's edge, the shape to the left of each piece of it.
  const outline = edgesWithShapeOnLeft(area);
  const floor = (point: Point): boolean => floors.some((space) => shapeContains(space, point));
  const middle = (piece: Segment): Point => along(piece, 0.5);
  /** The piece of the shape's edge a piece of wall runs along, if it does: not one it only crosses. */
  const edgeAlong = (piece: Segment): Segment | undefined => outline.find((edge) => [piece.p1, middle(piece), piece.p2].every((point) => distanceTo(edge, point) <= ON_LINE));
  const floorEdges = floors.flatMap((space) => edgesWithShapeOnLeft(space));
  /** Where along `segment` the ground a step to either side of it turns from floor to rock. */
  const groundTurns = (segment: Segment, sides: readonly ('left' | 'right')[]): number[] => sides.flatMap((side) => cuts(shifted(segment, side, BEYOND), floorEdges));
  const remove: string[] = [];
  const add: WallInput[] = [];
  const standing: Segment[] = [];
  for (const wall of walls) {
    const length = lengthOf(wall);
    if (!(length > 0)) continue;
    const left = pieces(wall, [...cuts(wall, outline), ...(carving && plain(wall) ? groundTurns(wall, ['left', 'right']) : [])], (piece) => {
      const point = middle(piece);
      const edge = edgeAlong(piece);
      // Inside the shape, the wall goes whatever it is.
      if (!edge) return !(shapeContains(area, point) && outline.every((line) => distanceTo(line, point) > ON_LINE));
      // Along its edge, a plain wall goes where carving joins the shape to floor beyond it.
      return !(carving && plain(wall) && floor(beside(edge, edgeShare(edge, point), 'right', BEYOND)));
    });
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
  const others = [...standing, ...floorEdges];
  for (const edge of outline) {
    if (!(lengthOf(edge) > 0)) continue;
    const fresh = pieces(edge, [...cuts(edge, others), ...groundTurns(edge, ['right'])], (piece) => {
      const beyond = floor(beside(piece, 0.5, 'right', BEYOND));
      return beyond !== carving && standing.every((wall) => distanceTo(wall, middle(piece)) > ON_LINE);
    });
    // Carved, the room's floor is the shape, to the left; filled, the floor is what lies beyond.
    for (const { p1, p2 } of fresh) add.push({ type: 'solid', closed: true, chainId, floor: 'left', ...(carving ? { p1, p2 } : { p1: p2, p2: p1 }) });
  }
  return { remove, add };
}

/** How far along `edge` the point nearest `point` lies, as a share of its length. */
function edgeShare(edge: Segment, point: Point): number {
  const [dx, dy] = [edge.p2.x - edge.p1.x, edge.p2.y - edge.p1.y];
  return Math.max(0, Math.min(1, ((point.x - edge.p1.x) * dx + (point.y - edge.p1.y) * dy) / (dx * dx + dy * dy)));
}

/** Carves `area` out of the rock and joins it to the floor it reaches (`floors`, of `wallSpaces`). */
export function carvedWalls(area: RoomArea, walls: readonly WallSegment[], floors: readonly RoomArea[], chainId: string): CarvedWalls {
  return edit(area, walls, floors, true, chainId);
}

/** Fills `area` back in: the walls inside it go, and its edge is wall wherever floor lies beyond it. */
export function filledWalls(area: RoomArea, walls: readonly WallSegment[], floors: readonly RoomArea[], chainId: string): CarvedWalls {
  return edit(area, walls, floors, false, chainId);
}
