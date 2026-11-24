import type { Point } from '../types/visionTypes';

const PLUG_SIDES = 16;
/** Wall ends closed off whole share a plug where they lie in the same square of this size. */
const PLUG_CELL = 0.125;

/**
 * What closes wall ends that walls beyond counting pass: around each, a polygon of
 * `PLUG_SIDES` sides that holds every landing its own bridges could have, which lie within
 * `reach` of it (the tolerance, and the hair a bridge lands past its wall). Every ray those bridges would stop
 * comes from outside the polygon and crosses one of them inside it, so the polygon stops it
 * too. Ends in one square of `PLUG_CELL` share a polygon, around the square's middle and wider
 * by the square's half diagonal, so a heap of such ends costs a handful of bridges. A polygon
 * reaches a little past the tolerance at its corners (0.45 px from an end at a tolerance of 13),
 * where it closes more than a bridge for every pair would; the octagon it replaces reached
 * 1.1 px past it. It cannot stay within the tolerance and hold every landing: those lie up to
 * the tolerance away on every side, and it is the landings it must not let a ray pass between.
 */
export function plugs(ends: readonly Point[], reach: number): { id: string; p1: Point; p2: Point }[] {
  const cells = new Map<string, Point>();
  for (const point of ends) {
    const [ix, iy] = [Math.floor(point.x / PLUG_CELL), Math.floor(point.y / PLUG_CELL)];
    if (!cells.has(`${ix}:${iy}`)) cells.set(`${ix}:${iy}`, { x: (ix + 0.5) * PLUG_CELL, y: (iy + 0.5) * PLUG_CELL });
  }
  // The sides lie this far from the middle or farther: past every landing of every end in the square.
  const inner = reach + PLUG_CELL * Math.SQRT1_2;
  const radius = inner / Math.cos(Math.PI / PLUG_SIDES);
  return [...cells].flatMap(([cell, middle]) => {
    const corner = (k: number): Point => ({ x: middle.x + Math.cos((k * 2 * Math.PI) / PLUG_SIDES) * radius, y: middle.y + Math.sin((k * 2 * Math.PI) / PLUG_SIDES) * radius });
    return Array.from({ length: PLUG_SIDES }, (_, k) => ({ id: `seal:plug:${cell}:${k}`, p1: corner(k), p2: corner(k + 1) }));
  });
}

/** The bridges from `point` whose landings are corners of the convex hull of the point and all the landings. */
export function farthest<T extends { landing: Point }>(point: Point, bridges: readonly T[]): T[] {
  const corners: { at: Point; bridge: T | null }[] = [{ at: point, bridge: null }, ...bridges.map((candidate) => ({ at: candidate.landing, bridge: candidate }))];
  corners.sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  // Andrew's monotone chain; a landing on a line between two others is no corner.
  const turnsLeft = (o: Point, a: Point, b: Point): boolean => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) > 1e-9;
  const half = (order: typeof corners): typeof corners => {
    const hull: typeof corners = [];
    for (const corner of order) {
      while (hull.length >= 2 && !turnsLeft(hull[hull.length - 2]!.at, hull[hull.length - 1]!.at, corner.at)) hull.pop();
      hull.push(corner);
    }
    return hull;
  };
  const hull = new Set([...half(corners), ...half([...corners].reverse())]);
  return bridges.filter((candidate) => [...hull].some((corner) => corner.bridge === candidate));
}
