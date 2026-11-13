/**
 * Fog areas: the lasso and rectangle operations the GM keeps as objects (`FogAreaMark`), drawn
 * once in prep and flipped between hidden and revealed at the table. An area is hidden while its
 * operation paints and revealed while it erases, so whoever ignores the mark replays the plain
 * operation and shows the same fog. Everything that reads areas reads them here.
 */

import type { FogAreaMark, FogLassoFill, FogOperation, FogRectangleFill } from '../types/fogTypes';
import type { Point } from '../types/visionTypes';
import { hasArea } from '../vision/polygonArea';
import { areaBadgePoint } from './fogAreaBadge';
import { simplifiedOutline } from './fogAreaShapes';
import { validateFogOperation } from './fogOperationShape';

export { areaBadgePoint };
export { fittedArea, joinedArea, simplifiedOutline, trimmedArea } from './fogAreaShapes';

/** The areas of one level that are read; a record that holds more keeps them as plain fog. */
export const MAX_FOG_AREAS = 500;
/** The corners an area's outline keeps. */
export const MAX_AREA_CORNERS = 200;
/** The characters of a name that are read. */
export const MAX_AREA_NAME = 60;

/** A fog operation that is an area. */
export type FogArea = (FogLassoFill | FogRectangleFill) & { area: FogAreaMark };

/** The outline an area is given: corners in world pixels, or a rectangle along the axes. */
export type FogAreaShape =
  | { readonly type: 'lasso'; readonly points: readonly Point[] }
  | { readonly type: 'rectangle'; readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** The fields of an operation that say where it lies. */
export type FogAreaGeometry =
  | { type: 'lasso'; points: Point[] }
  | { type: 'rectangle'; x: number; y: number; width: number; height: number };

type Operations = Readonly<Record<string, FogOperation>>;

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `operation` is an area: a lasso or a rectangle that carries the mark. A mark that is no object is none. */
export function isFogArea(operation: FogOperation | undefined): operation is FogArea {
  // A map file is kept as it came: an entry may be anything.
  const entry: unknown = operation;
  if (!isObject(entry) || !('type' in entry) || !('area' in entry)) return false;
  return (entry.type === 'lasso' || entry.type === 'rectangle') && isObject(entry.area);
}

const lists = new WeakMap<Operations, readonly FogArea[]>();

/**
 * The areas among `fog`, the fog of one level, ordered by id so that they keep their order
 * whatever was flipped last; no more than `MAX_FOG_AREAS`. An area's id is its key in the
 * record, which is how the store finds it. The same list while the record is the same.
 */
export function fogAreaList(fog: Operations): readonly FogArea[] {
  const known = lists.get(fog);
  if (known) return known;
  const areas: FogArea[] = [];
  for (const id of Object.keys(fog).sort()) {
    const operation = fog[id];
    if (!isFogArea(operation)) continue;
    areas.push(operation.id === id ? operation : { ...operation, id });
    if (areas.length === MAX_FOG_AREAS) break;
  }
  lists.set(fog, areas);
  return areas;
}

/** The name the GM gave the area; a name that is no text, or blank, is none. */
export function areaName(area: FogArea): string | undefined {
  const name: unknown = area.area.name;
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim().slice(0, MAX_AREA_NAME);
  return trimmed === '' ? undefined : trimmed;
}

/** Whether the area hides what it covers: it does while its operation paints. */
export function areaIsHidden(area: Pick<FogOperation, 'isErasing'>): boolean {
  return !area.isErasing;
}

const isPlace = (point: unknown): point is Point =>
  isObject(point) && 'x' in point && 'y' in point && Number.isFinite(point.x) && Number.isFinite(point.y);

function readOutline(operation: FogLassoFill | FogRectangleFill): Point[] {
  const ox = operation.offsetX ?? 0;
  const oy = operation.offsetY ?? 0;
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) return [];
  if (operation.type === 'rectangle') {
    const { x, y, width, height } = operation;
    if (![x, y, width, height].every(Number.isFinite)) return [];
    const left = x + ox;
    const top = y + oy;
    return [{ x: left, y: top }, { x: left + width, y: top }, { x: left + width, y: top + height }, { x: left, y: top + height }];
  }
  const points: unknown = operation.points;
  if (!Array.isArray(points) || !points.every(isPlace)) return [];
  return points.map((point) => ({ x: point.x + ox, y: point.y + oy }));
}

const outlines = new WeakMap<object, readonly Point[]>();

/**
 * The corners of a lasso or rectangle operation in world pixels, where it lies on the map (its
 * offset applied). None where its geometry cannot be read. The same corners while the operation
 * is the same.
 */
export function areaOutline(operation: FogLassoFill | FogRectangleFill): readonly Point[] {
  let outline = outlines.get(operation);
  if (!outline) {
    outline = readOutline(operation);
    outlines.set(operation, outline);
  }
  return outline;
}

const outlineLists = new WeakMap<Operations, ReadonlyArray<readonly Point[]>>();

/** The outlines of the areas among `fog`, for whoever snaps to their corners and edges. The same list while the record is the same. */
export function fogAreaOutlines(fog: Operations): ReadonlyArray<readonly Point[]> {
  let list = outlineLists.get(fog);
  if (!list) {
    list = fogAreaList(fog).map(areaOutline).filter((outline) => outline.length >= 3);
    outlineLists.set(fog, list);
  }
  return list;
}

const spots = new WeakMap<object, Point | null>();

/**
 * Where the badge of a lasso or rectangle operation sits: the place inside its outline farthest
 * from its edges (`areaBadgePoint`), or null where it encloses nothing. Worked out once per operation.
 */
export function areaBadgeSpot(operation: FogLassoFill | FogRectangleFill): Point | null {
  let spot = spots.get(operation);
  if (spot === undefined) {
    spot = areaBadgePoint(areaOutline(operation));
    spots.set(operation, spot);
  }
  return spot;
}

/**
 * The area switched between hidden and revealed. `now` is the time it acts at, which the caller
 * sets after every operation of the scene: a revealed area clears what was hidden before the
 * flip, a hidden one covers what was revealed before it.
 */
export function flippedArea<Area extends FogArea>(area: Area, now: number): Area {
  return { ...area, isErasing: areaIsHidden(area), timestamp: now };
}

function readable(geometry: FogAreaGeometry): boolean {
  try {
    validateFogOperation({ id: '', kind: 'fog', timestamp: 0, isErasing: false, ...geometry });
    return true;
  } catch {
    return false;
  }
}

/**
 * What an operation holds for an area of `shape`: a rectangle with its corner and size, a lasso
 * with at most `MAX_AREA_CORNERS` corners. Null where the shape encloses nothing or cannot be
 * fog: fewer than three corners, corners on one line, a place that is no number or beyond what
 * fog reaches.
 */
export function areaGeometry(shape: FogAreaShape): FogAreaGeometry | null {
  let geometry: FogAreaGeometry;
  if (shape.type === 'rectangle') {
    const { x, y, width, height } = shape;
    if (![x, y, width, height].every(Number.isFinite) || width === 0 || height === 0) return null;
    geometry = { type: 'rectangle', x: Math.min(x, x + width), y: Math.min(y, y + height), width: Math.abs(width), height: Math.abs(height) };
  } else {
    if (!shape.points.every(isPlace)) return null;
    const points = simplifiedOutline(shape.points, MAX_AREA_CORNERS);
    if (points.length < 3 || !hasArea(points)) return null;
    geometry = { type: 'lasso', points };
  }
  return readable(geometry) ? geometry : null;
}
