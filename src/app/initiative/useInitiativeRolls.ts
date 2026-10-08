import { Notice, type App } from 'obsidian';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sameInitiativeRules } from '../gameSystems/initiativeRules';
import { t } from '../i18n';
import { useViewStoreHook } from '../react/ViewStoreContext';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { rollWithStatblocks } from './rollWithStatblocks';

/** Both tracker roll controls share the statblock read and guard against overlapping requests. */
export function useInitiativeRolls(app: App, rules: InitiativeRules): { roll: (entryId?: string) => Promise<void>; isRolling: boolean } {
  const store = useViewStoreHook();
  const latestRules = useRef(rules);
  latestRules.current = rules;
  const mounted = useRef(false);
  const pending = useRef(false);
  const [isRolling, setIsRolling] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const roll = useCallback(async (entryId?: string): Promise<void> => {
    if (pending.current) return;
    pending.current = true;
    setIsRolling(true);
    try {
      await rollWithStatblocks(app, store, rules, entryId, () => mounted.current
        && store.getState().initiativeTrackerOpen && sameInitiativeRules(rules, latestRules.current));
    } catch (error) {
      console.error('[Atlas VTT] Could not read initiative modifiers:', error);
      if (mounted.current) new Notice(t('initiative.modifierReadError'));
    } finally {
      pending.current = false;
      if (mounted.current) setIsRolling(false);
    }
  }, [app, store, rules]);

  return { roll, isRolling };
}
