import type { CellPoint } from '../model';

type Vec = CellPoint;

/** How far before the road a joining path begins to turn into it, beyond the road's own half width, in cells. */
const TURN_IN = 1.6;
/** How far along the road a joining path runs into it, as a share of the turn-in's length: it meets the road at a slant, as a fork in a track does, never square. */
const ALONG = 0.9;
/** How far apart the merging curve's points lie, in cells. */
const STEP = 0.25;

/**
 * A path's line run on into the road it joins, as a fork in a track joins: from `TURN_IN` cells
 * short of the road's edge it bends the way the road goes (whichever way the path was heading
 * more), and ends on the road's middle line, running along it. Its worn ground then lies inside the
 * road's from the edge on and the two tracks blend; a path that stopped at the cell beside the road
 * ended up to a cell short of it, cut off square.
 */
export function mergedInto(path: readonly Vec[], road: readonly Vec[], roadWidth: number): Vec[] {
  if (path.length < 2 || road.length < 2) return [...path];
  const end = path[path.length - 1]!;
  const meet = nearestOnLine(road, end);
  const reach = roadWidth / 2 + TURN_IN;
  // Where the turn begins: the last point of the path at least `reach` from where it meets the road.
  let start = path.length - 1;
  while (start > 0 && Math.hypot(path[start]!.x - meet.at.x, path[start]!.y - meet.at.y) < reach) start--;
  const from = path[start]!;
  const heading = unit(sub(from, path[Math.max(0, start - 4)]!), sub(end, from));
  const tangent = roadTangent(road, meet.index);
  const way = heading.x * tangent.x + heading.y * tangent.y < 0 ? -1 : 1;
  const { at: to, index } = alongLine(road, meet, way * reach * ALONG);
  // The road's own heading where the path ends on it, so the two run on as one however the road bends.
  const there = roadTangent(road, index, 2);
  const onward = { x: there.x * way, y: there.y * way };
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const a = { x: from.x + heading.x * span * 0.45, y: from.y + heading.y * span * 0.45 };
  const b = { x: to.x - onward.x * span * 0.45, y: to.y - onward.y * span * 0.45 };
  const steps = Math.max(2, Math.ceil(span / STEP));
  const curve = Array.from({ length: steps }, (_, k) => bezier(from, a, b, to, (k + 1) / steps));
  return [...path.slice(0, start + 1), ...curve];
}

interface OnLine {
  at: Vec;
  /** The segment it lies on, from point `index` to the next. */
  index: number;
}

function nearestOnLine(line: readonly Vec[], p: Vec): OnLine {
  let best: OnLine = { at: line[0]!, index: 0 };
  let bestDistance = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const at = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = { at, index: i };
    }
  }
  return best;
}

/** The point `distance` cells along the line from `from` (backwards where negative), stopping at its ends, and the point of the line nearest it. */
function alongLine(line: readonly Vec[], from: OnLine, distance: number): { at: Vec; index: number } {
  const forward = distance >= 0;
  let left = Math.abs(distance);
  let at = from.at;
  let i = forward ? from.index + 1 : from.index;
  while (i >= 0 && i < line.length) {
    const next = line[i]!;
    const d = Math.hypot(next.x - at.x, next.y - at.y);
    if (d >= left) return { at: { x: at.x + ((next.x - at.x) * left) / (d || 1), y: at.y + ((next.y - at.y) * left) / (d || 1) }, index: i };
    left -= d;
    at = next;
    i += forward ? 1 : -1;
  }
  return { at, index: Math.max(0, Math.min(line.length - 1, i)) };
}

/** The road's heading at point `index`, over `reach` points either side: a couple of cells where a wandering road's small wiggles must not turn it. */
function roadTangent(line: readonly Vec[], index: number, reach = 6): Vec {
  const a = line[Math.max(0, index - reach)]!;
  const b = line[Math.min(line.length - 1, index + reach)]!;
  return unit(sub(b, a), { x: 1, y: 0 });
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** `v` at unit length, or `fallback` where it has none. */
function unit(v: Vec, fallback: Vec): Vec {
  const len = Math.hypot(v.x, v.y);
  if (len > 1e-9) return { x: v.x / len, y: v.y / len };
  const other = Math.hypot(fallback.x, fallback.y) || 1;
  return { x: fallback.x / other, y: fallback.y / other };
}

function bezier(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return { x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x, y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y };
}
