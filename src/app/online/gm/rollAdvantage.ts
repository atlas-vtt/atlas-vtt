import type { AdvantageSide, SharedRollDice } from '../protocol/index.ts';
import { rollingRules } from '../../gameSystems/diceSets';
import { completeFormula } from '../../tools/completeFormula';
import { ruledSides, withAdvantage } from '../../tools/diceAdvantage';
import type { DiceRules } from '../../types/diceRulesTypes';
import type { RollingDice } from '../../types/diceSetTypes';
import type { TokenEntity } from '../../types';
import type { DiceSource } from './atlasDice.ts';

/** The dice a roll by `rules` is made with, as a page needs them to offer advantage (`SharedRollDice`). */
export function sharedRollDice(rules: DiceRules | RollingDice): SharedRollDice {
  const rolling = rollingRules(rules);
  return { dice: rolling.dice.map(({ count, sides }) => ({ count, sides })), sides: ruledSides(rolling) };
}

/** The map's dice, as a page offers advantage on a roll by them; null while the tab has no dice. */
export function mapRollDice(dice: DiceSource | null): SharedRollDice | null {
  return dice === null ? null : sharedRollDice(dice.rules());
}

/** The dice of a token's own set (its character's template's), as `PlayerRolls` rolls for it; undefined where it rolls with the map's. */
export function tokenRollDice(dice: DiceSource | null, token: TokenEntity | undefined): SharedRollDice | undefined {
  const set = token === undefined ? undefined : dice?.setFor?.(token);
  return set === undefined ? undefined : sharedRollDice(set);
}

/**
 * The side a player's roll of `formula` is made with by `rules`: the side asked for where the set has
 * a rule for it, the roll holds the set's dice and the rule keeps it within the dice's limits; none
 * otherwise, and the roll is made plain, as a statblock's roll is where its menu offers no side.
 */
export function playerSide(formula: string, rules: DiceRules | RollingDice, asked: AdvantageSide | undefined): AdvantageSide | undefined {
  if (asked === undefined) return undefined;
  const complete = completeFormula(formula, rules);
  if (!complete.ok) return undefined;
  const helped = withAdvantage(complete.parsed, [], rollingRules(rules), asked);
  return helped !== null && !('ok' in helped) ? asked : undefined;
}
