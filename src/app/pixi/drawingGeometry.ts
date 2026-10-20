import type { DrawingStroke } from '../types';
import type { Point } from './drawingEraseUtils';
import { addonDrawingShape } from '../addons/drawingAddons';

export interface DrawingBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function distanceSqToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  return (p.x - a.x - t * abx) ** 2 + (p.y - a.y - t * aby) ** 2;
}

/**
 * Whether a world-space point touches an annotation. Icons are hit anywhere
 * in their square footprint, ink within half its width of the polyline.
 * `tolerance` widens both so thin lines stay grabbable.
 */
export function hitTestDrawing(stroke: DrawingStroke, point: Point, tolerance: number): boolean {
  const addonShape = addonDrawingShape(stroke.type);
  if (addonShape) return addonShape.hitTest(stroke, point, tolerance);

  const first = stroke.points[0];
  if (!first) return false;
  const reach = stroke.width / 2 + tolerance;

  if (stroke.type === 'icon') {
    return Math.abs(point.x - first.x) <= reach && Math.abs(point.y - first.y) <= reach;
  }
  return isNearPolyline(stroke.points, point, reach, false);
}

/** Whether `point` lies within `reach` of the polyline; `closed` adds the edge back to the first point. */
export function isNearPolyline(points: readonly Point[], point: Point, reach: number, closed: boolean): boolean {
  const first = points[0];
  if (!first) return false;
  const reachSq = reach * reach;
  if (points.length === 1) return distanceSqToSegment(point, first, first) <= reachSq;

  // ponytail: linear scan over every segment; add a bounds pre-check if maps get ink-heavy
  for (let i = 1; i < points.length; i++) {
    if (distanceSqToSegment(point, points[i - 1]!, points[i]!) <= reachSq) return true;
  }
  return closed && distanceSqToSegment(point, points[points.length - 1]!, first) <= reachSq;
}

/** World-space bounding box of an annotation, including its line width / icon footprint. */
export function getDrawingBounds(stroke: DrawingStroke): DrawingBounds | null {
  if (stroke.points.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of stroke.points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const half = stroke.width / 2;
  return { x: minX - half, y: minY - half, width: maxX - minX + stroke.width, height: maxY - minY + stroke.width };
}
