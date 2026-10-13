import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility as fullSweep, wallsInReach } from '../oracles/visibilityBaseline/visibility';
import { angleTo, raySegmentIntersect } from '../oracles/visibilityBaseline/visionGeometry';
import type { VisibilityCall } from './visibilityScenes';

/**
 * The culling rules worked out by brute force against the full sweep, kept apart from the code
 * under test: which wall ends are hidden, which rays are cast, which runs of hidden corners lie
 * on one wall between two cast rays, and which walls lie along such a run.
 */

const BOUNDARY_RAYS = 64;
const RAY_OFFSET = 1e-5;
const SPAN_SLACK = 1e-4;
/** How near a wall must come to a run's chord to be weighed when its corners are rebuilt. */
export const TIE_MARGIN = 1e-3;

interface Span { from: number; to: number; wraps: boolean }

/** A cast ray's stop: how far, and on which wall in reach (−1 at the radius). */
export interface Stop { t: number; wall: number }

export type GapVerdict = 'pass' | 'radius' | 'walls' | 'seam' | 'edge-on';

/** A run of hidden values between two neighbouring cast values (indices into `values`). */
export interface Gap { left: number; right: number; inner: number[]; wraps: boolean; verdict: GapVerdict }

export interface ReferencePlan {
  call: VisibilityCall;
  blocking: WallSegment[];
  spans: Span[];
  /** The walls in reach seen edge-on: the origin lies within 1e-5 of the far end's distance of the wall's line, and not on it to the last bit. */
  edgeOn: number[];
  /** The sweep's angles as distinct sorted values, how often each occurs, and whether it is cast. */
  values: number[];
  counts: number[];
  cast: boolean[];
  /** The full sweep's polygon (without a cone), and where each value's corners begin in it. */
  polygon: Point[];
  starts: number[];
  stops: Map<number, Stop>;
  gaps: Gap[];
  hiddenEnds: number;
  ends: number;
}

function spanOf(origin: Point, wall: WallSegment): Span {
  const a = angleTo(origin, wall.p1), b = angleTo(origin, wall.p2);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const wraps = hi - lo > Math.PI;
  return { from: wraps ? hi : lo, to: wraps ? lo : hi, wraps };
}

/** Whether the full sweep tests a wall with this span for a ray at `angle`. */
export function covers(span: Span, angle: number): boolean {
  return span.wraps ? angle >= span.from - SPAN_SLACK || angle <= span.to + SPAN_SLACK : span.from <= angle + SPAN_SLACK && span.to >= angle - SPAN_SLACK;
}

/** Where the full sweep's ray at `angle` stops, over `walls` (indices into `plan.blocking`), and on which. */
export function stopAt(plan: Pick<ReferencePlan, 'call' | 'blocking' | 'spans'>, angle: number, walls?: readonly number[]): Stop {
  const { origin, radius } = plan.call;
  let t = radius, wall = -1;
  const visit = (i: number): void => {
    if (!covers(plan.spans[i]!, angle)) return;
    const hit = raySegmentIntersect(origin, angle, plan.blocking[i]!.p1, plan.blocking[i]!.p2);
    if (hit < t) { t = hit; wall = i; }
  };
  if (walls) walls.forEach(visit);
  else for (let i = 0; i < plan.blocking.length; i++) visit(i);
  return { t, wall };
}

/** The corner the full sweep writes at `angle` for a ray that stops at `t`. */
export function cornerAt(origin: Point, angle: number, t: number): Point {
  return { x: origin.x + Math.cos(angle) * t, y: origin.y + Math.sin(angle) * t };
}

function hidden(plan: Pick<ReferencePlan, 'call' | 'blocking' | 'spans'>, end: Point): boolean {
  const { origin, radius } = plan.call;
  const d = Math.hypot(end.x - origin.x, end.y - origin.y);
  return stopAt({ ...plan, call: { ...plan.call, radius: Math.min(radius, d * (1 - 1e-9)) } }, angleTo(origin, end)).t < Math.min(radius, d * (1 - 1e-9));
}

function classify(plan: ReferencePlan, left: number, right: number, wraps: boolean): GapVerdict {
  const a = plan.stops.get(left)!, b = plan.stops.get(right)!, { radius } = plan.call;
  if (!(a.t < radius) || !(b.t < radius) || a.wall < 0 || b.wall < 0) return 'radius';
  if (plan.blocking[a.wall] !== plan.blocking[b.wall]) return 'walls';
  const inside = (v: number): boolean => v >= -Math.PI && v <= Math.PI;
  if (wraps || !inside(plan.values[left]!) || !inside(plan.values[right]!)) return 'seam';
  const lo = plan.values[left]!, hi = plan.values[right]!;
  const touched = plan.edgeOn.some((i) => {
    const span = plan.spans[i]!;
    return span.wraps ? hi >= span.from - 2 * SPAN_SLACK || lo <= span.to + 2 * SPAN_SLACK : lo <= span.to + 2 * SPAN_SLACK && hi >= span.from - 2 * SPAN_SLACK;
  });
  return touched ? 'edge-on' : 'pass';
}

