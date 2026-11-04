import type { SharedRoll } from '../protocol/index.ts';
import { rollingRules } from '../../gameSystems/diceSets';
import { completeFormula } from '../../tools/completeFormula';
import { withAdvantage } from '../../tools/diceAdvantage';
import { getDiceCrit } from '../../tools/diceCrit';
import { rollFormula } from '../../tools/diceFormula';
import { dressSetDice } from '../../tools/diceAppearance';
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
 * Atlas's own player window must not show. A formula without dice (`+2`) is added to the map's dice,
 * as Atlas's dice tool adds it (`completeFormula`), and `advantage` changes a roll of the set's dice as
 * the set's rule for the side says, as the dice tool's does. Null for an empty formula or one that does
 * not parse, or that advantage takes past the dice's limits.
 */
export function quietRoll(formula: string, rules: DiceRules | RollingDice, id: string, now: number, random: () => number = cryptoRandom, setAppearance = false, advantage?: AdvantageSide): SharedRoll | null {
  const complete = formula.trim() === '' ? null : completeFormula(formula, rules);
  if (complete === null || !complete.ok) return null;
  const looks = complete.written ? [] : rollingRules(rules).dice;
  const helped = advantage === undefined ? null : withAdvantage(complete.parsed, looks, rollingRules(rules), advantage);
  if (helped !== null && 'ok' in helped) return null;
  const { rolls, modifiers, named, total, linear } = helped === null
    ? rollFormula(complete.parsed, random, rules, looks)
    : rollFormula(helped.formula, random, helped.explodeRules, helped.looks);
  return sharedRoll({
    id, timestamp: now, formula: complete.formula, rolls: complete.written && setAppearance ? dressSetDice(rolls, rollingRules(rules)) : rolls, modifiers,
    ...(named.length > 0 && { namedModifiers: named }), total, crit: getDiceCrit(rolls, rules), ...(!linear && { linear: false as const }),
  });
}
