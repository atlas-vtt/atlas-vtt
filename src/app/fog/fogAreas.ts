/**
 * Fog that was revealed from its menu and can be hidden again: a revealing lasso or rectangle
 * operation with a mark (`FogAreaMark`), which holds the outline of the fog it took away. It
 * erases like any other, so whoever ignores the mark replays the plain operation and shows the
 * same fog. Nothing that paints is one: a mark on a painting operation (an earlier build wrote
 * them) is ignored. Everything that reads the mark reads it here.
 */

import type { FogAreaMark, FogLassoFill, FogOperation, FogRectangleFill } from '../types/fogTypes';
import type { Point } from '../types/visionTypes';
import { hasArea } from '../vision/polygonArea';
import { validateFogOperation } from './fogOperationShape';

/** The revealed fog of one level that is remembered; a record that holds more keeps the rest as plain fog taken away. */
export const MAX_FOG_AREAS = 500;

/** A revealing fog operation whose fog can be hidden again. */
export type FogArea = (FogLassoFill | FogRectangleFill) & { area: FogAreaMark; isErasing: true };

type Operations = Readonly<Record<string, FogOperation>>;

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `operation` is revealed fog that is remembered: a lasso or a rectangle that erases and carries the mark. A mark that is no object is none. */
export function isFogArea(operation: FogOperation | undefined): operation is FogArea {
  // A map file is kept as it came: an entry may be anything.
  const entry: unknown = operation;
  if (!isObject(entry) || !('type' in entry) || !('area' in entry) || !('isErasing' in entry)) return false;
  return (entry.type === 'lasso' || entry.type === 'rectangle') && entry.isErasing === true && isObject(entry.area);
}

const lists = new WeakMap<Operations, readonly FogArea[]>();

/**
 * The remembered revealed fog among `fog`, the fog of one level, ordered by id; no more than
 * `MAX_FOG_AREAS`. Its id is its key in the record, which is how the store finds it. The same
 * list while the record is the same.
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

/**
 * `outline` as the corners a lasso operation holds: as they are given, to the last one, so that
 * a body of fog revealed with it, and hidden with it again, is exactly that fog. Null where it
 * encloses nothing or cannot be fog: fewer than three corners, corners on one line, a place that
 * is no number or beyond what fog reaches.
 */
export function lassoOutline(outline: readonly Point[]): Point[] | null {
  if (!outline.every(isPlace)) return null;
  const points = outline.map(({ x, y }) => ({ x, y }));
  if (points.length < 3 || !hasArea(points)) return null;
  try {
    validateFogOperation({ id: '', kind: 'fog', timestamp: 0, isErasing: true, type: 'lasso', points });
    return points;
  } catch {
    return null;
  }
}
