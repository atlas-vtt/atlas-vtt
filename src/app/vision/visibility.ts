import type { Point } from '../types/visionTypes';
import type { WallChannel, WallSegment } from '../types/wallTypes';
import { angleTo, raySegmentIntersect } from './visionGeometry';
import { limitedJoins } from './limitedJoins';
import { limitedCrossings, limitedHit, secondCrossing, type LimitedHit } from './limitedRays';
import { clipToCone, type VisionCone } from './visionCone';
import { angularSpans, SPAN_SLACK, spanCovers, type AngularSpan } from './angularSpans';
import { blocksInReach } from './wallReach';
import { culledSweep } from './culledSweep';

export { blocksFrom } from './wallReach';

export type Polygon = Point[];

export interface MapBounds {
  width: number;
  height: number;
}

const BOUNDARY_RAYS = 64;
const RAY_OFFSET = 1e-5;

/** Walls that block `channel` from `origin` and come within `radius` of it. */
export function wallsInReach(walls: readonly WallSegment[], origin: Point, radius: number, channel?: WallChannel): WallSegment[] {
  const radiusSq = radius * radius;
  return walls.filter((wall) => blocksInReach(wall, origin, radiusSq, channel));
}

/**
 * The area visible from `origin` up to `radius`, as a star-shaped polygon around it.
 * Radial sweep: a ray at every wall endpoint (and just beside it), at every point where a
 * limited wall crosses another wall, plus evenly spaced boundary rays, each stopped by the
 * nearest wall, or by the second limited wall it crosses if that is nearer
 * (`WallSegment.limited`). With a `cone`, only its part inside the cone, closed
 * through the origin. `channel` says what is asked for, sight or light: the walls that block
 * only the other are no walls then. Without limited walls in reach the rays towards hidden
 * wall ends are not cast (`culledSweep`); the polygon is the same to the last bit.
 */
export function computeVisibility(origin: Point, radius: number, walls: readonly WallSegment[], cone?: VisionCone, channel?: WallChannel): Polygon {
  const polygon = culledSweep(origin, radius, walls, channel) ?? sweep(origin, radius, walls, channel).polygon;
  return cone && cone.angle < 2 * Math.PI ? clipToCone(origin, polygon, cone) : polygon;
}

/** A visibility polygon with, for each of its corners, the limited walls that stopped the ray there as its second, or null. */
export interface Swept {
  polygon: Polygon;
  stops: (readonly WallSegment[] | null)[];
}

/** `computeVisibility` without a cone, telling which corners of the polygon lie on a limited wall that stopped the ray. */
export function sweepVisibility(origin: Point, radius: number, walls: readonly WallSegment[], channel?: WallChannel): Swept {
  const polygon = culledSweep(origin, radius, walls, channel);
  return polygon ? { polygon, stops: polygon.map(() => null) } : sweep(origin, radius, walls, channel);
}

/**
 * What a light's tile keeps of itself where limited walls stand (`LimitedTileMask`): along
 * every ray, as far as the first limited wall, or as far as `sweepVisibility` reaches where
 * that is farther. Before the first limited wall the tile is what it is in any scene, with the
 * soft shadows of its solid walls; behind one, a light is exactly the rule's reach, because a
 * soft shadow there is made of rays from the flame's edge that crossed limited walls the ray
 * from its middle did not, which nothing counts. A ray that meets no limited wall keeps the
 * whole radius. `stops` names the limited walls an edge of the polygon lies on.
 */
export function sweepLightMask(origin: Point, radius: number, walls: readonly WallSegment[], channel?: WallChannel): Swept {
  return sweep(origin, radius, walls, channel, true);
}

function sweep(origin: Point, radius: number, walls: readonly WallSegment[], channel?: WallChannel, mask = false): Swept {
  const blocking = wallsInReach(walls, origin, radius, channel);
  // Rays count limited walls only where there are any: every other scene is swept as it always was.
  const counting = blocking.some((wall) => wall.limited);
  const hits: LimitedHit[] = [];
  const stops: Swept['stops'] = [];
  const angles: number[] = [];
  for (let i = 0; i < BOUNDARY_RAYS; i++) angles.push(-Math.PI + (2 * Math.PI * i) / BOUNDARY_RAYS);
  for (const wall of blocking) {
    for (const end of [wall.p1, wall.p2]) {
      if (end.x === origin.x && end.y === origin.y) continue;
      const angle = angleTo(origin, end);
      angles.push(angle - RAY_OFFSET, angle, angle + RAY_OFFSET);
    }
  }
  const joins = counting ? limitedJoins(blocking.filter((wall) => wall.limited)) : null;
  if (joins) {
    // Where two limited walls begin or cease to run together, a ray to one side counts one hedge
    // and to the other two; where a limited wall crosses another, the two swap their order.
    for (const point of [...limitedCrossings(blocking), ...joins.points]) {
      const angle = angleTo(origin, point);
      angles.push(angle - RAY_OFFSET, angle, angle + RAY_OFFSET);
    }
  }
  angles.sort((a, b) => a - b);
  const spans = angularSpans(origin, blocking);
  const seam = spans.filter((span) => span.wraps);
  const ordered = spans.filter((span) => !span.wraps).sort((a, b) => a.from - b.from);
  let next = 0;
  let active: AngularSpan[] = [];
  const polygon = angles.map((angle) => {
    while (next < ordered.length && ordered[next]!.from <= angle + SPAN_SLACK) active.push(ordered[next++]!);
    active = active.filter((span) => span.to >= angle - SPAN_SLACK);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let reach = radius;
    hits.length = 0;
    const meet = (wall: WallSegment): void => {
      if (joins && wall.limited) {
        const hit = limitedHit(origin, dx, dy, wall);
        if (hit) hits.push(hit);
      } else reach = Math.min(reach, raySegmentIntersect(origin, angle, wall.p1, wall.p2));
    };
    for (const span of active) meet(span.wall);
    for (const span of seam) {
      if (spanCovers(span, angle)) meet(span.wall);
    }
    const second = joins ? secondCrossing(hits, joins) : null;
    let stop: readonly WallSegment[] | null = null;
    if (second !== null && second.t < reach) {
      reach = second.t;
      stop = second.walls;
    }
    if (mask) {
      const first = hits.reduce((nearest, hit) => (hit.t < nearest.t ? hit : nearest), FAR);
      if (first.t >= radius) {
        reach = radius;
        stop = null;
      } else if (first.t > reach) {
        reach = first.t;
        stop = hits.filter((hit) => hit.t === first.t).map((hit) => hit.wall);
      }
    }
    stops.push(stop);
    return { x: origin.x + dx * reach, y: origin.y + dy * reach };
  });
  return { polygon, stops };
}

/** No limited wall on a ray. */
const FAR = { t: Infinity };

/** Even-odd point-in-polygon test. */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
