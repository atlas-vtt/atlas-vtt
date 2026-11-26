import { useMemo } from 'react';
import type { App } from 'obsidian';
import { useMapRulesRevision } from '../react/hooks/useMapRulesRevision';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';
import { rulesLookup } from '../services/mapRules';
import { mapResources } from './collectionResources';
import type { ResourceDefinition } from './resourceTypes';

/** The resources of the rules the map at `mapPath` plays by; follows edits to them, the played campaign and the loading of the asset index. */
export function useResourcesOfMap(app: App | null | undefined, mapPath: string | null | undefined): readonly ResourceDefinition[] {
  const revision = useMapRulesRevision(app);

  return useMemo(
    () => (app ? mapResources(rulesLookup(app), mapPath) : []),
    // `revision` stands for the rules and the asset index, which are read here.
    [app, mapPath, revision],
  );
}

/** The resources of the rules the view's map plays by (`useResourcesOfMap`). */
export function useMapResources(): readonly ResourceDefinition[] {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  return useResourcesOfMap(app, mapPath);
}
