import { useCallback } from 'react';
import { startCombatByRules } from '../../initiative/combatStart';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import { useViewStoreHook } from '../ViewStoreContext';

/** The tracker's Start button: starts a fight as `rules` say (`startCombatByRules`). */
export function useStartCombat(rules: InitiativeRules, defeated: () => ReadonlySet<string>): () => void {
  const store = useViewStoreHook();
  return useCallback((): void => {
    startCombatByRules(store.getState(), rules, defeated);
  }, [store, rules, defeated]);
}
