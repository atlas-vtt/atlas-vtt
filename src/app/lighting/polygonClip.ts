import { difference, EndType, FillRule, inflatePaths, intersect, JoinType, union, type Path64, type Paths64 } from 'clipper2-ts';
import { Q_SCALE, type Q, type QPolygon, type QShape } from '../types/shapeTypes';
import { canonicalForm } from './canonicalForm';
import { assertQ, quantizeCoordinate } from './quantizedPoint';

function pathOf(ring: QPolygon): Path64 {
  if (ring.length % 2 !== 0) throw new RangeError('A shape path must contain coordinate pairs');
  const path: Path64 = [];
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i]!;
    const y = ring[i + 1]!;
    assertQ(x);
    assertQ(y);
    path.push({ x, y });
  }
  return path;
}

function canonicalOutput(paths: Paths64): QShape {
  return canonicalForm(paths.map(path => path.flatMap(point => [point.x, point.y])));
}

/** Normalized NonZero union with deterministic integer contour order. */
export function unionShapes(subject: QShape, clip: QShape): QShape {
  return canonicalOutput(union(subject.map(pathOf), clip.map(pathOf), FillRule.NonZero));
}

export function intersectShapes(subject: QShape, clip: QShape): QShape {
  return canonicalOutput(intersect(subject.map(pathOf), clip.map(pathOf), FillRule.NonZero));
}

export function subtractShapes(subject: QShape, clip: QShape): QShape {
  return canonicalOutput(difference(subject.map(pathOf), clip.map(pathOf), FillRule.NonZero));
}

/** Resolve a raw outline's crossings before canonical cleanup can discard zero-area rings. */
export function normalizePolygon(rawRing: QPolygon): QShape {
  return canonicalOutput(union([pathOf(rawRing)], FillRule.NonZero));
}

/**
 * A shape with holes grown by `deltaQ` (shrunk where negative): outer rings grow and holes shrink,
 * with round corners or square ones (`miter`, as a rectangle grows), normalized like a union.
 */
export function inflateShape(shape: QShape, deltaQ: Q, join: 'round' | 'miter' = 'round'): QShape {
  assertQ(deltaQ);
  const paths = shape.map(pathOf);
  if (deltaQ === 0) return canonicalOutput(union(paths, FillRule.NonZero));
  const grown = inflatePaths(paths, deltaQ, join === 'round' ? JoinType.Round : JoinType.Miter, EndType.Polygon, 2, Math.max(1, Math.abs(deltaQ) / 1000));
  return canonicalOutput(union(grown, FillRule.NonZero));
}

/** Round caps/joins at one eighth-pixel arc tolerance (or `arcToleranceQ`); integer cleanup has its own rounding. */
export function inflatePolyline(points: QPolygon, radiusQ: Q, arcToleranceQ = 1): QShape {
  const input = pathOf(points);
  assertQ(radiusQ);
  if (radiusQ < 0) throw new RangeError('A brush radius cannot be negative');
  const path = input.filter((point, index) => index === 0 || point.x !== input[index - 1]!.x || point.y !== input[index - 1]!.y);
  if (radiusQ === 0 || path.length === 0) return [];
  const inflated = inflatePaths([path], radiusQ, JoinType.Round, EndType.Round, 2, arcToleranceQ);
  for (const ring of inflated) {
    for (const point of ring) {
      assertQ(point.x);
      assertQ(point.y);
    }
  }
  // Integer offsetting can leave a crossing. Normalize the raw result before cleaning its rings.
  return canonicalOutput(union(inflated, FillRule.NonZero));
}

/**
 * The outlines of `area` (world pixels) grown by `radius` world pixels with round corners, as an
 * area light's range rings show its bright and dim ranges: every point within `radius` of the area.
 */
export function grownOutline(area: readonly { x: number; y: number }[], radius: number): { x: number; y: number }[][] {
  const path: Path64 = area.map((point) => ({ x: quantizeCoordinate(point.x), y: quantizeCoordinate(point.y) }));
  const delta = Math.max(0, radius) * Q_SCALE;
  // Round corners within a sixteenth of a pixel, or a thousandth of the radius on a large one.
  const grown = delta === 0 ? [path] : inflatePaths([path], delta, JoinType.Round, EndType.Polygon, 2, Math.max(Q_SCALE / 16, delta / 1000));
  return grown.map((ring) => ring.map((point) => ({ x: point.x / Q_SCALE, y: point.y / Q_SCALE })));
}
