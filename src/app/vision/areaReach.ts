import { distToSeg, segOf, splitBlocking, solidSegments, type Seg } from '../lighting/segments';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { inBox, polygonBox } from './polygonBounds';
import { computeVisibility, pointInPolygon, type Polygon } from './visibility';

/**
 * Where a light that glows from an area (`LightSource.area`, lava) reaches, for the rules: a
 * point is lit by it at the distance to the nearest point of the area it has a clear line to,
 * and at 0 inside the area. Any clear line from a point outside to the area crosses the area's
 * outline first, so the outline alone decides: the reach is the union of the reaches of points
 * along it, each traced as a point light's (`computeVisibility`, channel `light`).
 */

/** Points along an area's outline the rules trace from, as a share of a grid cell apart. */
export const AREA_SAMPLE_SPACING = 0.25;
/** Most points traced for one area light: a long shore is sampled more thinly, so a wall's edit never retraces without end. */
export const MAX_AREA_SAMPLES = 128;

/** Where light from one point of an area's outline reaches: within `dim` of `origin`, as walls leave it. */
export interface LightReachPart {
  origin: Point;
  polygon: Polygon;
}

/** How an area's outline is sampled: the spacing, in world pixels, and how near a wall a point may lie. */
export interface AreaSampling {
  spacing: number;
  /**
   * The picture ends a light at the capsules around walls (`wallRadius`): a point of the outline
   * this near a wall is left out, so no point stands on a wall's centre line and sees past it. A
   * shore that lies on a wall gives no light past it; the shores beside it light the room.
   */
  clearance: number;
}

const twoWays = new WeakMap<readonly WallSegment[], readonly WallSegment[]>();

/**
 * `walls` with every one-way wall blocking both ways. An area light shines from both sides of a
 * one-way wall that crosses it, so its tile treats such a wall as a wall (`TileCache`), and the
 * rule does the same. The same list for the same walls, so the sweep's grid of them is kept.
 */
export function twoWayWalls(walls: readonly WallSegment[]): readonly WallSegment[] {
  if (!walls.some((wall) => wall.direction)) return walls;
  let list = twoWays.get(walls);
  if (!list) {
    list = walls.map((wall) => {
      if (!wall.direction) return wall;
      const { direction: _direction, ...rest } = wall;
      return rest;
    });
    twoWays.set(walls, list);
  }
  return list;
}

/**
 * The points of `area`'s outline the rule traces from: its corners, which reach farthest (a corner
 * that pokes past a wall lights what lies there), and points evenly along it, `spacing` apart, or
 * more thinly where that would make more than `MAX_AREA_SAMPLES` in all (an outline of more corners
 * than that keeps every so many of them); none within the clearance of a wall that blocks light.
 */
export function areaSamples(area: readonly Point[], walls: readonly WallSegment[], { spacing, clearance }: AreaSampling): Point[] {
  const lengths = area.map((a, i) => {
    const b = area[(i + 1) % area.length]!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  if (perimeter <= 0) return [];
  const cornerStep = Math.max(1, Math.ceil(area.length / (MAX_AREA_SAMPLES / 2)));
  const corners = area.filter((_, i) => i % cornerStep === 0);
  const count = Math.min(MAX_AREA_SAMPLES - corners.length, Math.ceil(perimeter / Math.max(spacing, 1e-3)));
  const step = perimeter / count;
  const near = nearbySegments(area, walls, clearance);
  const samples: Point[] = [];
  const keep = (point: Point): void => {
    if (near.every((seg) => distToSeg(point.x, point.y, seg) >= clearance)) samples.push(point);
  };
  corners.forEach(keep);
  let edge = 0;
  let start = 0;
  for (let k = 0; k < count; k++) {
    const s = (k + 0.5) * step;
    while (edge < area.length - 1 && s > start + lengths[edge]!) start += lengths[edge++]!;
    const a = area[edge]!;
    const b = area[(edge + 1) % area.length]!;
    const t = Math.min(1, (s - start) / (lengths[edge]! || 1));
    keep({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return samples;
}

/** The walls that block light within `margin` of the bounds of `points`, as segments. */
export function nearbySegments(area: readonly Point[], walls: readonly WallSegment[], margin: number): Seg[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { x, y } of area) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  x0 -= margin; y0 -= margin; x1 += margin; y1 += margin;
  const blocking = splitBlocking(walls, 'light');
  return [...solidSegments(blocking), ...blocking.limited.map(segOf)].filter(([ax, ay, bx, by]) => Math.max(ax, bx) >= x0 && Math.min(ax, bx) <= x1 && Math.max(ay, by) >= y0 && Math.min(ay, by) <= y1);
}

/** Where light from `area` reaches within `dim`: the reach of every point the rule traces along its outline. */
export function areaParts(area: readonly Point[], dim: number, walls: readonly WallSegment[], sampling: AreaSampling): LightReachPart[] {
  const solid = twoWayWalls(walls);
  return areaSamples(area, solid, sampling).map((origin) => ({ origin, polygon: computeVisibility(origin, dim, solid, undefined, 'light') }));
}

/** An area light's reach as the rules read it: the area, and the parts beyond it. */
interface AreaReach {
  polygon: Polygon;
  parts?: readonly LightReachPart[];
}

/**
 * How far `point` lies from the nearest point of the area it has a clear line to, as the rule
 * counts it: 0 inside the area, the distance to the nearest traced point of the outline that
 * reaches it, or Infinity where none does. Points of the outline farther than `limit` are not asked:
 * a caller that counts nothing beyond it gets Infinity instead of their distance.
 */
export function areaDistance(point: Point, { polygon, parts = [] }: AreaReach, limit = Infinity): number {
  if (pointInPolygon(point, polygon)) return 0;
  let best = Infinity;
  for (const part of parts) {
    const distance = Math.hypot(point.x - part.origin.x, point.y - part.origin.y);
    if (distance < best && distance <= limit && inBox(point, polygonBox(part.polygon)) && pointInPolygon(point, part.polygon)) best = distance;
  }
  return best;
}
