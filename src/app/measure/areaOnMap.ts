/**
 * A measured area as it lies on a map: its shape, what the map's walls leave of it, and the cells it
 * covers by the map's rule. One place works it out for whatever draws the area, counts the tokens
 * in it or selects them, so they agree.
 */

import type { GridGeometry } from '../grid/gridDistance';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import type { AreaCellRule, ConeEnd } from './areaRules';
import { cellsInArea, type AreaCell } from './measureCells';
import { EDGE_TOLERANCE, shapedArea, type MeasureArea, type ShapedArea } from './measureGeometry';
import type { Measurement } from './measureTypes';
import { areaWithinWalls, wallSweepPoint } from './measureWalls';

/** What of a map shapes the areas measured on it. */
export interface AreaMap {
  /** The grid areas are measured on: a line that names no width is one of its cells wide. */
  readonly grid: GridGeometry;
  /** Whether the grid's cells are counted: its Snap is on. */
  readonly cells: boolean;
  /** The full opening of a cone, degrees. */
  readonly coneAngle: number;
  readonly coneEnd: ConeEnd;
  readonly cellRule: AreaCellRule;
  /** The walls areas stop at, as light is traced through them (`sealedWalls`); none on a map without walls. */
  readonly walls: readonly WallSegment[];
}

export interface AreaOnMap {
  /** The area as its measurement shapes it. */
  readonly shaped: ShapedArea;
  /** What the walls leave of it: `shaped` itself where none stops it. */
  readonly area: MeasureArea;
  /** The cells it covers; null where cells are not counted. */
  readonly cells: readonly AreaCell[] | null;
}

/**
 * The area of `measurement` on `map`: cut by the map's walls unless it does not stop at them
 * (`stopsAtWalls`). Null for a ruler and for an area without a size. A map without walls costs no
 * sweep and no cut.
 */
export function areaOnMap(measurement: Measurement, map: AreaMap, stopsAtWalls = true): AreaOnMap | null {
  const shaped = shapedArea(measurement, { coneAngle: map.coneAngle, coneEnd: map.coneEnd, lineWidth: map.grid.size });
  if (!shaped) return null;
  const area = stopsAtWalls && map.walls.length > 0 ? areaWithinWalls(shaped, map.walls) : shaped;
  return { shaped, area, cells: map.cells ? cellsInArea(map.grid, area, map.cellRule) : null };
}

function sameMap(a: AreaMap, b: AreaMap): boolean {
  return a.walls === b.walls && a.cells === b.cells && a.coneAngle === b.coneAngle && a.coneEnd === b.coneEnd && a.cellRule === b.cellRule
    && a.grid.type === b.grid.type && a.grid.size === b.grid.size && (a.grid.offsetX ?? 0) === (b.grid.offsetX ?? 0) && (a.grid.offsetY ?? 0) === (b.grid.offsetY ?? 0);
}

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** What was asked for last, and what came of it. */
interface Asked {
  readonly measurement: Measurement;
  readonly map: AreaMap;
  readonly stops: boolean;
  /** Where a circle's walls are swept from; null where walls do not cut it. */
  readonly sweptFrom: Point | null;
  readonly value: AreaOnMap | null;
}

/**
 * The area of one measurement, worked out again only when it is another area. A circle is the same
 * whichever way its end lies from its centre, so one dragged around at one size (a snapped size
 * changes only every cell) is worked out once: unless its centre lies on a wall, where the side it
 * is dragged to decides (`wallSweepPoint`).
 */
export class AreaOnMapMemo {
  private last: Asked | null = null;

  get(measurement: Measurement, map: AreaMap, stopsAtWalls = true): AreaOnMap | null {
    const cut = stopsAtWalls && map.walls.length > 0;
    const sweptFrom = cut ? circleSweptFrom(measurement, map.walls) : null;
    const last = this.last;
    if (last && last.stops === stopsAtWalls && sameMap(last.map, map) && sameArea(last, measurement, sweptFrom)) return last.value;
    const value = areaOnMap(measurement, map, stopsAtWalls);
    this.last = { measurement, map, stops: stopsAtWalls, sweptFrom, value };
    return value;
  }

  forget(): void {
    this.last = null;
  }
}

/** Where the walls of a circle are swept from; null for any other shape, and for a circle without a size. */
function circleSweptFrom({ shape, points }: Measurement, walls: readonly WallSegment[]): Point | null {
  const [origin, end] = points;
  if (shape !== 'circle' || !origin || !end) return null;
  const x = end.x - origin.x;
  const y = end.y - origin.y;
  const length = Math.hypot(x, y);
  return length > 0 ? wallSweepPoint({ origin, towards: { x: x / length, y: y / length } }, walls) : null;
}

function sameArea(last: Asked, measurement: Measurement, sweptFrom: Point | null): boolean {
  const before = last.measurement;
  if (before === measurement) return true;
  const [origin, end] = measurement.points;
  const [originBefore, endBefore] = before.points;
  if (before.shape !== measurement.shape || before.width !== measurement.width || !origin || !end || !originBefore || !endBefore || !samePoint(origin, originBefore)) return false;
  if (samePoint(end, endBefore)) return true;
  if (measurement.shape !== 'circle') return false;
  const radius = Math.hypot(end.x - origin.x, end.y - origin.y);
  const radiusBefore = Math.hypot(endBefore.x - origin.x, endBefore.y - origin.y);
  if (Math.abs(radius - radiusBefore) > EDGE_TOLERANCE) return false;
  return sweptFrom === null || last.sweptFrom === null ? sweptFrom === last.sweptFrom : samePoint(sweptFrom, last.sweptFrom);
}
