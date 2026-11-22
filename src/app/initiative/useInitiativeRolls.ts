import type { App } from 'obsidian';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewStoreHook } from '../react/ViewStoreContext';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { isRollingInitiative, rollInitiative } from './rollInitiative';

interface InitiativeRolls {
  /** Rolls every combatant, or the one of `entryId`, with their statblocks' modifiers. */
  roll: (entryId?: string) => void;
  /** A roll is reading statblocks; another is not started meanwhile. */
  rolling: boolean;
}

/** Initiative rolls of the tracker (`rollInitiative`); a roll that ends after the tracker went rolls nothing. */
export function useInitiativeRolls(app: App, rules: InitiativeRules): InitiativeRolls {
  const store = useViewStoreHook();
  const mounted = useRef(true);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const roll = useCallback((entryId?: string): void => {
    // A roll under way keeps `rolling` until it ends
    if (isRollingInitiative(store)) return;
    setRolling(true);
    void rollInitiative(app, store, rules, { entryId, wanted: () => mounted.current })
      .finally(() => { if (mounted.current) setRolling(false); });
  }, [app, store, rules]);

  return { roll, rolling };
}
