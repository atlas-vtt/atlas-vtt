/**
 * A scene's levels in the view store: which one the view shows, the levels themselves and moving
 * tokens between them. Objects stay in the flat `objects`; what a view shows of them is `levelObjects`.
 */

import type { LevelScene } from '../levels/levelEdits';
import { firstLevelId, isLevelOf, movesWithLevel, viewedLevelId } from '../levels/sceneLevels';
import type { LevelAlignment, LevelLinkChanges, LevelLinkInput, SceneLevel } from '../types/sceneLevelTypes';
import { isRecord } from '../utils/guards';
import type { MapMove } from '../grid/mapStretch';
import { objectsMovedWithMap } from '../grid/mapStretchObjects';
import type { ViewState } from '../types/viewState';

export interface SceneLevelsSlice {
  /** Shows level `id` (null: the first). Never an undo step: the selection and open popovers belong to the level left. */
  setViewedLevel: (id: string | null) => void;
  /** Replaces the scene's levels: names, elevations and the backgrounds of levels above the first. */
  setLevels: (levels: SceneLevel[] | undefined) => void;
  /** Writes an edit of the levels that also moves objects or the first level (`withLevelsReordered`, `withLevelDeleted`). */
  applyLevelScene: (scene: LevelScene) => void;
  /** Puts tokens on level `levelId` where they stand, in one write (one undo step); the moved ones leave the selection. */
  moveTokensToLevel: (ids: readonly string[], levelId: string) => void;
  /**
   * Fits level `levelId`'s image to the scene's grid with `alignment`, and `move` takes what stands
   * on that level alone along (`objectsMovedWithMap`): one write, one undo step.
   */
  alignLevel: (levelId: string, alignment: LevelAlignment, move?: MapMove) => void;
  /** Adds stairs (a level link) in one undo step and returns its id. */
  addLevelLink: (data: LevelLinkInput) => string;
  /** Changes stairs; a field given as undefined is removed. */
  updateLevelLink: (id: string, changes: LevelLinkChanges) => void;
  deleteLevelLink: (id: string) => void;
}

type LevelsDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects' | 'background' | 'exploredMask' | 'exploredMasks' | 'levelAlignments' | 'selectedIds' | 'lightPopover' | 'lightZonePopover' | 'levelLinkPopover'>;

type ImmerSet = (fn: (draft: LevelsDraft) => void) => void;


/** Where a level's explored memory is kept: the first level's in `exploredMask`. A level the scene no longer has keeps none. */
export function writeExploredMask(draft: Pick<ViewState, 'levels' | 'viewedLevel' | 'exploredMask' | 'exploredMasks'>, dataUrl: string | null, level: string | null | undefined): void {
  const target = level === undefined ? viewedLevelId(draft) : level;
  if (target === null || target === firstLevelId(draft.levels)) {
    draft.exploredMask = dataUrl;
    return;
  }
  if (!isLevelOf(draft.levels, target)) return;
  const masks = { ...draft.exploredMasks };
  if (dataUrl) masks[target] = dataUrl;
  else delete masks[target];
  draft.exploredMasks = Object.keys(masks).length > 0 ? masks : undefined;
}

export function createSceneLevelsActions(set: ImmerSet, get: () => LevelsDraft): SceneLevelsSlice {
  return {
    setViewedLevel: (id) => set((draft) => {
      if ((draft.viewedLevel ?? null) === id) return;
      draft.viewedLevel = id;
      draft.selectedIds = [];
      draft.lightPopover = null;
      draft.lightZonePopover = null;
      draft.levelLinkPopover = null;
    }),

    setLevels: (levels) => set((draft) => {
      draft.levels = levels;
    }),

    applyLevelScene: (scene) => set((draft) => {
      draft.levels = scene.levels;
      draft.background = scene.background;
      draft.objects = scene.objects;
      draft.exploredMask = scene.exploredMask;
      draft.exploredMasks = scene.exploredMasks;
      draft.levelAlignments = scene.levelAlignments;
      draft.selectedIds = [];
    }),

    alignLevel: (levelId, alignment, move) => {
      const state = get();
      if (!isLevelOf(state.levels, levelId)) return;
      const objects = move ? objectsMovedWithMap(state.objects, move, movesWithLevel(state, levelId)) : null;
      set((draft) => {
        draft.levelAlignments = { ...draft.levelAlignments, [levelId]: alignment };
        if (objects) draft.objects = objects;
      });
    },

    addLevelLink: (data) => {
      const id = `levellink_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      set((draft) => {
        // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
        if (!isRecord(draft.objects.levelLinks)) draft.objects.levelLinks = {};
        draft.objects.levelLinks[id] = { id, kind: 'level-link', ...data };
      });
      return id;
    },

    updateLevelLink: (id, changes) => set((draft) => {
      const link = draft.objects.levelLinks?.[id];
      if (!link) return;
      Object.assign(link, changes);
      for (const field of Object.keys(changes) as (keyof LevelLinkChanges)[]) {
        if (changes[field] === undefined) delete link[field];
      }
    }),

    deleteLevelLink: (id) => set((draft) => {
      delete draft.objects.levelLinks?.[id];
      if (draft.levelLinkPopover === id) draft.levelLinkPopover = null;
    }),

    moveTokensToLevel: (ids, levelId) => set((draft) => {
      if (!isLevelOf(draft.levels, levelId)) return;
      const moved = new Set<string>();
      for (const id of ids) {
        const token = draft.objects.tokens[id];
        if (!token || token.level === levelId) continue;
        token.level = levelId;
        moved.add(id);
      }
      if (moved.size > 0 && levelId !== viewedLevelId(draft)) draft.selectedIds = draft.selectedIds.filter((id) => !moved.has(id));
    }),
  };
}
