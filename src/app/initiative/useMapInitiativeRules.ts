import { useMemo } from 'react';
import { DEFAULT_INITIATIVE_RULES } from '../gameSystems/initiativeRules';
import { useMapRulesRevision } from '../react/hooks/useMapRulesRevision';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';
import { mapInitiativeRules } from '../services/mapInitiativeRules';
import type { InitiativeRules } from '../types/initiativeRulesTypes';

/** The initiative rules the view's map plays by; follows edits to them and the loading of the asset index. */
export function useMapInitiativeRules(): InitiativeRules {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const revision = useMapRulesRevision(app);

  return useMemo(
    () => (app ? mapInitiativeRules(app, mapPath) : { ...DEFAULT_INITIATIVE_RULES }),
    // `revision` stands for the rules and the asset index, which are read here.
    [app, mapPath, revision],
  );
}
