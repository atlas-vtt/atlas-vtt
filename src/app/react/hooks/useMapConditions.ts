import { useMemo } from 'react';
import { mapConditions } from '../../gameSystems/mapRules';
import { rulesLookup } from '../../services/mapRules';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore } from '../ViewStoreContext';
import { useMapRulesRevision } from './useMapRulesRevision';

/** The conditions of the rules the view's map plays by, as its tokens show them; follows edits to them and the loading of the asset index. */
export function useMapConditions(): readonly ConditionDefinition[] {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const revision = useMapRulesRevision(app);

  return useMemo(
    () => (app ? mapConditions(rulesLookup(app), mapPath) : []),
    // `revision` stands for the rules and the asset index, which are read here.
    [app, mapPath, revision],
  );
}
