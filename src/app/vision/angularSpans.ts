import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { angleTo } from './visionGeometry';

/** Angles slightly beyond a wall's own, so rays at its ends always test it. */
export const SPAN_SLACK = 1e-4;

/** The angles a wall covers as seen from a point: less than π, since it is a segment. */
export interface AngularSpan {
  wall: WallSegment;
  from: number;
  to: number;
  /** Crosses the ±π seam: covers angles ≥ from and ≤ to. */
  wraps: boolean;
}

/** The span between the bearings `a` and `b` of a wall's two ends. */
export function spanBetween(a: number, b: number): Omit<AngularSpan, 'wall'> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const wraps = hi - lo > Math.PI;
  return { from: wraps ? hi : lo, to: wraps ? lo : hi, wraps };
}

/** The angles each wall covers as seen from `origin`. */
export function angularSpans(origin: Point, walls: readonly WallSegment[]): AngularSpan[] {
  return walls.map((wall) => ({ wall, ...spanBetween(angleTo(origin, wall.p1), angleTo(origin, wall.p2)) }));
}

/**
 * Whether a ray at `angle` tests a wall whose span runs `from` `to`, on the angle as the sweep
 * casts it: angles just beyond −π or π are not turned back into that range, so near the seam a
 * ray tests the walls whose span its own value falls in.
 */
export function covers(from: number, to: number, wraps: boolean, angle: number): boolean {
  return wraps ? angle >= from - SPAN_SLACK || angle <= to + SPAN_SLACK : from <= angle + SPAN_SLACK && to >= angle - SPAN_SLACK;
}

/** `covers` for a span. */
export function spanCovers(span: Omit<AngularSpan, 'wall'>, angle: number): boolean {
  return covers(span.from, span.to, span.wraps, angle);
}
