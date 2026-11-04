import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { tiesOf, type ReferencePlan } from './visibilityReference';

/** Where two polygons first differ (length, or a coordinate by `Object.is`), or null when they are the same. */
export function firstDifference(actual: readonly Point[], expected: readonly Point[]): string | null {
  if (actual.length !== expected.length) return `length ${actual.length}, expected ${expected.length}`;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!, e = expected[i]!;
    if (!Object.is(a.x, e.x) || !Object.is(a.y, e.y)) return `corner ${i}: (${a.x}, ${a.y}), expected (${e.x}, ${e.y})`;
  }
  return null;
}

/** Arrays of polygons (or nulls) with no difference anywhere. */
export function sameStops(a: readonly (readonly WallSegment[] | null)[], b: readonly (readonly WallSegment[] | null)[]): boolean {
  return a.length === b.length && a.every((stop, i) => {
    const other = b[i];
    return stop === null || other === null || other === undefined ? stop === (other ?? null) : stop.length === other.length && stop.every((w, k) => w === other[k]);
  });
}

/** Named tallies printed at the end of a run, so a run shows what it covered. */
export class Tally {
  private readonly counts = new Map<string, number>();

  add(name: string, amount = 1): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + amount);
  }

  get(name: string): number {
    return this.counts.get(name) ?? 0;
  }

  /** Adds every count of `other` to this one. */
  merge(other: Tally): void {
    for (const [name, n] of other.counts) this.add(name, n);
  }

  line(): string {
    return [...this.counts].map(([name, n]) => `${name} ${n}`).join(', ');
  }
}

/** Counts what a reference plan holds: hidden ends, cast values, runs that pass and runs cast again by reason. */
export function tallyPlan(plan: ReferencePlan, tally: Tally): void {
  tally.add('hidden ends', plan.hiddenEnds);
  tally.add('cast values', plan.cast.filter(Boolean).length);
  tally.add('repeated values', plan.counts.filter((n) => n > 1).length);
  for (const gap of plan.gaps) {
    if (gap.verdict === 'pass') {
      tally.add('passing runs');
      tally.add('rebuilt corners', gap.inner.length);
      if (tiesOf(plan, gap).length > 1) tally.add('runs with ties');
    } else tally.add(`cast again (${gap.verdict === 'radius' ? 'radius' : gap.verdict === 'walls' ? 'two walls' : gap.verdict})`);
    const inside = (v: number): boolean => v >= -Math.PI && v <= Math.PI;
    if (gap.wraps || !inside(plan.values[gap.left]!) || !inside(plan.values[gap.right]!)) tally.add('runs at the seam');
  }
}

/** Whether a clipped polygon's outline sampling cannot use the edge index: a corner by the origin, or an edge nearly half a turn wide. */
export function outlineFallback(origin: Point, polygon: readonly Point[]): boolean {
  if (polygon.some((p) => Math.hypot(p.x - origin.x, p.y - origin.y) < 1e-3)) return true;
  const bearings = polygon.map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));
  return bearings.some((a, i) => {
    let span = Math.abs(bearings[(i + 1) % bearings.length]! - a);
    if (span > Math.PI) span = 2 * Math.PI - span;
    return span > Math.PI - 1e-3;
  });
}
