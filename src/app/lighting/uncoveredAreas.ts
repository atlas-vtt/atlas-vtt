import { Q_SCALE, type QPolygon } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { coveredAreas } from './polygonClip';
import { quantizeCoordinate } from './quantizedPoint';
import type { Rect } from './segments';

/** A filled outline and the holes in it, each as [x0, y0, x1, y1, …] in world pixels. */
export interface FilledArea {
  outline: number[];
  holes: number[][];
}

type Outline = readonly Point[];

/** The part of an outline on one side of a level or upright line; where it leaves and comes back it runs along the line. */
function cut(outline: Outline, axis: 'x' | 'y', bound: number, keep: 1 | -1): Point[] {
  const kept: Point[] = [];
  outline.forEach((to, index) => {
    const from = outline[(index + outline.length - 1) % outline.length]!;
    const [before, after] = [(from[axis] - bound) * keep, (to[axis] - bound) * keep];
    if ((before < 0) !== (after < 0)) {
      const share = before / (before - after);
      const crossing = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
      crossing[axis] = bound;
      kept.push(crossing);
    }
    if (after >= 0) kept.push(to);
  });
  return kept;
}

/**
 * An outline as far as it lies in `box`, in the eighths of a pixel shapes are worked out in.
 * Cutting first keeps a far corner (the sight of a token that sees for miles) inside the
 * range those hold; a corner that is no finite number is refused, not left out.
 */
function quantized(outline: Outline, [x, y, width, height]: Rect): QPolygon {
  if (!outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) throw new RangeError('A polygon corner is not a finite number');
  const inside = outline.every((point) => point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height);
  const within = inside ? outline : cut(cut(cut(cut(outline, 'x', x, 1), 'x', x + width, -1), 'y', y, 1), 'y', y + height, -1);
  // A sweep hands in several corners per wall end, most of them repeated or on one line: a corner between two others fills nothing.
  const ring: number[] = [];
  for (const point of within) {
    const px = quantizeCoordinate(point.x);
    const py = quantizeCoordinate(point.y);
    while (ring.length >= 4 && onOneLine(ring[ring.length - 4]!, ring[ring.length - 3]!, ring[ring.length - 2]!, ring[ring.length - 1]!, px, py)) ring.length -= 2;
    if (ring.length < 2 || ring[ring.length - 2] !== px || ring[ring.length - 1] !== py) ring.push(px, py);
  }
  return ring;
}

/** Exact for eighths of a pixel within their range: the products stay whole numbers a double holds. */
function onOneLine(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (bx - ax) * (cy - by) === (by - ay) * (cx - bx);
}

function worldRing(ring: QPolygon): number[] {
  return ring.map((coordinate) => coordinate / Q_SCALE);
}

/** One part of what is covered: the union of `covered` without the union of `open`. */
export interface CoveredPart {
  covered: readonly Outline[];
  open: readonly Outline[];
  /** `covered` is grown by the margin, so that no seam opens where another part meets it. */
  grown?: boolean;
}

/**
 * The parts as one shape inside `box`: what each covers once what is open in it is taken out.
 * No hole of an area reaches past its outline or overlaps another, which a drawer that cuts
 * holes one by one cannot be given by polygons that overlap.
 *
 * Outlines are rounded to eighths of a pixel, and so is every crossing the clipping finds:
 * together that moved outlines a fifth of a pixel, so that two which coincide came apart and
 * what is open reached into what is covered. What is open is therefore shrunk by `margin` world
 * pixels and a `grown` part grown by it (`coveredAreas`): nothing that is covered exactly comes
 * back open. Where edges run closer than an eighth, an outline or hole may come back crossing
 * itself by less than that: a canvas fills such an area as it is, a triangulation may lose a
 * hole of it.
 * Throws a `RangeError` for a corner that is no finite number.
 */
export function uncoveredAreas(parts: readonly CoveredPart[], box: Rect, margin: number): FilledArea[] {
  const outlines = (polygons: readonly Outline[]): QPolygon[] => polygons.map((polygon) => quantized(polygon, box)).filter((ring) => ring.length >= 6);
  const rings = parts.map(({ covered, open, grown }) => ({ covered: outlines(covered), open: outlines(open), ...(grown && { grown }) }));
  return coveredAreas(rings, quantizeCoordinate(margin)).map(({ outline, holes }) => ({ outline: worldRing(outline), holes: holes.map(worldRing) }));
}
