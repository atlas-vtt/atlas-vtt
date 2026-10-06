/**
 * Parses and rolls dice formulas such as `2d6+3`, `d20+2d6` or `2d6-1d4`.
 * Every term carries its own sign, so the `+2` of `+2d6` is a dice count and
 * never a modifier, and subtracted dice subtract.
 *
 * A dice term may explode (`diceExplosion.ts`): by its own notation, written
 * as Obsidian's Dice Roller writes it since statblocks use that (`2d6!` once,
 * `2d6!3` up to three times, `2d6!i` again and again; `!!` reads the same), or
 * by the collection's rule.
 */

import { parseDefaultRoll } from '../gameSystems/diceRules';
import type { DiceRules, ExplodeRule } from '../types/diceRulesTypes';
import { MAX_EXPLOSIONS, rollExplosions, rollFace, type Explosion } from './diceExplosion';
import type { ParsedFormula } from './parseFormula';

export interface RolledDie {
  /** e.g. `d20`. */
  die: string;
  value: number;
  max: number;
  /** The die subtracts: it belongs to a subtracted term, e.g. the d4 of `2d6-1d4`, or to an explosion downwards. */
  negative?: true;
  /** The die was rolled because the die before it exploded. */
  exploded?: true;
}

export interface RolledFormula {
  rolls: RolledDie[];
  modifiers: number;
  total: number;
}

/** How the collection's rule explodes a die it applies to. */
function ruledExplosion({ repeats, highFaces, lowFaces }: ExplodeRule): Explosion {
  return { highFaces, lowFaces, limit: repeats ? MAX_EXPLOSIONS : 1 };
}

/**
 * Rolls an already validated formula and adds up the result. `rules` are the
 * collection's: its exploding rule
 * and the default roll that says which dice a default-dice rule means, the
 * first added dice of its size, as many as it rolls (as for criticals).
 */
export function rollFormula(
  formula: ParsedFormula,
  random: () => number = Math.random,
  rules?: Pick<DiceRules, 'defaultRoll' | 'explode'>,
): RolledFormula {
  const rolls: RolledDie[] = [];
  let modifiers = 0;
  const explode = rules?.explode;
  const defaultRoll = explode?.dice === 'default' ? parseDefaultRoll(rules?.defaultRoll ?? '') : null;
  let defaultDiceLeft = defaultRoll?.count ?? 0;

  for (const term of formula.terms) {
    if (term.kind === 'constant') {
      modifiers += term.value;
      continue;
    }
    const { faces, negative } = term;
    const noted = term.explosions === undefined ? null : { highFaces: 1, lowFaces: 0, limit: term.explosions };
    for (let i = 0; i < term.count; i++) {
      const die: RolledDie = {
        die: `d${faces}`,
        value: rollFace(faces, random),
        max: faces,
        ...(negative && { negative: true as const }),
      };
      rolls.push(die);

      const isDefaultDie = !negative && faces === defaultRoll?.sides && defaultDiceLeft > 0;
      if (isDefaultDie) defaultDiceLeft -= 1;
      const ruled = explode && (explode.dice === 'all' || isDefaultDie) ? ruledExplosion(explode) : null;
      const explosion = noted ?? ruled;
      if (explosion) rolls.push(...rollExplosions(die, explosion, random));
    }
  }

  const dice = rolls.reduce((sum, die) => sum + (die.negative ? -die.value : die.value), 0);
  return { rolls, modifiers, total: dice + modifiers };
}
