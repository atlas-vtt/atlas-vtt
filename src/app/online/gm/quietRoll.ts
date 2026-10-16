import type { SharedRoll } from '../protocol/index.ts';
import { rollingRules } from '../../gameSystems/diceSets';
import { completeFormula } from '../../tools/completeFormula';
import { getDiceCrit } from '../../tools/diceCrit';
import { rollFormula } from '../../tools/diceFormula';
import type { DiceRules } from '../../types/diceRulesTypes';
import type { RollingDice } from '../../types/diceSetTypes';
import { sharedRoll } from './RollShare.ts';

/** A number in [0, 1) from the cryptographic source. */
function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
}

/**
 * A formula rolled by a map's rules (its criticals and exploding dice) without a throw on anyone's
 * screen and without a line in the scene's roll history: for rolls in a message, and private rolls
 * Atlas's own player window must not show. A formula without dice (`+2`) is added to the map's dice,
 * as Atlas's dice tool adds it (`completeFormula`). Null for an empty formula or one that does not parse.
 */
export function quietRoll(formula: string, rules: DiceRules | RollingDice, id: string, now: number, random: () => number = cryptoRandom): SharedRoll | null {
  const complete = formula.trim() === '' ? null : completeFormula(formula, rules);
  if (complete === null || !complete.ok) return null;
  const looks = complete.written ? [] : rollingRules(rules).dice;
  const { rolls, modifiers, total, linear } = rollFormula(complete.parsed, random, rules, looks);
  return sharedRoll({ id, timestamp: now, formula: complete.formula, rolls, modifiers, total, crit: getDiceCrit(rolls, rules), ...(!linear && { linear: false as const }) });
}
