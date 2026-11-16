/**
 * Openings and floor the GM draws on a level (Foundry's Define Surface). Without any, a level is
 * floor everywhere: nothing below shows and nothing falls through. An open surface opens it to
 * the levels below; a floor surface closes it again where it lies over an earlier opening. A later
 * surface of a level lies over an earlier one. The one place that reads them.
 */

import type { LevelSurface } from '../types/sceneLevelTypes';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';
import { hasArea } from '../vision/polygonArea';
import { pointInPolygon } from '../vision/visibility';
import { hasLevels, onLevel, type SceneLevels } from './sceneLevels';

/** The corners a surface may have. */
export const MAX_SURFACE_CORNERS = 64;
/** The surfaces a level may have: each is rasterised whenever the stack is built, and a damaged file must not hold thousands. */
export const MAX_LEVEL_SURFACES = 64;

const lists = new WeakMap<object, LevelSurface[]>();
const NONE: LevelSurface[] = [];

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/**
 * A surface as it is read: `id` is its place in the record. Only `open: true` opens: a surface
 * whose `open` is anything else (a hand edit) is floor, which shows nothing below.
 */
function readSurface(id: string, value: unknown): LevelSurface | null {
  if (!isRecord(value)) return null;
  const { polygon, level, name } = value;
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > MAX_SURFACE_CORNERS || !polygon.every(isPoint) || !hasArea(polygon)) return null;
  return {
    id,
    kind: 'level-surface',
    polygon,
    open: value.open === true,
    ...(typeof level === 'string' && { level }),
    ...(typeof name === 'string' && name !== '' && { name }),
  };
}

/**
 * The surfaces of a record in the order they were drawn: the first `MAX_LEVEL_SURFACES` that are
 * areas. Hand it the surfaces of one level (`levelObjects`, `levelObjectsOn`). The record itself
 * stays as the file has it; the same list for the same record.
 */
export function levelSurfaceList(surfaces: Record<string, LevelSurface> | undefined): LevelSurface[] {
  if (!isRecord(surfaces)) return NONE;
  let list = lists.get(surfaces);
  if (!list) {
    list = [];
    for (const [id, value] of Object.entries(surfaces)) {
      const surface = readSurface(id, value);
      if (surface) list.push(surface);
      if (list.length === MAX_LEVEL_SURFACES) break;
    }
    lists.set(surfaces, list);
  }
  return list;
}

/** The surfaces a map file holds, as the store keeps them: the file's record untouched, or none where it holds something else. */
export function levelSurfacesFromFile(value: unknown): Record<string, LevelSurface> | undefined {
  return isRecord(value) ? (value as Record<string, LevelSurface>) : undefined;
}

/** The surfaces of the whole scene's record that lie on level `levelId`, as `levelSurfaceList` reads them. */
export function surfacesOnLevel(surfaces: Record<string, LevelSurface> | undefined, levelId: string, levels: SceneLevels): LevelSurface[] {
  if (!isRecord(surfaces)) return NONE;
  const kept = Object.fromEntries(Object.entries(surfaces).filter(([, value]) => !isRecord(value) || onLevel(value, levelId, levels)));
  return levelSurfaceList(kept);
}

/**
 * Whether a level with `surfaces` (its own, in order) has floor at `point`: the latest surface that
 * holds the point decides; where none does, `art` (whether the level's map holds floor there), else floor.
 */
export function floorAt(surfaces: readonly LevelSurface[], point: Point, art = true): boolean {
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i]!;
    if (pointInPolygon(point, surface.polygon)) return !surface.open;
  }
  return art;
}

/**
 * Whether level `levelId`'s map holds floor at `point` as the view draws it (`artCells`: false where
 * it is transparent or the point lies outside its image), or null where the view does not know,
 * which counts as floor. The store has no map: a view hands this to a drop.
 */
export type ArtFloors = (levelId: string, point: Point) => boolean | null;

/** What a drop reads of a scene to let a token fall. */
export interface SurfacedScene {
  objects: { levelSurfaces?: Record<string, LevelSurface> | undefined };
  levels?: SceneLevels;
}

/**
 * Where a token put down at `point` on level `from` lands: `from` where it has floor there (its
 * surfaces, else its map as `art` says), else the first level below that has, whatever each level
 * shows of the ones below it; null where
 * there is floor on `from`, or none below either (a chasm: the token stays). Null in a scene
 * without levels.
 */
export function floorBelow(scene: SurfacedScene, from: string, point: Point, art?: ArtFloors): string | null {
  const { levels } = scene;
  if (!hasLevels(levels)) return null;
  const at = levels.findIndex((level) => level.id === from);
  const floor = (id: string): boolean => floorAt(surfacesOnLevel(scene.objects.levelSurfaces, id, levels), point, art?.(id, point) ?? true);
  if (at < 0 || floor(from)) return null;
  for (let index = at - 1; index >= 0; index--) {
    const id = levels[index]!.id;
    if (floor(id)) return id;
  }
  return null;
}
