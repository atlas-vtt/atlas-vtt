import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { buildWallGrid, type WallGrid } from '../../src/app/vision/wallGrid';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { raySegmentIntersect } from '../oracles/visibilityBaseline/visionGeometry';
import { wall, type VisibilityTrial } from './visibilityScenes';

/** A trial with a wall seen almost edge-on and the wall across the sight line just before its near end. */
export interface CellSidesTrial extends VisibilityTrial {
  edgeOn: WallSegment;
  inFront: WallSegment;
}

/** How far before the edge-on wall's near end the side of a cell lies, and the wall in front of that side. */
const PLACES = [[0.002, 0.005], [0.003, 0.02], [0.01, 0.1], [0.05, 0.6]] as const;
const RADIUS = 20_000;

/** How far along the ray from `origin` in direction (`dx`, `dy`) it crosses the sides of the grid's cells, between `from` and `to`. */
function cellSides(grid: WallGrid, origin: Point, dx: number, dy: number, from: number, to: number): number[] {
  const sides: number[] = [];
  for (let k = 0; k <= grid.cols; k++) sides.push((grid.minX + k * grid.cell - origin.x) / dx);
  for (let k = 0; k <= grid.rows; k++) sides.push((grid.minY + k * grid.cell - origin.y) / dy);
  return sides.filter((t) => t > from && t < to);
}

/**
 * A slanted wall whose line passes the origin within a few billionths of a pixel, a wall across
 * the sight line a hair before its near end, and the side of a grid cell between the two. Along a
 * wall seen so nearly edge-on the sweep's arithmetic rounds a hit without bound, so its ray towards
 * that end may stop "on" the wall well before it stands: before the wall in front, in a cell that
 * does not list it.
 */
export function cellSidesTrial(seed: number): CellSidesTrial {
  const rand = rng(seed * 15485863);
  const turn = 0.2 + rand() * 1.1, c = Math.cos(turn), s = Math.sin(turn);
  const place = (x: number, y: number): Point => ({ x: 3000 + x * c - y * s, y: 3000 + x * s + y * c });
  const length = 60 + rand() * 300, off = 10 ** (-9.5 + rand() * 1.5);
  const others = [wall({ x: 0, y: 0 }, { x: 80, y: 0 }), wall({ x: 9000, y: 9000 }, { x: 9000, y: 8920 })];
  for (let i = 0; i < 30; i++) {
    const x = rand() * 9000, y = rand() * 9000, a = rand() * 7;
    others.push(wall({ x, y }, { x: x + Math.cos(a) * 80, y: y + Math.sin(a) * 80 }));
  }
  const origin = place(0, off);
  const build = (near: number, gap: number): WallSegment[] => [wall(place(near, 0), place(near + length, 0)), wall(place(near - gap, -25), place(near - gap, 25)), ...others];
  const [ahead, gap] = PLACES[seed % PLACES.length]!;
  const sides = cellSides(buildWallGrid(build(1500, gap)), origin, c, s, 300, 2500);
  const walls = build(sides[Math.floor(rand() * sides.length)]! + ahead, gap);
  return { family: 'cell sides', seed, walls, calls: [{ origin, radius: RADIUS, channel: 'sight' }, { origin, radius: RADIUS / 4, channel: 'light' }], edgeOn: walls[0]!, inFront: walls[1]! };
}

/** Whether the full sweep's ray towards the edge-on wall's near end stops on that wall before the wall in front of it. */
export function stopsBeforeTheWallInFront({ calls, edgeOn, inFront }: CellSidesTrial): boolean {
  const origin = calls[0]!.origin;
  const angle = Math.atan2(edgeOn.p1.y - origin.y, edgeOn.p1.x - origin.x);
  return raySegmentIntersect(origin, angle, edgeOn.p1, edgeOn.p2) < raySegmentIntersect(origin, angle, inFront.p1, inFront.p2);
}
