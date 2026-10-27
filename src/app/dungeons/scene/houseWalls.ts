/**
 * What a house's walls need beyond a dungeon's (`DungeonFloor.walls === 'edges'`): a secret door's
 * doorway, which the map draws as wall, as a short passage its door closes; and every window, where the outer wall is cut
 * and a wall that stops a token but neither sight nor light stands instead.
 */

import type { DungeonWindow } from '../model';
import type { RectShape, Vec } from '../render/geometry';
import { windowSpan } from '../render/houseShapes';
import type { VisibleFloor } from '../render/visibleDungeon';
import { STEPS, hitsOnRing, type DoorLine, type RingHit } from './wallOutline';

const EPS = 1e-9;

/** The doorways of a house's secret doors: passages through the wall, which their doors close. */
export function secretDoorways(visible: Pick<VisibleFloor, 'doors' | 'house'>): RectShape[] {
  const { house } = visible;
  return house ? visible.doors.filter((door) => door.kind === 'secret').map((door) => house.doorways.get(door)!) : [];
}

/** Where a window's two ends cut the nearest wall ring: a line through each end, across the wall. */
export function windowCuts(rings: readonly Vec[][], window: DungeonWindow, reach: number): [RingHit, RingHit] | null {
  const ends = windowSpan(window).map((at) => nearestHit(rings, { at, across: { x: window.dir.x, y: window.dir.y } }, reach));
  const [a, b] = ends;
  return a && b ? [a, b] : null;
}

function nearestHit(rings: readonly Vec[][], line: DoorLine, reach: number): RingHit | null {
  const hits: RingHit[] = [];
  rings.forEach((_, r) => hitsOnRing(rings, r, line, hits));
  const best = hits.filter((h) => Math.abs(h.t) <= reach).reduce<RingHit | null>((p, h) => (p && Math.abs(p.t) <= Math.abs(h.t) ? p : h), null);
  // On the snapping grid, as every corner of the rings is.
  return best && { ...best, point: { x: Math.round(best.point.x * STEPS) / STEPS, y: Math.round(best.point.y * STEPS) / STEPS } };
}

/** Whether a ring's edge from `a` to `b` lies between a window's two cuts: the glass, not the wall. */
export function onWindow(cuts: readonly [RingHit, RingHit][]): (a: Vec, b: Vec) => boolean {
  const boxes = cuts.map(([p, q]) => ({
    x0: Math.min(p.point.x, q.point.x) - EPS,
    y0: Math.min(p.point.y, q.point.y) - EPS,
    x1: Math.max(p.point.x, q.point.x) + EPS,
    y1: Math.max(p.point.y, q.point.y) + EPS,
  }));
  return (a, b) => boxes.some((r) => [a, b].every((v) => v.x >= r.x0 && v.x <= r.x1 && v.y >= r.y0 && v.y <= r.y1));
}
