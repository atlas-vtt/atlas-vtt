import type { DungeonModel, DungeonRoom } from '../../../src/app/dungeons/model';
import type { DungeonPlacement } from '../../../src/app/dungeons/scene/toWalls';
import type { WallSegment } from '../../../src/app/types/wallTypes';

export interface Point {
  x: number;
  y: number;
}

/** A cell point in world pixels. */
export const toWorld = (p: Point, { originCell, pxPerCell }: DungeonPlacement): Point => ({
  x: (p.x - originCell.x) * pxPerCell,
  y: (p.y - originCell.y) * pxPerCell,
});

/** Whether segments a–b and c–d share a point, ends included. */
export function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point): number => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (o: Point, p: Point, q: Point): boolean =>
    Math.min(o.x, p.x) <= q.x && q.x <= Math.max(o.x, p.x) && Math.min(o.y, p.y) <= q.y && q.y <= Math.max(o.y, p.y);
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}

/** The walls a straight way from `a` to `b` crosses. */
export const wallsCrossed = (walls: readonly WallSegment[], a: Point, b: Point): WallSegment[] =>
  walls.filter(wall => crosses(a, b, wall.p1, wall.p2));

/** Directions of rays from a room's middle that reach `far` pixels without meeting a wall: none, for an enclosed room. */
export function escapingRays(walls: readonly WallSegment[], room: DungeonRoom, placement: DungeonPlacement, far: number, rays = 72): number[] {
  // A cave's room is its cells: the rays leave from the middle of the one nearest its rectangle's middle.
  const mid = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const near = room.cells?.reduce((best, c) => (Math.hypot(c.x + 0.5 - mid.x, c.y + 0.5 - mid.y) < Math.hypot(best.x + 0.5 - mid.x, best.y + 0.5 - mid.y) ? c : best));
  const centre = toWorld(near ? { x: near.x + 0.5 + 0.013, y: near.y + 0.5 + 0.007 } : mid, placement);
  const out: number[] = [];
  for (let i = 0; i < rays; i++) {
    // Off the grid's directions, so no ray runs exactly along a wall
    const a = ((i + 0.37) / rays) * Math.PI * 2;
    const end = { x: centre.x + Math.cos(a) * far, y: centre.y + Math.sin(a) * far };
    if (wallsCrossed(walls, centre, end).length === 0) out.push(a);
  }
  return out;
}

/** Wall ends shared by fewer than two walls: a chain left open somewhere. */
export function looseEnds(walls: readonly WallSegment[]): Point[] {
  const count = new Map<string, number>();
  for (const wall of walls) {
    for (const p of [wall.p1, wall.p2]) count.set(`${p.x},${p.y}`, (count.get(`${p.x},${p.y}`) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n < 2).map(([key]) => {
    const [x, y] = key.split(',').map(Number);
    return { x: x!, y: y! };
  });
}

/** Walls whose two ends another wall has too, in either order. */
export function duplicateWalls(walls: readonly WallSegment[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const { p1, p2 } of walls) {
    const [a, b] = [`${p1.x},${p1.y}`, `${p2.x},${p2.y}`].sort();
    const key = `${a}|${b}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  return duplicates;
}

/** Walls lying on top of each other along part of their length. */
export function overlappingWalls(walls: readonly WallSegment[]): number {
  let overlaps = 0;
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]!;
      const b = walls[j]!;
      const ux = a.p2.x - a.p1.x;
      const uy = a.p2.y - a.p1.y;
      const len = Math.hypot(ux, uy);
      const off = (p: Point): number => Math.abs((p.x - a.p1.x) * uy - (p.y - a.p1.y) * ux) / len;
      if (off(b.p1) > 1e-6 || off(b.p2) > 1e-6) continue;
      const along = (p: Point): number => ((p.x - a.p1.x) * ux + (p.y - a.p1.y) * uy) / len;
      const lo = Math.max(0, Math.min(along(b.p1), along(b.p2)));
      const hi = Math.min(len, Math.max(along(b.p1), along(b.p2)));
      if (hi - lo > 1e-6) overlaps++;
    }
  }
  return overlaps;
}

/** The far end of the dungeon from any point of it, in world pixels: rays this long leave the map. */
export function farReach(model: DungeonModel, placement: DungeonPlacement): number {
  const rooms = model.floors.flatMap(f => f.rooms);
  const xs = rooms.flatMap(r => [r.x - 2, r.x + r.w + 2]);
  const ys = rooms.flatMap(r => [r.y - 2, r.y + r.h + 2]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * placement.pxPerCell * 2;
}
