/** Liquid surfaces (`LiquidSurface`) in the view store: map geometry, each change one undo step. */

import { firstLevelId, hasLevels, onLevel, placedOnViewedLevel } from '../levels/sceneLevels';
import { MAX_LIQUIDS } from '../liquids/liquids';
import type { LiquidSurface, LiquidSurfaceInput } from '../types/liquidTypes';
import type { ViewState } from '../types/viewState';
import { isRecord } from '../utils/guards';

export interface LiquidsSlice {
  /**
   * Adds surfaces in one undo step and returns their ids: each on the level its data names, else
   * the level shown. A level that holds `MAX_LIQUIDS` takes no more (no id for those).
   */
  addLiquids: (data: readonly LiquidSurfaceInput[]) => string[];
  deleteLiquid: (id: string) => void;
}

type LiquidsDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects'>;

type ImmerSet = (fn: (draft: LiquidsDraft) => void) => void;

function newLiquidId(): string {
  return `liquid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** The level a surface counts on for the limit: the one it stands on ('' in a scene without levels). */
function levelKey(surface: object, draft: LiquidsDraft): string {
  const { levels } = draft;
  if (!hasLevels(levels)) return '';
  return levels.find((candidate) => onLevel(surface, candidate.id, levels))?.id ?? firstLevelId(levels) ?? '';
}

export function createLiquidsActions(set: ImmerSet): LiquidsSlice {
  return {
    addLiquids: (data) => {
      const ids: string[] = [];
      if (data.length === 0) return ids;
      set((draft) => {
        // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
        if (!isRecord(draft.objects.liquids)) draft.objects.liquids = {};
        const record = draft.objects.liquids;
        const counts = new Map<string, number>();
        for (const surface of Object.values(record)) {
          // A file is kept as it came: an entry that is no surface counts for nothing.
          if (!isRecord(surface)) continue;
          const key = levelKey(surface, draft);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const placed = placedOnViewedLevel(draft);
        for (const input of data) {
          const surface: LiquidSurface = { id: newLiquidId(), kind: 'liquid', ...placed, ...input };
          const level = levelKey(surface, draft);
          const count = counts.get(level) ?? 0;
          if (count >= MAX_LIQUIDS) continue;
          counts.set(level, count + 1);
          record[surface.id] = surface;
          ids.push(surface.id);
        }
      });
      return ids;
    },

    deleteLiquid: (id) => set((draft) => {
      delete draft.objects.liquids?.[id];
    }),
  };
}
