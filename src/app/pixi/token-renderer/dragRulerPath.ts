/**
 * The path of Atlas's token drag ruler: the snapped start, every waypoint, and the cell the
 * token would land in. A waypoint never repeats the last point, and the path is empty while the
 * token has not left its start. Used by `DragRuler`, and part of the shared drawing contract.
 */

import { pathLengthInCells, type GridGeometry } from '../../grid/gridDistance';
import type { Point } from '../../grid/hexGeometry';
import { formatDistance, type DistanceSettings } from '../../grid/measurementFormat';

/** Atlas's key for adding a waypoint while dragging a token. */
export const WAYPOINT_KEY = ' ';

export function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

export class DragRulerPath {
  /** The snapped start followed by every waypoint. */
  private waypoints: Point[] = [];
  private landing: Point | null = null;

  constructor(private readonly snap: (point: Point) => Point) {}

  get active(): boolean {
    return this.waypoints.length > 0;
  }

  begin(origin: Point): void {
    this.waypoints = [this.snap(origin)];
    this.landing = null;
  }

  /** Moves the end to the cell a token at `position` would snap to. */
  update(position: Point): void {
    if (this.active) this.landing = this.snap(position);
  }

  /** Adds a waypoint at the landing cell; false when there is none or it repeats the last point. */
  addWaypoint(): boolean {
    const last = this.waypoints[this.waypoints.length - 1];
    if (!this.landing || (last && samePoint(last, this.landing))) return false;
    this.waypoints.push(this.landing);
    return true;
  }

  /** The start, the waypoints and the landing cell; null until the path leaves its start. */
  points(): Point[] | null {
    const landing = this.landing;
    if (!landing) return null;
    const points = [...this.waypoints, landing];
    return points.every((point) => samePoint(point, landing)) ? null : points;
  }

  end(): void {
    this.waypoints = [];
    this.landing = null;
  }
}

/** The ruler's label: the path's length in the measurement's units or range bands. */
export function dragRulerLabel(grid: GridGeometry, points: readonly Point[], settings: DistanceSettings): string {
  return formatDistance(pathLengthInCells(grid, points, settings.diagonalRule), settings);
}
