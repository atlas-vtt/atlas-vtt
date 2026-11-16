import type { OnLevels, OnOneLevel, SceneLevel } from '../types/sceneLevelTypes';
import type { ViewState } from '../types/viewState';
import type { MovesWithMap } from '../grid/mapStretchObjects';

/** The levels of a scene, bottom first; a scene without them has one level. */
export type SceneLevels = readonly SceneLevel[] | undefined;

/** What a view's level depends on: the scene's levels and the one the view shows. */
export interface LevelView {
  levels?: SceneLevels;
  /** The level the view shows; unset, or one the scene does not have, is the first. */
  viewedLevel?: string | null | undefined;
}

const knownIds = new WeakMap<readonly SceneLevel[], ReadonlySet<string>>();

/** The ids of `levels`, worked out once per list. */
function idsOf(levels: readonly SceneLevel[]): ReadonlySet<string> {
  let ids = knownIds.get(levels);
  if (!ids) {
    ids = new Set(levels.map((level) => level.id));
    knownIds.set(levels, ids);
  }
  return ids;
}

/** Whether the scene has more than one level: only then does anything stand on one level and not another. */
export function hasLevels(levels: SceneLevels): levels is readonly SceneLevel[] {
  return levels !== undefined && levels.length > 1;
}

/** The first (lowest) level's id; null for a scene without levels. */
export function firstLevelId(levels: SceneLevels): string | null {
  return levels?.[0]?.id ?? null;
}

/** Whether `id` names one of `levels`. */
export function isLevelOf(levels: SceneLevels, id: unknown): id is string {
  return typeof id === 'string' && levels !== undefined && idsOf(levels).has(id);
}

/** The level `id` names, else the first: what an unset or unknown level reads as. */
export function resolveLevel(levels: SceneLevels, id: unknown): string | null {
  return isLevelOf(levels, id) ? id : firstLevelId(levels);
}

/** The level a view shows: its own when the scene has it, else the first; null for a scene without levels. */
export function viewedLevelId(view: LevelView): string | null {
  return resolveLevel(view.levels, view.viewedLevel);
}

/** The level `id` names in `levels`, or null. */
export function levelById(levels: SceneLevels, id: string | null): SceneLevel | null {
  return (id !== null && levels?.find((level) => level.id === id)) || null;
}

/**
 * Whether `object` is on level `levelId`: the one place that decides it, for objects of one
 * level (`level`) and of several (`levels`, or `'all'`). Unset, or naming no level the scene
 * has, is the first level. In a scene without levels everything is on its one level.
 */
export function onLevel(object: OnOneLevel & OnLevels, levelId: string, levels: SceneLevels): boolean {
  if (!hasLevels(levels)) return true;
  const { levels: set, level } = object;
  if (set === 'all') return true;
  if (Array.isArray(set)) {
    const ids = idsOf(levels);
    const known = set.filter((id) => typeof id === 'string' && ids.has(id));
    if (known.length > 0) return known.includes(levelId);
  } else if (isLevelOf(levels, level)) {
    return level === levelId;
  }
  return levelId === firstLevelId(levels);
}

/** The level field of an object of one level placed in `view` now: on the level it shows; nothing in a scene without levels. */
export function placedOnViewedLevel(view: LevelView): OnOneLevel {
  const id = hasLevels(view.levels) ? viewedLevelId(view) : null;
  return id ? { level: id } : {};
}

/** The levels field of a wall, light, zone or sound placed in `view` now: the level it shows; nothing in a scene without levels. */
export function placedOnViewedLevels(view: LevelView): OnLevels {
  const id = hasLevels(view.levels) ? viewedLevelId(view) : null;
  return id ? { levels: [id] } : {};
}

/** The objects of `record` that are not on the level `view` shows: what clearing that level keeps. Nothing in a scene without levels. */
export function elsewhereThanViewedLevel<T extends OnOneLevel & OnLevels>(record: Record<string, T>, view: LevelView): Record<string, T> {
  const id = hasLevels(view.levels) ? viewedLevelId(view) : null;
  if (id === null) return {};
  return Object.fromEntries(Object.entries(record).filter(([, object]) => !onLevel(object, id, view.levels)));
}

/** What tells one level's map from another's in caches keyed by map (`FogCoverageCache`): the map's path, with the level shown where it has several. */
export function levelMapKey(mapPath: string | null, view: LevelView): string | null {
  return mapPath !== null && hasLevels(view.levels) ? `${mapPath}#${viewedLevelId(view) ?? ''}` : mapPath;
}

/** The explored memory of the level a view shows: the first level's is `exploredMask`. */
export function levelExploredMask(state: Pick<ViewState, 'exploredMask' | 'exploredMasks'> & LevelView): string | null {
  return exploredMaskOf(state, viewedLevelId(state));
}

/** The explored memory of level `id` (null: a scene without levels), wherever the view is: the first level's is `exploredMask`. */
export function exploredMaskOf(state: Pick<ViewState, 'exploredMask' | 'exploredMasks'> & LevelView, id: string | null): string | null {
  return id === null || id === firstLevelId(state.levels) ? state.exploredMask : state.exploredMasks?.[id] ?? null;
}

/**
 * Whether `object` is on level `levelId` and on no other: what moves with that level's image when
 * its alignment changes. A wall or light of several levels, or of all, stays with the others.
 */
export function onlyOnLevel(object: OnOneLevel & OnLevels, levelId: string, levels: SceneLevels): boolean {
  if (!onLevel(object, levelId, levels)) return false;
  return !hasLevels(levels) || levels.every((other) => other.id === levelId || !onLevel(object, other.id, levels));
}

/** What moves with level `levelId`'s image: the objects on it and on no other; everything in a scene without levels. */
export function movesWithLevel(state: { levels?: SceneLevels }, levelId: string | null): MovesWithMap | undefined {
  const { levels } = state;
  if (!hasLevels(levels) || levelId === null) return undefined;
  return (object) => onlyOnLevel(object, levelId, levels);
}
