import type { CellPoint, DungeonRiverBridge } from '../model';
import type { Rng } from '../rng';
import { fractalNoise } from '../water/noise';
import { normalAt } from './riverShape';

/** A road's line from its route: smoothed into curves, wandering a little, straight over its bridges (`forestRoads`). */

type Vec = CellPoint;

/** How far a bridge's approach runs straight beyond its ends, in cells. */
export const APPROACH = 1.4;
/** How many of the route's cells before and after a bridge's approach the route gives way to it. */
const LEAD_IN = 2;
/** How far a road's line wanders either way of the route, in cells. */
const WANDER = 0.35;

/**
 * The road's line: the route's cells smoothed into gentle curves, wandering a little, and straight
 * over each bridge and its approaches, so it meets the bridge square.
 */
export function roadLine(cells: readonly Vec[], bridged: readonly { bridge: DungeonRiverBridge }[], rng: Rng, field: { distance(x: number, y: number): number }): Vec[] {
  const route = cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
  // Each bridge cuts the route: the route up to it, the straight way over it, the route from it.
  const fixed = bridged.map(({ bridge }) => {
    const reach = bridge.length / 2 + APPROACH;
    const start = { x: bridge.at.x - bridge.along.x * reach, y: bridge.at.y - bridge.along.y * reach };
    const end = { x: bridge.at.x + bridge.along.x * reach, y: bridge.at.y + bridge.along.y * reach };
    // The route gives way a couple of cells short of each approach, so the curve leads into it rather than doubling back.
    return { start, end, from: Math.max(0, nearestIndex(route, start) - LEAD_IN), to: Math.min(route.length - 1, nearestIndex(route, end) + LEAD_IN) };
  }).sort((a, b) => a.from - b.from);
  const noise = fractalNoise(rng, 2, 0.5, 9);
  // It never wanders towards water it passes near.
  const wander = (x: number, y: number): number => noise(x, y) * Math.max(0, Math.min(1, field.distance(x, y) - 1));
  const line: Vec[] = [];
  let from = 0;
  let begin = route[0]!;
  for (const piece of fixed) {
    line.push(...wandering(smooth([begin, ...route.slice(from + 1, Math.max(from + 1, piece.from)), piece.start]), wander));
    line.push(...straight(piece.start, piece.end));
    from = piece.to;
    begin = piece.end;
  }
  // On to the route's end, past the map's edge, however near it the last bridge stands.
  line.push(...wandering(smooth([begin, ...route.slice(Math.min(from + 1, route.length - 1))]), wander));
  return line;
}

function nearestIndex(line: readonly Vec[], p: Vec): number {
  let best = 0;
  line.forEach((q, i) => { if (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(line[best]!.x - p.x, line[best]!.y - p.y)) best = i; });
  return best;
}

/** A route's corners cut until it runs in curves (Chaikin, ends kept), every quarter cell. */
function smooth(points: readonly Vec[]): Vec[] {
  let line = points.filter((p, i) => i === 0 || i === points.length - 1 || i % 2 === 0);
  for (let round = 0; round < 4; round++) {
    const next: Vec[] = [line[0]!];
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(line[line.length - 1]!);
    line = next;
  }
  return everyQuarter(line);
}

/** Points about a quarter cell apart along a line. */
function everyQuarter(line: readonly Vec[]): Vec[] {
  const out: Vec[] = [line[0]!];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function straight(a: Vec, b: Vec): Vec[] {
  return everyQuarter([a, b]).slice(1);
}

/** The line pushed a little either way of itself by slow noise, never at its ends, where it meets a bridge or the map's edge. */
function wandering(line: readonly Vec[], wander: (x: number, y: number) => number): Vec[] {
  return line.map((p, i) => {
    const hold = Math.min(1, i / 8, (line.length - 1 - i) / 8);
    const n = normalAt(line, i);
    const off = wander(p.x, p.y) * 2 * WANDER * hold;
    return { x: p.x + n.x * off, y: p.y + n.y * off };
  });
}

/** How far apart, in a road's points, two headings are compared, and how far a road may turn back over that stretch: no road doubles back on itself in a few cells (a road into an entrance and out again beside itself). */
const HAIRPIN_SPAN = 20;
const HAIRPIN_TURN = -0.35;

export function hairpin(line: readonly Vec[]): boolean {
  const heading = (i: number): Vec => {
    const a = line[Math.max(0, i - 2)]!;
    const b = line[Math.min(line.length - 1, i + 2)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  };
  for (let i = 0; i + HAIRPIN_SPAN < line.length; i += 2) {
    const a = heading(i);
    const b = heading(i + HAIRPIN_SPAN);
    if (a.x * b.x + a.y * b.y < HAIRPIN_TURN) return true;
  }
  return false;
}
