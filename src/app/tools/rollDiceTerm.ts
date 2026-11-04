/**
 * Rolls one dice term with its modifiers, in the order they are written:
 * each die is rolled again while it meets the reroll, then explodes, then the
 * term keeps or drops some of its dice, then counts them or adds them up.
 * Keep, drop and count look at every die that stands, explosions included,
 * as Foundry VTT does.
 */

import { meets } from './diceComparison';
import { rollExplosions, rollFace, type Explosion } from './diceExplosion';
import type { DieLook, RolledDie } from './diceFormula';
import type { DiceKeep, DiceTerm } from './formulaTypes';

/** The term's dice in the order they were rolled, and what the term comes to before its sign. */
export interface RolledTerm {
  dice: RolledDie[];
  value: number;
}

/** The face a die of the term shows. */
function faceOf(term: DiceTerm, random: () => number): number {
  return term.fate ? rollFace(3, random) - 2 : rollFace(term.faces, random);
}

/** The die's part in its term: a die that subtracts within it (an explosion downwards) counts against it. */
function share(die: RolledDie, term: DiceTerm, amount: number): number {
  return (die.negative === true) !== term.negative ? -amount : amount;
}

const counts = (die: RolledDie): boolean => !die.rerolled && !die.dropped;

/** What keep or drop ranks: each standing die, or with `chains` each die with the dice its explosion rolled. */
function keepUnits(dice: readonly RolledDie[], keep: DiceKeep, term: DiceTerm): { indices: number[]; value: number }[] {
  const units: { indices: number[]; value: number }[] = [];
  dice.forEach((die, index) => {
    if (die.rerolled) return;
    const last = units.at(-1);
    const value = share(die, term, die.value);
    if (keep.chains && die.exploded && last) {
      last.indices.push(index);
      last.value += value;
    } else {
      units.push({ indices: [index], value });
    }
  });
  return units;
}

/** Marks the dice the term's keep or drop leaves out. Of equal dice the earlier one is kept. */
function applyKeep(dice: RolledDie[], keep: DiceKeep, term: DiceTerm): void {
  const units = keepUnits(dice, keep, term);
  const ranked = [...units].sort((a, b) => (keep.end === 'lowest' ? a.value - b.value : b.value - a.value));
  const chosen = new Set(ranked.slice(0, keep.count));
  for (const unit of units) {
    if (chosen.has(unit) === (keep.mode === 'keep')) continue;
    for (const index of unit.indices) dice[index] = { ...dice[index]!, dropped: true };
  }
}

/**
 * A d100 that rolls only its tens and takes the units of `first`, as Call of
 * Cthulhu's bonus and penalty die do: tens 00 with units 0 is 100.
 */
function sharedUnitsDie(first: RolledDie, random: () => number): RolledDie {
  const units = first.value % 10;
  const tens = (rollFace(10, random) - 1) * 10;
  return { ...first, value: tens + units || 100, sharedUnits: true };
}

/**
 * Rolls `term`. `ruled` says how the collection's rule explodes the term's
 * next die, or null. It is asked once for every numbered die, since it counts
 * the default dice, and the term's own explosion wins over its answer. `look`
 * is the name and colour a dice set gives the term's dice, explosions included.
 */
export function rollDiceTerm(
  term: DiceTerm, random: () => number, ruled: (term: DiceTerm) => Explosion | null, look?: DieLook,
): RolledTerm {
  const dice: RolledDie[] = [];
  const base: RolledDie = {
    die: term.fate ? 'dF' : `d${term.faces}`,
    value: 0,
    max: term.faces,
    ...(term.fate && { min: -1 }),
    ...(term.negative && { negative: true as const }),
    ...(term.advantage && { advantage: true as const }),
    ...(term.label !== undefined && { label: term.label }),
    ...(look?.name && { name: look.name }),
    ...(look?.colour && { colour: look.colour }),
  };

  for (let i = 0; i < term.count; i++) {
    const first = dice.find((die) => !die.rerolled && !die.exploded);
    if (term.sharedUnits && term.faces === 100 && first && i === term.count - 1) {
      dice.push(sharedUnitsDie(first, random));
      continue;
    }
    let value = faceOf(term, random);
    for (let n = 0; term.reroll && n < term.reroll.limit && meets(value, term.reroll.when); n++) {
      dice.push({ ...base, value, rerolled: true });
      value = faceOf(term, random);
    }
    const die: RolledDie = { ...base, value };
    dice.push(die);
    const rule = term.fate ? null : ruled(term);
    const explosion = term.explode ?? rule;
    if (explosion) {
      dice.push(...rollExplosions(die, explosion, random).map((extra) => ({
        ...extra,
        ...(term.label !== undefined && { label: term.label }),
        ...(look?.name && { name: look.name }),
        ...(look?.colour && { colour: look.colour }),
      })));
    }
  }

  if (term.keep) applyKeep(dice, term.keep, term);

  const { tally } = term;
  if (!tally) {
    return { dice, value: dice.reduce((sum, die) => sum + (counts(die) ? share(die, term, die.value) : 0), 0) };
  }
  let value = 0;
  dice.forEach((die, index) => {
    if (!counts(die) || !meets(die.value, tally.when)) return;
    dice[index] = { ...die, ...(tally.counts === 'successes' ? { success: true as const } : { failure: true as const }) };
    value += share(die, term, 1);
  });
  return { dice, value };
}
