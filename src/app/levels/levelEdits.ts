import type { LevelElevation, SceneLevel } from '../types/sceneLevelTypes';
import type { ViewState } from '../types/viewState';
import { levelsWithBackground } from './levelFile';
import { objectsAfterLevelEdit, type MembershipEdit } from './levelMembershipEdits';
import { firstLevelId } from './sceneLevels';
import type { LevelAlignments } from './levelAlignment';

/** What an edit of the levels reads and writes of a scene. */
export type LevelScene = Pick<ViewState, 'levels' | 'background' | 'objects' | 'exploredMask' | 'exploredMasks' | 'levelAlignments' | 'grid'>;

/** Game units a level spans when nothing says otherwise: Foundry's and the importers' default storey. */
export const LEVEL_HEIGHT = 10;

/** A new level's id. */
export function newLevelId(): string {
  return `level_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The map image of level `id`: the first level's is the scene's `background`. */
export function levelBackground(scene: Pick<ViewState, 'levels' | 'background'>, id: string | null): string | null {
  const { levels } = scene;
  if (!levels || id === null || id === firstLevelId(levels)) return scene.background;
  return levels.find((level) => level.id === id)?.background ?? null;
}

/** The roof image of level `id` (its `foreground`), drawn above its tokens; null without one. */
export function levelForeground(scene: { levels?: readonly SceneLevel[] | undefined }, id: string | null): string | null {
  const foreground = id === null ? null : scene.levels?.find((level) => level.id === id)?.foreground;
  return typeof foreground === 'string' && foreground !== '' ? foreground : null;
}

/** The explored memory of every level, by id; the first level's is `exploredMask`. */
function masksByLevel(scene: LevelScene): Record<string, string | null> {
  const first = firstLevelId(scene.levels);
  return { ...scene.exploredMasks, ...(first && { [first]: scene.exploredMask }) };
}

/** The alignments of the levels that remain; a level's look does not depend on its place in the order (`levelImagePlacement`). */
function keptAlignments(scene: LevelScene, levels: readonly SceneLevel[]): LevelAlignments | undefined {
  const kept: LevelAlignments = {};
  for (const level of levels) {
    const own = scene.levelAlignments?.[level.id];
    if (own) kept[level.id] = own;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** A scene's levels in a new order or without one: the first level's background and memory move to the scene's own fields. */
function withLevels(scene: LevelScene, levels: SceneLevel[], objects: ViewState['objects']): LevelScene {
  const masks = masksByLevel(scene);
  const [first, ...rest] = levels;
  const background = first ? levelBackground(scene, first.id) : scene.background;
  const exploredMasks = Object.fromEntries(rest.flatMap((level) => (masks[level.id] ? [[level.id, masks[level.id]!]] : [])));
  return {
    levels: levelsWithBackground(levels, background),
    background,
    objects,
    exploredMask: first ? masks[first.id] ?? null : scene.exploredMask,
    ...(Object.keys(exploredMasks).length > 0 ? { exploredMasks } : { exploredMasks: undefined }),
    levelAlignments: keptAlignments(scene, levels),
    grid: scene.grid,
  };
}

/**
 * The scene's levels with `level` added on top. A scene without levels gets its first level too,
 * named `firstName`, which holds everything the scene had.
 */
export function withLevelAdded(scene: Pick<ViewState, 'levels' | 'background'>, added: { name: string; background: string | null }, firstName: string): SceneLevel[] {
  const levels = scene.levels?.length ? scene.levels : [{ id: newLevelId(), name: firstName, elevation: { bottom: 0, top: LEVEL_HEIGHT }, background: scene.background }];
  const bottom = Math.max(...levels.map((level) => level.elevation.top));
  return [...levels, { id: newLevelId(), name: added.name, elevation: { bottom, top: bottom + LEVEL_HEIGHT }, background: added.background }];
}

/** The scene's levels with level `id` changed by `changes`. */
export function withLevelChanged(levels: readonly SceneLevel[], id: string, changes: Partial<Pick<SceneLevel, 'name' | 'background'>> & { elevation?: LevelElevation }): SceneLevel[] {
  return levels.map((level) => {
    if (level.id !== id) return level;
    const changed = { ...level, ...changes };
    // A blank name is none: the level is named by its place (`levelLabel`)
    if (changed.name?.trim() !== '') return changed;
    const { name: _blank, ...unnamed } = changed;
    return unnamed;
  });
}

/**
 * The scene's levels with the roof of level `id` (null: a scene without levels, whose one level is
 * made, named `firstName`, to carry it) set to `foreground`; null removes it, written as no field.
 * Null where nothing changes (no roof removed from a scene without levels).
 */
export function withLevelRoof(scene: Pick<ViewState, 'levels' | 'background'>, id: string | null, foreground: string | null, firstName: string): SceneLevel[] | null {
  const levels = scene.levels?.length ? scene.levels : foreground ? [{ id: newLevelId(), name: firstName, elevation: { bottom: 0, top: LEVEL_HEIGHT }, background: scene.background }] : null;
  if (!levels) return null;
  const target = id ?? levels[0]!.id;
  return levels.map((level) => {
    if (level.id !== target) return level;
    const next: SceneLevel = { ...level, foreground };
    if (!foreground) delete next.foreground;
    return next;
  });
}

/**
 * The scene's levels with what level `id` shows below it changed: `sees` (undefined: every level
 * below, as when unset) and `openArt` (true: its transparent parts are openings, as when unset).
 * Unset is written as no field at all, so a level left as it was is the level as it came.
 */
export function withLevelSight(levels: readonly SceneLevel[], id: string, changes: { sees?: string[] | undefined; openArt?: boolean }): SceneLevel[] {
  return levels.map((level) => {
    if (level.id !== id) return level;
    const { sees, openArt, ...rest } = level;
    const nextSees = 'sees' in changes ? changes.sees : sees;
    const nextOpen = changes.openArt ?? openArt !== false;
    return { ...rest, ...(nextSees && { sees: nextSees }), ...(!nextOpen && { openArt: false as const }) };
  });
}

/**
 * The scene with its levels in the order of `ids` (bottom first). Where another level becomes the
 * first, everything that stood on the first by being unset names it from now on, so it stays there.
 */
export function withLevelsReordered(scene: LevelScene, ids: readonly string[]): LevelScene {
  const levels = scene.levels ?? [];
  const reordered = ids.map((id) => levels.find((level) => level.id === id)).filter((level): level is SceneLevel => !!level);
  if (reordered.length !== levels.length) return scene;
  const firstChanges = reordered[0]?.id !== firstLevelId(levels);
  const objects = firstChanges ? objectsAfterLevelEdit(scene.objects, levels, { rewrite: (id) => id, explicit: true }) : scene.objects;
  return withLevels(scene, reordered, objects);
}

/**
 * The scene without level `id`. Its objects move to level `moveTo`, or go with it (null). A wall
 * or light that belongs to other levels too stays on those.
 */
export function withLevelDeleted(scene: LevelScene, id: string, moveTo: string | null): LevelScene {
  const levels = scene.levels ?? [];
  const remaining = levels.filter((level) => level.id !== id);
  if (remaining.length === levels.length || remaining.length === 0) return scene;
  const edit: MembershipEdit = { rewrite: (level) => (level === id ? moveTo : level), explicit: firstLevelId(levels) === id };
  return withLevels(scene, remaining, objectsAfterLevelEdit(scene.objects, levels, edit));
}
