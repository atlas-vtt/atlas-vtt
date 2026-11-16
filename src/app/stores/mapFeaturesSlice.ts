/** Map features (`MapFeature`) in the view store: map geometry, each change one undo step. */

import { firstLevelId, hasLevels, onLevel, placedOnViewedLevel } from '../levels/sceneLevels';
import { MAX_MAP_FEATURES } from '../mapFeatures/mapFeatures';
import type { MapFeature, MapFeatureChanges, MapFeatureInput } from '../types/mapFeatureTypes';
import type { ViewState } from '../types/viewState';
import { isRecord } from '../utils/guards';

export interface MapFeaturesSlice {
  /**
   * Adds features in one undo step and returns their ids: each on the level its data names, else
   * the level shown. A level that holds `MAX_MAP_FEATURES` takes no more (no id for those).
   */
  addMapFeatures: (data: readonly MapFeatureInput[]) => string[];
  /** Changes a feature; a field given as undefined is removed. */
  updateMapFeature: (id: string, changes: MapFeatureChanges) => void;
  deleteMapFeature: (id: string) => void;
}

type FeaturesDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects'>;

type ImmerSet = (fn: (draft: FeaturesDraft) => void) => void;

function newFeatureId(): string {
  return `feature_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** The level a feature counts on for the limit: the one it stands on ('' in a scene without levels). */
function levelKey(feature: MapFeature, draft: FeaturesDraft): string {
  const { levels } = draft;
  if (!hasLevels(levels)) return '';
  return levels.find((candidate) => onLevel(feature, candidate.id, levels))?.id ?? firstLevelId(levels) ?? '';
}

export function createMapFeaturesActions(set: ImmerSet): MapFeaturesSlice {
  return {
    addMapFeatures: (data) => {
      const ids: string[] = [];
      if (data.length === 0) return ids;
      set((draft) => {
        // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
        if (!isRecord(draft.objects.mapFeatures)) draft.objects.mapFeatures = {};
        const record = draft.objects.mapFeatures;
        const counts = new Map<string, number>();
        for (const feature of Object.values(record)) {
          // A file is kept as it came: an entry that is no feature counts for nothing.
          if (!isRecord(feature)) continue;
          const key = levelKey(feature, draft);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const placed = placedOnViewedLevel(draft);
        for (const input of data) {
          const feature: MapFeature = { id: newFeatureId(), kind: 'map-feature', ...placed, ...input };
          const level = levelKey(feature, draft);
          const count = counts.get(level) ?? 0;
          if (count >= MAX_MAP_FEATURES) continue;
          counts.set(level, count + 1);
          record[feature.id] = feature;
          ids.push(feature.id);
        }
      });
      return ids;
    },

    updateMapFeature: (id, changes) => set((draft) => {
      const feature = draft.objects.mapFeatures?.[id];
      if (!feature) return;
      Object.assign(feature, changes);
      for (const field of Object.keys(changes) as (keyof MapFeatureChanges)[]) {
        if (changes[field] === undefined) delete feature[field];
      }
    }),

    deleteMapFeature: (id) => set((draft) => {
      delete draft.objects.mapFeatures?.[id];
    }),
  };
}
