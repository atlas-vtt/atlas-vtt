import { RANGE_FIELDS, type RangeField } from '../../lighting/lightRanges';
import type { Point } from '../../types/visionTypes';
import type { VisionCone } from '../../vision/visionCone';

/** What can be dragged on the rings of the open light: a range, or the way its beam faces. */
export type RingHandle = RangeField | 'rotation';

/** Screen pixels. */
export const HANDLE_HIT_RADIUS = 11;
/** How far beyond the dim arc the handle that turns a beam sits, so it never meets a range handle. */
export const ROTATION_HANDLE_OFFSET = 22;

export interface RingGeometry {
  center: Point;
  /** World radius of each ring. */
  radius: Record<RangeField, number>;
  /** The beam of a light that shines one way: its rings are arcs. */
  cone?: VisionCone;
  /** The area of a light that glows from one: its rings are its outline grown by each range (`grownOutline`). */
  area?: readonly Point[];
}

/** Where a ring's handle sits when the light shines all around: the bright ring's above the light, the dim ring's below, so they never meet. */
const HANDLE_DIRECTION: Record<RangeField, number> = { bright: -1, dim: 1 };
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

function at(center: Point, angle: number, radius: number): Point {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

/** The world angle a range handle sits at on a beam: the bright ring's on its first edge, the dim ring's on its second. */
function edgeAngle(cone: VisionCone, field: RangeField): number {
  return cone.facing + (HANDLE_DIRECTION[field] * cone.angle) / 2;
}

/**
 * Where an area's ring of `field` is anchored: the area's corner farthest out the way its handle
 * sits (up for the bright ring, down for the dim one). Grown by a range, the area reaches farthest
 * that way right there, so the handle sits on its ring.
 */
function areaAnchor(area: readonly Point[], field: RangeField): Point {
  const way = HANDLE_DIRECTION[field];
  return area.reduce((best, corner) => (corner.y * way > best.y * way ? corner : best));
}

/** The world point of a ring's handle. */
export function ringHandlePoint({ center, radius, cone, area }: RingGeometry, field: RangeField): Point {
  if (cone) return at(center, edgeAngle(cone, field), radius[field]);
  const from = area ? areaAnchor(area, field) : center;
  return { x: from.x, y: from.y + HANDLE_DIRECTION[field] * radius[field] };
}

/**
 * The range a ring's handle dragged to `point` gives, in world pixels: its distance from the light,
 * or, for an area light, how far beyond the area's anchor it lies the way the handle moves.
 */
export function ringRadiusAt({ center, area }: RingGeometry, field: RangeField, point: Point): number {
  if (!area) return Math.hypot(point.x - center.x, point.y - center.y);
  return (point.y - areaAnchor(area, field).y) * HANDLE_DIRECTION[field];
}

/**
 * The world point of the handle that turns a beam, at viewport `zoom`: on the beam's axis, a
 * little beyond its dim arc. None for a light that shines all around or reaches nowhere.
 */
export function rotationHandlePoint({ center, radius, cone }: RingGeometry, zoom: number): Point | null {
  return cone && radius.dim > 0 ? at(center, cone.facing, radius.dim + ROTATION_HANDLE_OFFSET / zoom) : null;
}

/** Every handle the rings show, as world points. A range of nothing has no ring and no handle: it would sit on the marker and take its presses. */
function handles(geometry: RingGeometry, zoom: number): [RingHandle, Point][] {
  const shown: [RingHandle, Point][] = RANGE_FIELDS.filter((field) => geometry.radius[field] > 0).map((field) => [field, ringHandlePoint(geometry, field)]);
  const rotation = rotationHandlePoint(geometry, zoom);
  if (rotation) shown.push(['rotation', rotation]);
  return shown;
}

/** The world points of the handles the rings show: what the light's popover keeps clear of. */
export function ringHandlePoints(geometry: RingGeometry, zoom: number): Point[] {
  return handles(geometry, zoom).map(([, point]) => point);
}

/** The handle at the world `point` at viewport `zoom`; the nearest one where several are in reach. */
export function ringHandleAt(geometry: RingGeometry, point: Point, zoom: number): RingHandle | null {
  let nearest: RingHandle | null = null;
  let best = HANDLE_HIT_RADIUS / zoom;
  for (const [handle, center] of handles(geometry, zoom)) {
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (distance <= best) {
      best = distance;
      nearest = handle;
    }
  }
  return nearest;
}

/** The cursor over a handle: the way a range handle moves, which on a beam is along its edge. */
export function ringHandleCursor({ cone }: RingGeometry, handle: RingHandle): string {
  if (handle === 'rotation') return 'grab';
  if (!cone) return 'ns-resize';
  const eighth = Math.round(edgeAngle(cone, handle) / (Math.PI / 4));
  return RESIZE_CURSORS[((eighth % 4) + 4) % 4]!;
}
