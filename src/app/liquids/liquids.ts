/**
 * Liquid surfaces (`LiquidSurface`): water, lava and acid a map shows moving while maps are
 * animated. The one place that reads them: a map file is kept as it came, and what cannot be read
 * here is passed over and saved back.
 */

import type { Point } from '../types/visionTypes';
import type { LiquidColors, LiquidKind, LiquidSurface } from '../types/liquidTypes';
import { isRecord } from '../utils/guards';
import { hasArea } from '../vision/polygonArea';

/**
 * The corners a surface may have, its holes' included: a generated shoreline is resampled and
 * smoothed, a few hundred corners around a lake; a damaged file must not hand the triangulation
 * and the distance field more.
 */
export const MAX_LIQUID_CORNERS = 2048;
/** The points a surface's course may have: a river's middle at a few points a cell, across a large map. */
export const MAX_COURSE_POINTS = 2048;
/** The surfaces one level may have: a flooded dungeon holds a few dozen pools and channels. */
export const MAX_LIQUIDS = 256;

export const LIQUID_KINDS: readonly LiquidKind[] = ['water', 'lava', 'acid'];

/** The colours a surface moves in where its data names none that can be read. */
export const DEFAULT_LIQUID_COLORS: Readonly<Record<LiquidKind, LiquidColors>> = {
  water: { surface: '#4f86a8', deep: '#1d3f5c', glint: '#e8f7ff' },
  lava: { surface: '#e0531b', deep: '#2a1612', glint: '#ffd27a' },
  acid: { surface: '#86c23c', deep: '#2f5a12', glint: '#eaffb4' },
};

const lists = new WeakMap<object, LiquidSurface[]>();
const NONE: LiquidSurface[] = [];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/** A direction of unit length, or none for one that is no direction (no finite numbers, no length). */
export function readFlow(value: unknown): Point | undefined {
  if (!isPoint(value)) return undefined;
  const length = Math.hypot(value.x, value.y);
  return length > 1e-6 && Number.isFinite(length) ? { x: value.x / length, y: value.y / length } : undefined;
}

/** Each colour as `#rrggbb`, else the kind's own. */
function readColors(value: unknown, liquid: LiquidKind): LiquidColors {
  const fallback = DEFAULT_LIQUID_COLORS[liquid];
  const pick = (key: keyof LiquidColors): string => {
    const color = isRecord(value) ? value[key] : undefined;
    return typeof color === 'string' && HEX_COLOR.test(color) ? color.toLowerCase() : fallback[key];
  };
  return { surface: pick('surface'), deep: pick('deep'), glint: pick('glint') };
}

function isArea(polygon: unknown): polygon is Point[] {
  return Array.isArray(polygon) && polygon.length >= 3 && polygon.length <= MAX_LIQUID_CORNERS && polygon.every(isPoint) && hasArea(polygon);
}

const copy = (polygon: readonly Point[]): Point[] => polygon.map(({ x, y }) => ({ x, y }));

/** The holes that are areas, as long as all corners together stay within the limit. */
function readHoles(value: unknown, corners: number): Point[][] {
  if (!Array.isArray(value)) return [];
  const holes: Point[][] = [];
  let total = corners;
  for (const hole of value) {
    if (!isArea(hole)) continue;
    total += hole.length;
    if (total > MAX_LIQUID_CORNERS) break;
    holes.push(copy(hole));
  }
  return holes;
}

/** A course of at least two points that are not all one, else none. */
function readCourse(value: unknown): Point[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_COURSE_POINTS || !value.every(isPoint)) return undefined;
  const [first] = value;
  return first && value.some((p) => p.x !== first.x || p.y !== first.y) ? copy(value) : undefined;
}

/** The edges of an outline of `corners` corners that are open, each once, in order. */
function readOpenEdges(value: unknown, corners: number): number[] {
  if (!Array.isArray(value)) return [];
  const edges = new Set<number>();
  for (const edge of value) if (Number.isInteger(edge) && edge >= 0 && edge < corners) edges.add(edge as number);
  return [...edges].sort((a, b) => a - b);
}

/** A surface as it is read: `id` is its place in the record; one that is no area, or of no kind Atlas knows, is none. */
function readLiquid(id: string, value: unknown): LiquidSurface | null {
  if (!isRecord(value)) return null;
  const { polygon, level } = value;
  const liquid = LIQUID_KINDS.find((kind) => kind === value.liquid);
  if (!liquid || !isArea(polygon)) return null;
  const flow = readFlow(value.flow);
  const holes = readHoles(value.holes, polygon.length);
  const course = flow ? readCourse(value.course) : undefined;
  const openEdges = readOpenEdges(value.openEdges, polygon.length);
  return {
    id,
    kind: 'liquid',
    liquid,
    polygon: copy(polygon),
    colors: readColors(value.colors, liquid),
    ...((value.art === 'engraved' || value.art === 'crayon') && { art: value.art }),
    ...(liquid === 'lava' && typeof value.lavaLight === 'string' && value.lavaLight.length <= 256 && { lavaLight: value.lavaLight }),
    ...(holes.length > 0 && { holes }),
    ...(flow && { flow }),
    ...(course && { course }),
    ...(openEdges.length > 0 && { openEdges }),
    ...(typeof level === 'string' && { level }),
  };
}

/**
 * The surfaces of a record in the order they were added, a later one lying over an earlier one:
 * the first `MAX_LIQUIDS` that can be read. Hand it the surfaces of one level (`levelObjects`).
 * The record itself stays as the file has it; the same list for the same record.
 */
export function liquidList(liquids: Record<string, LiquidSurface> | undefined): LiquidSurface[] {
  if (!isRecord(liquids)) return NONE;
  let list = lists.get(liquids);
  if (!list) {
    list = [];
    for (const [id, value] of Object.entries(liquids)) {
      const surface = readLiquid(id, value);
      if (surface) list.push(surface);
      if (list.length === MAX_LIQUIDS) break;
    }
    lists.set(liquids, list);
  }
  return list;
}

/** The surfaces a map file holds, as the store keeps them: the file's record untouched, or none where it holds something else. */
export function liquidsFromFile(value: unknown): Record<string, LiquidSurface> | undefined {
  return isRecord(value) ? (value as Record<string, LiquidSurface>) : undefined;
}

/**
 * A surface as it lies once the map under it is drawn another way (`objectsMovedWithMap`): its
 * corners and its course follow the map, and so does the way it flows, which a turned or stretched map turns.
 * An entry that cannot be read keeps everything but corners it can move.
 */
export function liquidMovedWithMap<T extends Partial<LiquidSurface>>(surface: T, move: (point: Point) => Point): T {
  if (!Array.isArray(surface.polygon)) return surface;
  const polygon = surface.polygon.map(move);
  const holes = Array.isArray(surface.holes) ? { holes: surface.holes.map((hole) => (Array.isArray(hole) ? hole.map(move) : hole)) } : {};
  const course = Array.isArray(surface.course) ? { course: surface.course.map((p) => (isPoint(p) ? move(p) : p)) } : {};
  const flow = readFlow(surface.flow);
  const start = surface.polygon.find(isPoint);
  if (!flow || !start) return { ...surface, polygon, ...holes, ...course };
  // The map's moves are affine, so one step along the flow anywhere gives its direction everywhere.
  const step = 100;
  const from = move(start);
  const to = move({ x: start.x + flow.x * step, y: start.y + flow.y * step });
  const moved = readFlow({ x: to.x - from.x, y: to.y - from.y });
  return { ...surface, polygon, ...holes, ...course, flow: moved ?? flow };
}
