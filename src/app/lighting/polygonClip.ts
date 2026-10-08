import { booleanOpWithPolyTree, ClipType, difference, EndType, FillRule, inflatePaths, JoinType, PolyTree64, union, type Path64, type Paths64, type PolyPath64 } from 'clipper2-ts';
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

/** A filled outline with the holes that lie directly in it; what is filled inside a hole is an area of its own. */
export interface QArea {
  readonly outline: QPolygon;
  readonly holes: readonly QPolygon[];
}

function ringOf(node: PolyPath64): QPolygon {
  return (node.poly ?? []).flatMap(point => [point.x, point.y]);
}

function childrenOf(node: PolyPath64): PolyPath64[] {
  return Array.from({ length: node.count }, (_, i) => node.child(i));
}

function collectAreas(parent: PolyPath64, areas: QArea[]): void {
  for (const outline of childrenOf(parent)) {
    const holes = childrenOf(outline);
    areas.push({ outline: ringOf(outline), holes: holes.map(ringOf) });
    for (const hole of holes) collectAreas(hole, areas);
  }
}

/** Paths moved out (or in, below zero) with mitred corners, which keep a grown shape no smaller and a shrunk one no larger than round ones would. */
function offset(paths: Paths64, delta: Q): Paths64 {
  return delta === 0 || paths.length === 0 ? paths : inflatePaths(paths, delta, JoinType.Miter, EndType.Polygon);
}

/**
 * The union of outlines that may overlap. Each is resolved by itself first: one that crosses
 * itself or runs the other way round must not cancel another.
 */
function united(outlines: readonly QPolygon[]): Paths64 {
  return union(outlines.flatMap(outline => union([pathOf(outline)], FillRule.NonZero)), FillRule.NonZero);
}

/** One part of a shape: the union of `covered` without the union of `open`. */
export interface QPart {
  readonly covered: readonly QPolygon[];
  readonly open: readonly QPolygon[];
  /** `covered` is grown by the margin: for a part whose outline other parts must meet without a seam. */
  readonly grown?: boolean;
}

/**
 * The union of the parts as one shape, as areas that know their holes: no hole reaches past its
 * outline or overlaps another, as the outlines handed in may.
 *
 * Every step rounds to the grid, which moves an outline by a fraction of a grid step, so two
 * that coincide in the numbers they were made from come apart, and what is open reaches a
 * little into what is covered. So what is open is shrunk by `margin` and a part marked `grown`
 * is grown by it: with a margin above what the rounding adds up to, whatever the outlines cover
 * exactly is covered here, at the price of that much more along them. Two open outlines that
 * coincide are left with a covered line of twice the margin between them. Crossings are
 * rounded too, so where edges run closer than a grid step an outline or hole can come back
 * crossing itself by less than that step.
 */
export function coveredAreas(parts: readonly QPart[], margin: Q): QArea[] {
  assertQ(margin);
  const pieces = parts.flatMap(({ covered, open, grown }) => {
    const subject = offset(united(covered), grown ? margin : 0);
    return subject.length === 0 ? [] : [{ subject, clip: offset(united(open), -margin) }];
  });
  const tree = new PolyTree64();
  if (pieces.length === 1) booleanOpWithPolyTree(ClipType.Difference, pieces[0]!.subject, pieces[0]!.clip, tree, FillRule.NonZero);
  else booleanOpWithPolyTree(ClipType.Union, pieces.flatMap(({ subject, clip }) => difference(subject, clip, FillRule.NonZero)), null, tree, FillRule.NonZero);
  const areas: QArea[] = [];
  collectAreas(tree, areas);
  return areas;
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
