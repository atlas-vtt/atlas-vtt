import { simplifyStroke } from '../pixi/lighting/wallEdits';
import { Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { signedAreaTwice } from './canonicalForm';
import { normalizePolygon, unionShapes } from './polygonClip';
import { shapeContains } from './shapeContains';
import { quantizeCoordinate } from './quantizedPoint';

/**
 * The shapes the rooms mode draws: a room is carved out of the rock as a shape, and what stays of it
 * are walls like any others (`wallCarving.ts`); nothing of the shape is kept.
 */

/** A shape in eighth pixels (`QShape`) that its holder owns: the clipping functions make new rings each time. */
export type RoomArea = number[][];

const own = (shape: QShape): RoomArea => shape as RoomArea;

/** How far, in map pixels, a room's outline may stray from what was drawn: brush strokes leave many tiny corners. */
const OUTLINE_TOLERANCE = 1;

const EMPTY: RoomArea = [];

/** The area covered by `polygons` together (world pixels; they may overlap or cross themselves). */
export function areaOf(polygons: readonly (readonly Point[])[]): RoomArea {
  const rings = polygons.filter((polygon) => polygon.length >= 3)
    .flatMap((polygon) => normalizePolygon(polygon.flatMap((p) => [quantizeCoordinate(p.x), quantizeCoordinate(p.y)])));
  return rings.length === 0 ? EMPTY : tidy(unionShapes(rings, EMPTY));
}

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
