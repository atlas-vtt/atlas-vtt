import { deckSize } from '../gameSystems/initiativeCardRules';
import { t } from '../i18n';
import type { ViewAtlasState } from '../storeFactory';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { showNotice } from '../ui/notice';
import { cardsShort } from './cardGroups';

/**
 * Starts a fight as `rules` say, as the tracker's Start button does. A fight by cards whose deck has
 * too few cards for the combatants, even with look-alikes sharing, does not start: the GM is told how
 * many cards are missing, and false comes back.
 */
export function startCombatByRules(
  state: Pick<ViewAtlasState, 'initiative' | 'objects' | 'startCombat'>,
  rules: InitiativeRules,
  defeated: () => ReadonlySet<string>,
): boolean {
  if (rules.mode === 'cards') {
    const short = cardsShort({ deck: deckSize(rules), ...(rules.lookAlikesShare && { share: true }) }, state.initiative.entries, state.objects.tokens);
    if (short > 0) {
      showNotice(t('initRules.cardsShort', { count: short }));
      return false;
    }
  }
  state.startCombat(rules, defeated());
  return true;
}
