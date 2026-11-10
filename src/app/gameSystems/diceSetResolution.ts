/**
 * Which dice set rolls a bare bonus. A collection rolls its own pick from the
 * library; a collection saved before sets existed rolls the dice rules it
 * stored, read as a set, so nothing changes for it; one without either rolls
 * its game system's; anything else the plain d20. A statblock's template may
 * name a set of its own, which then wins (`statblockDiceSet`).
 */

import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { DiceRules } from '../types/diceRulesTypes';
import type { DiceSet } from '../types/diceSetTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { BUILT_IN_DICE_SETS, D20_DICE_SET_ID } from './builtInDiceSets';
import { dressed, rollingRules, sameRolling, setRollText } from './diceSets';

/**
 * The id of the set a collection rolls from the dice rules it stored itself,
 * where no library set rolls alike: it is in no library, and no template names it.
 */
export const COLLECTION_DICE_ID = '';

/** The set with this id among `sets`, or the built-in one; undefined for an unknown or missing id. */
export function findDiceSet(sets: readonly DiceSet[], id: string | undefined): DiceSet | undefined {
  if (!id) return undefined;
  return sets.find((set) => set.id === id) ?? BUILT_IN_DICE_SETS.find((set) => set.id === id);
}

/** The set a collection without a system rolls. */
export function defaultDiceSet(): DiceSet {
  return findDiceSet([], D20_DICE_SET_ID)!;
}

/**
 * Stored dice rules as a set: the built-in set that rolls alike, so a
 * collection that kept its system's d20 still rolls the d20 set, else a set of
 * the collection's own named after its dice.
 */
export function setOfDiceRules(rules: DiceRules): DiceSet {
  const rolling = rollingRules(rules);
  const builtIn = BUILT_IN_DICE_SETS.find((set) => !dressed(set) && sameRolling(set, rolling));
  return builtIn ?? { id: COLLECTION_DICE_ID, name: setRollText(rolling.dice), builtIn: false, ...rolling };
}

interface DiceSettings {
  dice?: CollectionSettings['dice'] | undefined;
  diceSetId?: string | undefined;
  systemPresetId?: string | undefined;
}

/**
 * The set a collection rolls a bare bonus with: its pick from the library,
 * else the dice rules it stored (a collection that never picked a set, as
 * versions before sets saved it), else its game system's set or dice rules,
 * else the d20. A collection whose pick is missing (a set deleted or not
 * synced yet) stored no dice rules beside it, so it rolls its system's.
 */
export function collectionDiceSet(settings: DiceSettings, presets: readonly SystemPreset[], sets: readonly DiceSet[]): DiceSet {
  const picked = findDiceSet(sets, settings.diceSetId);
  if (picked) return picked;
  if (settings.dice) return setOfDiceRules(settings.dice);
  const preset = presets.find((entry) => entry.id === settings.systemPresetId);
  const systemSet = findDiceSet(sets, preset?.rules.diceSetId);
  if (systemSet) return systemSet;
  return preset?.rules.dice ? setOfDiceRules(preset.rules.dice) : defaultDiceSet();
}

/**
 * The set a statblock rolls a bare bonus with: its template's, else the
 * collection's. A template that names no set, or one the library lacks,
 * rolls the collection's dice; so does every Fantasy Statblocks note, which
 * has no Atlas template.
 */
export function statblockDiceSet(templateSetId: string | undefined, collectionSet: DiceSet, sets: readonly DiceSet[]): DiceSet {
  return findDiceSet(sets, templateSetId) ?? collectionSet;
}
