import { t } from '../../../i18n';
import { characterRestOf, type CharacterRest } from '../../../recovery/characterRest';
import type { RecoveryButton } from '../../../recovery/recoveryTypes';
import { restOffers, type RestOffer } from '../../../recovery/restOffer';
import type { RestChoices, RestRoller } from '../../../recovery/restTypes';
import type { AllyRests, CounterWriter } from '../../../recovery/restWrites';
import { takeRest } from '../../../recovery/takeRest';
import { rollStatblockDice, type OffMapRolls } from '../../../services/statblockRolls';
import { showNotice } from '../../../ui/notice';
import type { PaneEditController } from './paneEditContext';
import type { PaneRecovery } from './usePaneRecovery';

/** Rolls a rest's formula as a roll of the statblock, named by its label ("HP (Long rest)"), where Atlas shows the statblock's rolls. */
function paneRoller(pane: PaneEditController, recovery: PaneRecovery, offMap: OffMapRolls | null): RestRoller {
  return (formula, label) => {
    const result = rollStatblockDice(pane.app, formula, { statblockPath: pane.notePath, tokenName: recovery.character.name, abilityName: label }, offMap);
    return result && { formula, total: result.total };
  };
}

/** Writes counters through the pane, so a change the note made meanwhile shows as the pane's conflict. */
function paneCounterWriter(pane: PaneEditController): CounterWriter {
  return async (writes) => {
    await Promise.all(writes.map(({ field, patches, base, next }) => pane.write(field, patches, { base, mine: next })));
    return null;
  };
}

/** The character as it rests now, with the note's values as the pane holds them. */
export function restNow(pane: PaneEditController, recovery: PaneRecovery): CharacterRest {
  const { character, templateId, template } = recovery;
  return characterRestOf(pane.app, character, { notePath: pane.notePath, templateId, template, record: pane.record });
}

/** `button` as the character can take it now; null where it cannot. */
export function restOfferNow(pane: PaneEditController, recovery: PaneRecovery, button: RecoveryButton): RestOffer | null {
  return restOffers([button], restNow(pane, recovery).character)[0] ?? null;
}

/** Everything taking a rest from the pane needs besides the button and the player's choices. */
export interface PaneRestContext {
  readonly pane: PaneEditController;
  readonly recovery: PaneRecovery;
  readonly offMap: OffMapRolls | null;
}

/**
 * Takes the button `buttonId` for the pane's character with `choices`, changing the other player
 * characters an action was taken for through `allies`, and says what the rest did in a notice.
 */
export async function takePaneRest({ pane, recovery, offMap }: PaneRestContext, buttonId: string, choices: RestChoices, allies?: AllyRests): Promise<void> {
  const taken = await takeRest(pane.app, restNow(pane, recovery), buttonId, choices, paneRoller(pane, recovery, offMap), paneCounterWriter(pane), allies);
  if (!taken) return;
  const { text } = taken.summary;
  showNotice(taken.problem === null ? text : `${text}\n${t('rest.failed', { problem: taken.problem })}`);
}
