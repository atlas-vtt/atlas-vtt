import type { SharedRoll } from '../protocol/index.ts';
import { rollDiceFormula } from '../../tools/DiceTool';
import type { DiceRules } from '../../types/diceRulesTypes';
import type { AdvantageSide, RollingDice } from '../../types/diceSetTypes';
import { sharedRoll } from './RollShare.ts';

/** A number in [0, 1) from the cryptographic source. */
function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
}

/**
 * A formula rolled by a map's rules (its criticals and exploding dice) without a throw on anyone's
 * screen and without a line in the scene's roll history: for rolls in a message, and private rolls
 * Atlas's own player window must not show. It is rolled as Atlas's dice tool rolls it
 * (`rollDiceFormula`): a formula without dice (`+2`) is added to the map's dice, and `advantage`, or a
 * side the formula writes last (`+4 adv`), changes a roll of the set's dice as the set's rule for the
 * side says. Null for an empty formula or one the dice tool refuses.
 */
export function quietRoll(formula: string, rules: DiceRules | RollingDice, id: string, now: number, random: () => number = cryptoRandom, setAppearance = false, advantage?: AdvantageSide): SharedRoll | null {
  if (formula.trim() === '') return null;
  const inputs = { random, rollId: (): string => id, roller: (): string => '', onFormulaError: (): undefined => undefined };
  const result = rollDiceFormula(formula, rules, inputs, undefined, advantage, setAppearance);
  return result === null ? null : sharedRoll({ ...result, timestamp: now });
}
