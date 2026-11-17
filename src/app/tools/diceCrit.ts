import { rollingRules } from '../gameSystems/diceSets';
import type { DiceRules } from '../types/diceRulesTypes';
import type { RollingDice } from '../types/diceSetTypes';
import type { RolledDie } from './diceFormula';

export type DiceCrit = 'high' | 'low' | null;

type CritDie = Pick<RolledDie, 'value' | 'max' | 'negative' | 'exploded' | 'rerolled' | 'dropped' | 'advantage'>;

/**
 * The default dice of a roll, in the set's order: for each of its groups the
 * first dice of that group's size not taken yet, as many as it rolls. A roll
 * with fewer of them, such as a d8 under a d20 set, has none (null). Dice
 * rolled for an explosion are no default dice: the die that exploded is; nor
 * are dice that were rolled again or dropped (only the kept count, so the die
 * kept of `2d20kh1` is the default die of a d20 set) or a die advantage added.
 */
export function defaultDiceOf<T extends CritDie>(rolls: readonly T[], rules: RollingDice): T[] | null {
  const taken = new Set<number>();
  const found: T[] = [];
  for (const group of rules.dice) {
    for (let n = 0; n < group.count; n++) {
      const index = rolls.findIndex((die, i) => !taken.has(i) && !die.negative && !die.exploded && !die.rerolled && !die.dropped && !die.advantage && die.max === group.sides);
      if (index < 0) return null;
      taken.add(index);
      found.push(rolls[index]!);
    }
  }
  return found;
}

/**
 * Whether a roll holds no die besides its default dice and what they bring along: the dice
 * their explosions rolled, the dice rolled again or dropped (advantage's extra die, a typed
 * `2d20kh1`) and a die advantage added. Constants are no dice. A pool that mixes in any other
 * die (`1d20 + 1d4`, a damage die thrown with the attack) is no test of the default dice.
 */
function aloneWith<T extends CritDie>(rolls: readonly T[], dice: readonly T[]): boolean {
  return rolls.every((die) => dice.includes(die) || die.exploded || die.rerolled || die.dropped || die.advantage);
}

/**
 * Classifies a roll for the critical look (the tinted total and its caption) and the result
 * sound. Only a roll of the default dice alone can be critical (`aloneWith`), and only those
 * dice count (`defaultDiceOf`): a mixed pool never is.
 */
export function getDiceCrit(rolls: readonly CritDie[], rules: DiceRules | RollingDice): DiceCrit {
  const rolling = rollingRules(rules);
  if (rolling.crit === 'none') return null;
  const dice = defaultDiceOf(rolls, rolling);
  if (!dice || dice.length === 0 || !aloneWith(rolls, dice)) return null;

  switch (rolling.crit) {
    case 'natural':
      return extremeCrit(dice, (die) => die.value === die.max, (die) => die.value === 1);
    case 'roll-under':
      return extremeCrit(dice, (die) => die.value === 1, (die) => die.value === die.max);
    case 'doubles':
      return dice.length >= 2 && dice.every((die) => die.value === dice[0]!.value) ? 'high' : null;
    case 'high-total': {
      const total = dice.reduce((sum, die) => sum + die.value, 0);
      const highest = dice.reduce((sum, die) => sum + die.max, 0);
      return total >= highest - 1 ? 'high' : null;
    }
  }
}

function extremeCrit(dice: readonly CritDie[], best: (die: CritDie) => boolean, worst: (die: CritDie) => boolean): DiceCrit {
  if (dice.some(best)) return 'high';
  return dice.some(worst) ? 'low' : null;
}
