import { difference, EndType, FillRule, inflatePaths, JoinType, union, type Path64, type Paths64 } from 'clipper2-ts';
import type { Q, QPolygon, QShape } from '../types/shapeTypes';
import { canonicalForm } from './canonicalForm';
import { assertQ } from './quantizedPoint';

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

export function subtractShapes(subject: QShape, clip: QShape): QShape {
  return canonicalOutput(difference(subject.map(pathOf), clip.map(pathOf), FillRule.NonZero));
}

/** Resolve a raw outline's crossings before canonical cleanup can discard zero-area rings. */
export function normalizePolygon(rawRing: QPolygon): QShape {
  return canonicalOutput(union([pathOf(rawRing)], FillRule.NonZero));
}

/** Round caps/joins at one eighth-pixel arc tolerance; integer cleanup has its own rounding. */
export function inflatePolyline(points: QPolygon, radiusQ: Q): QShape {
  const input = pathOf(points);
  assertQ(radiusQ);
  if (radiusQ < 0) throw new RangeError('A brush radius cannot be negative');
  const path = input.filter((point, index) => index === 0 || point.x !== input[index - 1]!.x || point.y !== input[index - 1]!.y);
  if (radiusQ === 0 || path.length === 0) return [];
  const inflated = inflatePaths([path], radiusQ, JoinType.Round, EndType.Round, 2, 1);
  for (const ring of inflated) {
    for (const point of ring) {
      assertQ(point.x);
      assertQ(point.y);
    }
  }
  // Integer offsetting can leave a crossing. Normalize the raw result before cleaning its rings.
  return canonicalOutput(union(inflated, FillRule.NonZero));
}
