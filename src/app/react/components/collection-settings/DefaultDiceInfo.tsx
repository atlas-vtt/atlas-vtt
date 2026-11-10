/**
 * What default dice are, said with the roll they belong to: the info mark of
 * a set's exploding dice tells it.
 */

import { DEFAULT_DICE_RULES } from '../../../gameSystems/diceRules';
import { parseRollGroups, setRollText } from '../../../gameSystems/diceSets';

/** What default dice are, said with the roll they belong to. */
export function defaultDiceExplanation(defaultRoll: string): string {
  const groups = parseRollGroups(defaultRoll) ?? parseRollGroups(DEFAULT_DICE_RULES.defaultRoll)!;
  const roll = groups.map(({ count, sides }) => `${count}d${sides}`).join('+');
  return `The default dice are the set's dice, ${setRollText(groups)}. Atlas rolls them when a statblock gives only a bonus without dice: +3 rolls ${roll}+3, −3 rolls ${roll}−3.`;
}
