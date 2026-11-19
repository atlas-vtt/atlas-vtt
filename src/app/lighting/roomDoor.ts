import { placeDoor, pointAlong, shareAlong } from '../pixi/lighting/wallEdits';
import type { Point } from '../types/visionTypes';
import type { WallInput, WallSegment } from '../types/wallTypes';

/** World pixels: an end of the drawn door counts over the door cut out of a wall only where it lies this far beyond it. */
const BEYOND_CUT = 0.5;

/** `end` moved on along the line from `other`, to the first wall within `reach`, and a pixel past it. */
export function extended(end: Point, other: Point, walls: readonly { p1: Point; p2: Point }[], reach: number): Point {
  const length = Math.hypot(end.x - other.x, end.y - other.y);
  if (length === 0) return end;
  const dx = (end.x - other.x) / length;
  const dy = (end.y - other.y) / length;
  let nearest = Infinity;
  for (const { p1, p2 } of walls) {
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((p1.x - end.x) * ey - (p1.y - end.y) * ex) / denom;
    const u = ((p1.x - end.x) * dy - (p1.y - end.y) * dx) / denom;
    if (t >= 0 && t <= reach && u >= 0 && u <= 1) nearest = Math.min(nearest, t);
  }
  return nearest === Infinity ? end : { x: end.x + dx * (nearest + 1), y: end.y + dy * (nearest + 1) };
}

/** How far `point` lies from the line through `wall`; Infinity for a wall without length. */
function offLine(point: Point, wall: Pick<WallSegment, 'p1' | 'p2'>): number {
  const dx = wall.p2.x - wall.p1.x;
  const dy = wall.p2.y - wall.p1.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? Infinity : Math.abs((point.x - wall.p1.x) * dy - (point.y - wall.p1.y) * dx) / length;
}

/**
 * The walls a door dragged from `a` to `b` removes and adds. An end within `reach` of a wall ahead
 * of it is pushed onto that wall, so no light slips past a door drawn a little short; a wall the door
 * is drawn along is cut around it as the walls mode places a door (`placeDoor`), so opening the door
 * opens the wall.
 */
export function roomDoor(a: Point, b: Point, walls: readonly WallSegment[], reach: number, type: 'door' | 'secret-door'): { remove: string[]; add: WallInput[] } {
  const from = extended(a, b, walls, reach);
  const to = extended(b, a, walls, reach);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const along = (p: Point): number => ((p.x - from.x) * (to.x - from.x) + (p.y - from.y) * (to.y - from.y)) / length;
  const remove: string[] = [];
  const add: WallInput[] = [];
  const cutEnds: Point[] = [];
  let door: WallInput = { type, p1: from, p2: to, closed: true };
  for (const wall of walls) {
    if (wall.type !== 'solid' || offLine(from, wall) > reach || offLine(to, wall) > reach) continue;
    const [s1, s2] = [shareAlong(wall, from) ?? 0, shareAlong(wall, to) ?? 0];
    const start = Math.max(0, Math.min(s1, s2));
    const end = Math.min(1, Math.max(s1, s2));
    const overlap = (end - start) * Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    // A door that only touches the wall, or crosses it, leaves it whole.
    if (overlap <= reach) continue;
    remove.push(wall.id);
    for (const piece of placeDoor(wall, pointAlong(wall, (start + end) / 2), overlap, type)) {
      if (piece.type !== type) add.push(piece);
      else {
        door = piece;
        cutEnds.push(piece.p1, piece.p2);
      }
    }
  }
  if (cutEnds.length === 0) return { remove, add: [door] };
  // The door spans what it cut out of the walls, and the drawn door where it reaches past that.
  const first = cutEnds.reduce((best, p) => (along(p) < along(best) ? p : best));
  const last = cutEnds.reduce((best, p) => (along(p) > along(best) ? p : best));
  const p1 = along(from) < along(first) - BEYOND_CUT ? from : first;
  const p2 = along(to) > along(last) + BEYOND_CUT ? to : last;
  return { remove, add: [...add, { ...door, p1, p2 }] };
}
