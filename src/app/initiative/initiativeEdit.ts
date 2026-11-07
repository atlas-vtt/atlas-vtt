/** What the initiative card's edit popup reads from an entry and writes back to it. */

import type { InitiativeEntry } from '../types/initiativeTypes';
import { ownModifier, parseInitiativeModifier } from './initiativeModifier';

type EditedParts = Partial<Pick<InitiativeEntry, 'initiative' | 'initiativeModifier' | 'modifierByHand'>>;

/** The modifier field as the popup opens: the GM's own modifier, empty where there is none. */
export function modifierText(entry: Pick<InitiativeEntry, 'initiativeModifier' | 'modifierByHand'>): string {
  const own = ownModifier(entry);
  return own === undefined ? '' : String(own);
}

/**
 * The changes of a confirmed popup: the total where it reads as a whole number, and the GM's own
 * modifier, 0 included, which an emptied field clears so the statblock's counts again. What is
 * no number changes nothing.
 */
export function initiativeEdit(totalText: string, modifierInput: string): EditedParts {
  const modifier = modifierInput.trim() === '' ? null : parseInitiativeModifier(modifierInput);
  return {
    ...totalEdit(totalText),
    ...(modifierInput.trim() === ''
      ? { initiativeModifier: 0, modifierByHand: undefined }
      : modifier !== null && { initiativeModifier: modifier, modifierByHand: true }),
  };
}

/** The change of a number typed on the card itself: the total where it reads as a whole number, else nothing. */
export function totalEdit(totalText: string): Pick<EditedParts, 'initiative'> {
  const total = parseInitiativeModifier(totalText);
  return total === null ? {} : { initiative: total };
}
