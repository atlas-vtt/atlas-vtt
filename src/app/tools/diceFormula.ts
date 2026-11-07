/**
 * Rolls a parsed formula (`parseFormula.ts`) such as `2d6+3`, `d20+2d6`,
 * `4d6kh3` or `(1d8+2)*2`. Every term carries the sign that leads to it, so
 * the `+2` of `+2d6` is a dice count and never a modifier, and subtracted
 * dice subtract.
 *
 * A dice term may explode (`diceExplosion.ts`): by its own notation, written
 * as Obsidian's Dice Roller writes it since statblocks use that (`2d6!` once,
 * `2d6!3` up to three times, `2d6!i` again and again; `!!` reads the same) or
 * as Foundry VTT does (`x`, `xo`, `x>=9`), or by the collection's rule.
 */

import { parseRollGroups } from '../gameSystems/diceSets';
import type { DiceRules, ExplodeRule } from '../types/diceRulesTypes';
import type { DiceSetDie, RollingDice } from '../types/diceSetTypes';
import { MAX_EXPLOSIONS, type Explosion } from './diceExplosion';
import { evaluateFormula } from './evaluateFormula';
import type { ConstantTerm, DiceTerm, FormulaTerm, ParsedFormula } from './formulaTypes';
import { rollDiceTerm } from './rollDiceTerm';

export interface RolledDie {
  /** e.g. `d20`, or `dF` for a Fate die. */
  die: string;
  value: number;
  max: number;
  /** The lowest face where it is not 1: −1 on a Fate die. */
  min?: number;
  /** The die subtracts: it belongs to a subtracted term, e.g. the d4 of `2d6-1d4`, or to an explosion downwards. */
  negative?: true;
  /** The die was rolled because the die before it exploded. */
  exploded?: true;
  /** The die was rolled again: the die after it stands in its place, and it counts for nothing. */
  rerolled?: true;
  /** Keep or drop left the die out: it counts for nothing. */
  dropped?: true;
  /** The die counts as a success of a term that counts successes (`cs>=8`). */
  success?: true;
  /** The die counts as a failure of a term that counts failures (`cf<=1`). */
  failure?: true;
  /** The label of the die's term: `fire` for `2d6[fire]`. */
  label?: string;
  /** The name a dice set gives the die ("Sun"); a die rolled for it in an explosion carries it too. */
  name?: string;
  /** `#rrggbb`: the colour a dice set gives the die. */
  colour?: string;
  /** Rolled because of advantage or disadvantage: a die of the rule's own, added or subtracted. */
  advantage?: true;
  /** A d100 that rolled only its tens and shares the units of the d100 before it (a bonus or penalty die). */
  sharedUnits?: true;
}

/** What a dice set gives the dice of one term: a name and a colour. */
export type DieLook = Pick<DiceSetDie, 'name' | 'colour'>;

/** A constant written with a label (`2[Proficiency]`), kept apart so a roll can name it: `+ 2 Proficiency`. */
export interface NamedModifier {
  label: string;
  /** Signed: a subtracted constant is negative. */
  value: number;
}

export interface RolledFormula {
  rolls: RolledDie[];
  /** The constants added to the dice; 0 unless the formula is `linear`. */
  modifiers: number;
  /** The labelled constants among `modifiers`, in written order; none unless the formula is `linear`. */
  named: NamedModifier[];
  /** The whole number the formula comes to. */
  total: number;
  /** The formula is a signed sum of dice and constants (`ParsedFormula.linear`). */
  linear: boolean;
}

/** How the collection's rule explodes a die it applies to. */
function ruledExplosion({ repeats, highFaces, lowFaces }: ExplodeRule): Explosion {
  return { highFaces, lowFaces, limit: repeats ? MAX_EXPLOSIONS : 1 };
}

/**
 * Rolls an already validated formula and works it out. `rules` are the dice
 * set's (or the collection's dice rules): its exploding rule, and its dice,
 * which say which dice a default-dice rule means: for each group the first
 * added dice of its size, as many as it rolls (as for criticals). `looks` give
 * the dice of the formula's dice terms, by their order, a name and colour.
 */
export function rollFormula(
  formula: ParsedFormula,
  random: () => number = Math.random,
  rules?: Pick<DiceRules, 'defaultRoll' | 'explode'> | Pick<RollingDice, 'dice' | 'explode'>,
  looks: readonly (DieLook | undefined)[] = [],
): RolledFormula {
  const explode = rules?.explode;
  const groups = !rules || explode?.dice !== 'default' ? [] : 'dice' in rules ? rules.dice : parseRollGroups(rules.defaultRoll) ?? [];
  const defaultLeft = groups.map((group) => ({ sides: group.sides, left: group.count }));
  const ruled = ({ faces, negative }: DiceTerm): Explosion | null => {
    const group = negative ? undefined : defaultLeft.find((entry) => entry.sides === faces && entry.left > 0);
    if (group) group.left -= 1;
    return explode && (explode.dice === 'all' || group) ? ruledExplosion(explode) : null;
  };

  const rolls: RolledDie[] = [];
  const values = new Map<FormulaTerm, number>();
  let diceTerm = 0;
  for (const term of formula.terms) {
    if (term.kind === 'constant') continue;
    const rolled = rollDiceTerm(term, random, ruled, looks[diceTerm++]);
    rolls.push(...rolled.dice);
    values.set(term, rolled.value);
  }

  const total = evaluateFormula(formula.expression, (term) => (term.kind === 'constant' ? term.value : values.get(term) ?? 0));
  const constants = formula.linear ? formula.terms.filter((term): term is ConstantTerm => term.kind === 'constant') : [];
  const signedValue = (term: ConstantTerm): number => (term.negative ? -term.value : term.value);
  const modifiers = constants.reduce((sum, term) => sum + signedValue(term), 0);
  const named = constants.flatMap((term) => (term.label === undefined ? [] : [{ label: term.label, value: signedValue(term) }]));
  return { rolls, modifiers, named, total, linear: formula.linear };
}
