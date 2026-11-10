import { useCallback } from 'react';
import { deckSize } from '../../gameSystems/initiativeCardRules';
import { cardsShort } from '../../initiative/cardGroups';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';
import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';

/**
 * Starts a fight as `rules` say. A fight by cards whose deck has too few cards for the combatants,
 * even with look-alikes sharing, does not start: the GM is told how many cards are missing.
 */
export function useStartCombat(rules: InitiativeRules, defeated: () => ReadonlySet<string>): () => void {
  const store = useViewStoreHook();
  const startCombat = useAtlasStore((s) => s.startCombat);
  return useCallback((): void => {
    if (rules.mode === 'cards') {
      const { initiative, objects } = store.getState();
      const short = cardsShort({ deck: deckSize(rules), ...(rules.lookAlikesShare && { share: true }) }, initiative.entries, objects.tokens);
      if (short > 0) {
        showNotice(t('initRules.cardsShort', { count: short }));
        return;
      }
    }
    startCombat(rules, defeated());
  }, [store, startCombat, rules, defeated]);
}
