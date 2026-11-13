/** Fog operations (`FogOperation`) in the view store: scene objects of one level each, every change one undo step. */

import type { MapRect } from '../grid/cellNumbering';
import { elsewhereThanViewedLevel, placedOnViewedLevel } from '../levels/sceneLevels';
import type { FogOperation, FogOperationInput } from '../types/fogTypes';
import type { ViewState } from '../types/viewState';

export interface FogSlice {
  /** Adds an operation on the level shown and returns its id. */
  addFogOperation: (data: FogOperationInput) => string;
  /**
   * Adds operations on the level shown in one undo step and returns their ids: they act in the
   * order given, after all the fog there is.
   */
  addFogOperations: (data: readonly FogOperationInput[]) => string[];
  deleteFogOperation: (id: string) => void;
  deleteFogOperations: (ids: string[]) => void;
  duplicateFogOperations: (ids: string[]) => void;
  setFogOperations: (fog: Record<string, FogOperation>) => void;
  /** Removes the fog of the level the view shows; other floors keep theirs. */
  clearFog: () => void;
  /**
   * Hides the whole map of the level shown, in one undo step. `mapRect` is the map as the view
   * draws it; false, and nothing hidden, where there is none.
   */
  coverAllFog: (mapRect: MapRect | null) => boolean;
}

type FogDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects' | 'selectedIds'>;

type ImmerSet = (fn: (draft: FogDraft) => void) => void;

function newFogId(): string {
  return `fog_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** A time after every operation's, so what is written now acts last whatever the clock says. */
function timeAfterAll(fog: Readonly<Record<string, FogOperation>>): number {
  let newest = -Infinity;
  for (const operation of Object.values(fog)) {
    if (Number.isFinite(operation.timestamp) && operation.timestamp > newest) newest = operation.timestamp;
  }
  return Math.max(Date.now(), newest + 1);
}

/** Adds `data` to `draft` on the level it shows, each a tick after the one before, and returns the ids. */
function append(draft: FogDraft, data: readonly FogOperationInput[]): string[] {
  const start = timeAfterAll(draft.objects.fog);
  return data.map((input, index) => {
    const id = newFogId();
    draft.objects.fog[id] = { id, kind: 'fog', timestamp: start + index, ...input, ...placedOnViewedLevel(draft) };
    return id;
  });
}

function isArea(rect: MapRect | null): rect is MapRect {
  return rect !== null && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

export function createFogActions(set: ImmerSet): FogSlice {
  return {
    addFogOperation: (data) => {
      const id = newFogId();
      set((draft) => {
        const op: FogOperation = {
          id,
          kind: 'fog',
          timestamp: Date.now(),
          ...data,
          ...placedOnViewedLevel(draft),
        };
        draft.objects.fog[id] = op;
      });
      return id;
    },

    addFogOperations: (data) => {
      let ids: string[] = [];
      if (data.length > 0) set((draft) => { ids = append(draft, data); });
      return ids;
    },

    deleteFogOperation: (id) => set((draft) => {
      if (draft.objects.fog[id]) {
        delete draft.objects.fog[id];
        draft.selectedIds = draft.selectedIds.filter(sid => sid !== id);
      }
    }),

    deleteFogOperations: (ids) => set((draft) => {
      for (const id of ids) {
        delete draft.objects.fog[id];
      }
      draft.selectedIds = draft.selectedIds.filter(sid => !ids.includes(sid));
    }),

    duplicateFogOperations: (ids) => set((draft) => {
      if (!ids || !Array.isArray(ids)) return;
      const newIds: string[] = [];
      ids.forEach(id => {
        const original = draft.objects.fog[id];
        if (original && !original.isErasing) {
          const newId = newFogId();
          const offset = 40;
          draft.objects.fog[newId] = {
            ...original,
            id: newId,
            timestamp: Date.now(),
            offsetX: (original.offsetX ?? 0) + offset,
            offsetY: (original.offsetY ?? 0) + offset,
          };
          newIds.push(newId);
        }
      });
      draft.selectedIds = newIds;
    }),

    setFogOperations: (fog) => set((draft) => {
      draft.objects.fog = { ...fog };
    }),

    clearFog: () => set((draft) => {
      draft.objects.fog = elsewhereThanViewedLevel(draft.objects.fog, draft);
    }),

    coverAllFog: (mapRect) => {
      if (!isArea(mapRect)) return false;
      const { x, y, width, height } = mapRect;
      set((draft) => { append(draft, [{ type: 'rectangle', isErasing: false, x, y, width, height }]); });
      return true;
    },
  };
}
