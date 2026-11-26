/**
 * An area's rings as an effect draws them: the pieces walls cut it into, each with what stands
 * free inside it, and the few numbers of its shape the looks read (where its middle lies, which
 * way it is long, how far it reaches). Pure geometry, no PIXI.
 */

import type { Point } from '../../../types/visionTypes';
import { pointInPolygon } from '../../../vision/visibility';

export type Ring = readonly Point[];

/** One connected part of an area: its outline and the rings that are holes in it. */
export interface EffectPiece {
  outline: Ring;
  holes: Ring[];
}

/** Where an area's middle lies and which way it is long. */
export interface AreaFrame {
  /** Its centre of gravity, world pixels. */
  centre: Point;
  /** The direction it is longest in, one pixel long. */
  axis: Point;
  /** How much longer it is that way than across: 0 for a circle or square, towards 1 for a thin line. */
  stretch: number;
}

const isArea = (ring: Ring): boolean => ring.length >= 3 && ring.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));

/**
 * The pieces of `rings` by the even-odd rule a polygon is filled with: a ring inside an odd
 * number of others is a hole of the nearest ring around it. Rings that are no area are left out.
 */
export function effectPieces(rings: readonly Ring[]): EffectPiece[] {
  const areas = rings.filter(isArea);
  const around = areas.map((ring) => areas.filter((other) => other !== ring && pointInPolygon(ring[0]!, other as Point[])));
  const pieces = new Map<Ring, EffectPiece>();
  areas.forEach((ring, index) => {
    if (around[index]!.length % 2 === 0) pieces.set(ring, { outline: ring, holes: [] });
  });
  areas.forEach((ring, index) => {
    const outside = around[index]!;
    if (outside.length % 2 === 0) return;
    // The nearest ring around a hole is the one with the most rings around itself.
    const parent = outside.reduce((best, other) => (around[areas.indexOf(other)]!.length > around[areas.indexOf(best)]!.length ? other : best));
    pieces.get(parent)?.holes.push(ring);
  });
  return [...pieces.values()];
}

/**
 * How far `to` lies from `from` when it is the same rings moved as a whole (an aura following
 * its token), within a thousandth of a pixel; null when their shape differs.
 */
export function movedBy(from: readonly Ring[], to: readonly Ring[]): Point | null {
  if (from.length !== to.length || from.length === 0 || from[0]!.length === 0 || to[0]!.length === 0) return null;
  const dx = to[0]![0]!.x - from[0]![0]!.x;
  const dy = to[0]![0]!.y - from[0]![0]!.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  for (let r = 0; r < from.length; r++) {
    const a = from[r]!;
    const b = to[r]!;
    if (a.length !== b.length) return null;
    for (let i = 0; i < a.length; i++) {
      if (!(Math.abs(b[i]!.x - a[i]!.x - dx) <= 1e-3) || !(Math.abs(b[i]!.y - a[i]!.y - dy) <= 1e-3)) return null;
    }
  }
  return { x: dx, y: dy };
}

/** A ring's area and its first and second moments about `about`, each with the sign of the way it runs. */
function moments(ring: Ring, about: Point): { area: number; x: number; y: number; xx: number; yy: number; xy: number } {
  const sum = { area: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0 };
  for (let i = 0; i < ring.length; i++) {
    const ax = ring[i]!.x - about.x;
    const ay = ring[i]!.y - about.y;
    const next = ring[(i + 1) % ring.length]!;
    const bx = next.x - about.x;
    const by = next.y - about.y;
    const cross = ax * by - bx * ay;
    sum.area += cross / 2;
    sum.x += ((ax + bx) * cross) / 6;
    sum.y += ((ay + by) * cross) / 6;
    sum.xx += ((ax * ax + ax * bx + bx * bx) * cross) / 12;
    sum.yy += ((ay * ay + ay * by + by * by) * cross) / 12;
    sum.xy += ((ax * by + 2 * ax * ay + 2 * bx * by + bx * ay) * cross) / 24;
  }
  return sum;
}

/** The frame of the area `pieces` cover together; null where they cover nothing. */
export function areaFrame(pieces: readonly EffectPiece[]): AreaFrame | null {
  const about = pieces[0]?.outline[0];
  if (!about) return null;
  const total = { area: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0 };
  const add = (ring: Ring, sign: number): void => {
    const own = moments(ring, about);
    // Whichever way a ring runs, an outline adds its area and a hole takes its own away.
    const way = sign * Math.sign(own.area);
    total.area += way * own.area;
    total.x += way * own.x;
    total.y += way * own.y;
    total.xx += way * own.xx;
    total.yy += way * own.yy;
    total.xy += way * own.xy;
  };
  for (const { outline, holes } of pieces) {
    add(outline, 1);
    for (const hole of holes) add(hole, -1);
  }
  if (!(total.area > 0)) return null;
  const cx = total.x / total.area;
  const cy = total.y / total.area;
  const xx = total.xx / total.area - cx * cx;
  const yy = total.yy / total.area - cy * cy;
  const xy = total.xy / total.area - cx * cy;
  const mean = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  const long = mean + spread;
  const short = Math.max(0, mean - spread);
  const stretch = long > 0 ? 1 - Math.sqrt(short / long) : 0;
  // A shape as long one way as the other has no axis of its own: the map's.
  const angle = stretch < 0.02 ? 0 : Math.atan2(2 * xy, xx - yy) / 2;
  return { centre: { x: about.x + cx, y: about.y + cy }, axis: { x: Math.cos(angle), y: Math.sin(angle) }, stretch };
}

/** How far the farthest corner of `rings` lies from `from`. */
export function reachFrom(from: Point, rings: readonly Ring[]): number {
  let reach = 0;
  for (const ring of rings) for (const { x, y } of ring) reach = Math.max(reach, Math.hypot(x - from.x, y - from.y));
  return reach;
}
