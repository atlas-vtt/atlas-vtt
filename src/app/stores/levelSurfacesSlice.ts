/** Openings and floor the GM draws on a level (`LevelSurface`), in the view store: map geometry, each change one undo step. */

import { placedOnViewedLevel } from '../levels/sceneLevels';
import type { LevelSurfaceChanges, LevelSurfaceInput } from '../types/sceneLevelTypes';
import type { ViewState } from '../types/viewState';
import { isRecord } from '../utils/guards';

export interface LevelSurfacesSlice {
  /** Adds a surface on the level shown, in one undo step, and returns its id. */
  addLevelSurface: (data: LevelSurfaceInput) => string;
  /** Changes a surface; a field given as undefined is removed. */
  updateLevelSurface: (id: string, changes: LevelSurfaceChanges) => void;
  deleteLevelSurface: (id: string) => void;
}

type SurfacesDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects' | 'levelSurfacePopover'>;

type ImmerSet = (fn: (draft: SurfacesDraft) => void) => void;

export function createLevelSurfacesActions(set: ImmerSet): LevelSurfacesSlice {
  return {
    addLevelSurface: (data) => {
      const id = `surface_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      set((draft) => {
        // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
        if (!isRecord(draft.objects.levelSurfaces)) draft.objects.levelSurfaces = {};
        draft.objects.levelSurfaces[id] = { id, kind: 'level-surface', ...placedOnViewedLevel(draft), ...data };
      });
      return id;
    },

    updateLevelSurface: (id, changes) => set((draft) => {
      const surface = draft.objects.levelSurfaces?.[id];
      if (!surface) return;
      Object.assign(surface, changes);
      for (const field of Object.keys(changes) as (keyof LevelSurfaceChanges)[]) {
        if (changes[field] === undefined) delete surface[field];
      }
    }),

    deleteLevelSurface: (id) => set((draft) => {
      delete draft.objects.levelSurfaces?.[id];
      if (draft.levelSurfacePopover === id) draft.levelSurfacePopover = null;
    }),
  };
}
