/**
 * What a value of a statblock rolls on a click, as the card links it. Text
 * links its own dice notation and signed bonuses (`statblockDiceLinks.ts`); a
 * block switched to "Roll as a bonus" (`rollable`) also rolls a whole number it
 * shows as a bonus, `2` as `+2`, which Atlas completes with the game's dice.
 */

import { splitDiceSegments, toRollFormula } from '../../services/statblockDiceText';

/** A whole number as written on a card: an optional sign (minus sign and en dash included) on at most four digits. */
const WHOLE_NUMBER = /^([+\-−–]?)(\d{1,4})$/;

/** A whole number as the bonus it rolls: `2` and `+2` roll `+2`, `-1` and `−1` roll `-1`, `0` rolls `+0`; null for any other text. */
export function bonusOf(text: string): string | null {
  const match = WHOLE_NUMBER.exec(text.trim());
  if (!match) return null;
  const value = Number(match[2]);
  return match[1] !== '' && match[1] !== '+' && value !== 0 ? `-${value}` : `+${value}`;
}

/**
 * The bonus a rollable value's own link rolls, where its text links no dice of
 * its own (`2`, `–1`): a signed `+2` is linked by the text already. Null where
 * the block is not rollable or the text is no whole number.
 */
export function bonusLink(text: string, rollable: boolean | undefined): string | null {
  if (rollable !== true || splitDiceSegments(text).some((segment) => segment.dice)) return null;
  return bonusOf(text);
}

/**
 * What a click on a whole value rolls, as the card links it: a rollable
 * value's number as a bonus, else the one roll its text holds (`1d8+3`, `ATK: +4`,
 * `+2`) where it holds exactly one and no other number. Null where it rolls nothing.
 */
export function valueRoll(text: string, rollable: boolean | undefined): string | null {
  const bonus = bonusLink(text, rollable);
  if (bonus !== null) return bonus;
  const segments = splitDiceSegments(text);
  const rolls = segments.filter((segment) => segment.dice);
  const [only] = rolls;
  if (rolls.length !== 1 || !only || segments.some((segment) => !segment.dice && /\d/.test(segment.text))) return null;
  return toRollFormula(only.text);
}
