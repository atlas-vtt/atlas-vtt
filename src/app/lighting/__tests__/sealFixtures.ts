import type { WallChannel, WallSegment } from '../../types/wallTypes';
import { blocksFrom } from '../../vision/visibility';
import { sealTolerance } from '../lightingConstants';
import { crosses, segOf } from '../segments';

/** What the sealing tests share: walls, a seeded random number, and the bridging the capped one is held against. */

export const TOLERANCE = sealTolerance(2);
export type XY = { x: number; y: number };
const OVERSHOOT = 0.01;

export function wall(id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra };
}

/** A seeded random number in [0, 1). */
export function random(seed: number): () => number {
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
}

export const key = (p: XY): string => `${p.x},${p.y}`;

function bridge(id: string, p1: XY, p2: XY): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { ...p1 }, p2: { ...p2 } };
}

/**
 * Sealing as it was before the bridges were capped, by brute force: a bridge for every pair of
 * distinct wall ends of different walls within the tolerance, and from every wall end across
 * every wall whose middle it stops short of. Returns the walls followed by the bridges.
 */
export function sealAllPairs(walls: readonly WallSegment[], tolerance = TOLERANCE): WallSegment[] {
  const ends = walls.flatMap((w, i) => (w.p1.x === w.p2.x && w.p1.y === w.p2.y ? [] : [{ wall: i, end: 'p1', point: w.p1 }, { wall: i, end: 'p2', point: w.p2 }]));
  const pairs = new Map<string, WallSegment>();
  for (const a of ends) {
    for (const b of ends) {
      const distance = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
      if (b.wall <= a.wall || distance === 0 || distance > tolerance) continue;
      const pair = [key(a.point), key(b.point)].sort().join('|');
      if (!pairs.has(pair)) pairs.set(pair, bridge(`all:${walls[a.wall]!.id}:${a.end}:${walls[b.wall]!.id}:${b.end}`, a.point, b.point));
    }
  }
  const middles: WallSegment[] = [];
  walls.forEach((w, j) => {
    const dx = w.p2.x - w.p1.x, dy = w.p2.y - w.p1.y;
    const length2 = dx * dx + dy * dy;
    if (length2 === 0) return;
    const done = new Set<string>();
    for (const end of ends) {
      const p = end.point;
      if (end.wall === j || done.has(key(p))) continue;
      if (Math.hypot(p.x - w.p1.x, p.y - w.p1.y) <= tolerance || Math.hypot(p.x - w.p2.x, p.y - w.p2.y) <= tolerance) continue;
      const u = ((p.x - w.p1.x) * dx + (p.y - w.p1.y) * dy) / length2;
      if (u <= 0 || u >= 1) continue;
      const foot = { x: w.p1.x + dx * u, y: w.p1.y + dy * u };
      const distance = Math.hypot(p.x - foot.x, p.y - foot.y);
      if (distance > tolerance || distance < 1e-9) continue;
      done.add(key(p));
      middles.push(bridge(`all:${walls[end.wall]!.id}:${end.end}:${w.id}`, p, { x: foot.x + ((foot.x - p.x) / distance) * OVERSHOOT, y: foot.y + ((foot.y - p.y) / distance) * OVERSHOOT }));
    }
  });
  return [...walls, ...pairs.values(), ...middles];
}

/**
 * Whether something of `walls` stops what goes from `a` to `b`, sight or light or (without a
 * channel) either: open doors stop nothing, one-way walls only from their blocking side, a wall
 * for one thing only that thing.
 */
export function stops(a: XY, b: XY, walls: readonly WallSegment[], channel?: WallChannel): WallSegment | undefined {
  return walls.find((w) => blocksFrom(w, a, channel) && crosses(a.x, a.y, b.x, b.y, segOf(w)));
}

/** Whether `p` is farther than the tolerance from every end of `walls`: the bridges of a junction say nothing about what lies nearer. */
export function clearOfEnds(p: XY, walls: readonly WallSegment[], tolerance = TOLERANCE): boolean {
  return walls.every((w) => Math.hypot(p.x - w.p1.x, p.y - w.p1.y) > tolerance && Math.hypot(p.x - w.p2.x, p.y - w.p2.y) > tolerance);
}