/**
 * Whether the origin lies within 1e-5 of the far end's distance of the wall's line, but not on it
 * to the last bit: the sweep's distance to a wall is `cross` over something, so where `cross` is
 * exactly zero the wall stops no ray and rounds nothing.
 */
function edgeOnFrom(origin: Point, w: WallSegment): boolean {
  const ex = w.p2.x - w.p1.x, ey = w.p2.y - w.p1.y;
  const cross = (w.p1.x - origin.x) * ey - (w.p1.y - origin.y) * ex;
  if (cross === 0) return false;
  return Math.abs(cross) / Math.hypot(ex, ey) < 1e-5 * Math.max(Math.hypot(w.p1.x - origin.x, w.p1.y - origin.y), Math.hypot(w.p2.x - origin.x, w.p2.y - origin.y));
}

/** The reference plan of a call without a cone, or null when a limited wall is in reach (that sweep is never culled). */
export function referencePlan(call: VisibilityCall, walls: readonly WallSegment[]): ReferencePlan | null {
  const { origin, radius, channel } = call;
  const blocking = wallsInReach(walls, origin, radius, channel);
  if (blocking.some((w) => w.limited)) return null;
  const spans = blocking.map((w) => spanOf(origin, w));
  const edgeOn = blocking.flatMap((w, i) => (edgeOnFrom(origin, w) ? [i] : []));
  const base = { call, blocking, spans, edgeOn };
  const tagged: { angle: number; cast: boolean }[] = [];
  for (let i = 0; i < BOUNDARY_RAYS; i++) tagged.push({ angle: -Math.PI + (2 * Math.PI * i) / BOUNDARY_RAYS, cast: true });
  let ends = 0, hiddenEnds = 0;
  for (const wall of blocking) {
    for (const end of [wall.p1, wall.p2]) {
      if (end.x === origin.x && end.y === origin.y) continue;
      const angle = angleTo(origin, end), cast = !hidden(base, end);
      ends++;
      if (!cast) hiddenEnds++;
      tagged.push({ angle: angle - RAY_OFFSET, cast }, { angle, cast }, { angle: angle + RAY_OFFSET, cast });
    }
  }
  tagged.sort((a, b) => a.angle - b.angle);
  const values: number[] = [], counts: number[] = [], cast: boolean[] = [], starts: number[] = [];
  tagged.forEach((entry, k) => {
    if (values.length && values[values.length - 1] === entry.angle) {
      counts[counts.length - 1]!++;
      cast[cast.length - 1] ||= entry.cast;
      return;
    }
    values.push(entry.angle); counts.push(1); cast.push(entry.cast); starts.push(k);
  });
  const polygon = fullSweep(origin, radius, walls, undefined, channel);
  const plan: ReferencePlan = { ...base, values, counts, cast, polygon, starts, stops: new Map(), gaps: [], hiddenEnds, ends };
  const castIndices = values.flatMap((_, i) => (cast[i] ? [i] : []));
  for (const i of castIndices) plan.stops.set(i, stopAt(plan, values[i]!));
  castIndices.forEach((left, k) => {
    const wraps = k === castIndices.length - 1;
    const right = castIndices[(k + 1) % castIndices.length]!;
    const inner: number[] = [];
    for (let i = (left + 1) % values.length; i !== right; i = (i + 1) % values.length) inner.push(i);
    if (inner.length) plan.gaps.push({ left, right, inner, wraps, verdict: classify(plan, left, right, wraps) });
  });
  return plan;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const cross = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const toSeg = (p: Point, s: Point, e: Point): number => {
    const ex = e.x - s.x, ey = e.y - s.y, l = ex * ex + ey * ey;
    const f = l === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * ex + (p.y - s.y) * ey) / l));
    return Math.hypot(p.x - s.x - ex * f, p.y - s.y - ey * f);
  };
  return Math.min(toSeg(a, c, d), toSeg(b, c, d), toSeg(c, a, b), toSeg(d, a, b));
}

/** The walls in reach that come within `TIE_MARGIN` of the chord between a gap's two corners. */
export function tiesOf(plan: ReferencePlan, gap: Gap): number[] {
  const { origin } = plan.call;
  const a = cornerAt(origin, plan.values[gap.left]!, plan.stops.get(gap.left)!.t);
  const b = cornerAt(origin, plan.values[gap.right]!, plan.stops.get(gap.right)!.t);
  return plan.blocking.flatMap((w, i) => (segmentDistance(a, b, w.p1, w.p2) <= TIE_MARGIN ? [i] : []));
}

/** How many rays the culled sweep casts for this plan: every cast value, and every hidden value of a gap that does not pass. */
export function castCount(plan: ReferencePlan): number {
  return plan.cast.filter(Boolean).length + plan.gaps.reduce((sum, gap) => sum + (gap.verdict === 'pass' ? 0 : gap.inner.length), 0);
}
