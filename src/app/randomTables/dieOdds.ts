/**
 * Rolling a table's die and knowing its odds. The die goes through Atlas' own
 * dice (`parseFormula`, `rollFormula`) without a collection's explode rules; a
 * d66 is two d6 read as tens and ones. Pure.
 */

import { rollFormula } from '../tools/diceFormula';
import { parseFormula } from '../tools/parseFormula';
import type { TableDie } from './tableModel';

function rollDice(count: number, faces: number, random: () => number): number {
  const parsed = parseFormula(`${count}d${faces}`);
  if (!parsed.ok) throw new Error(`Cannot roll ${count}d${faces}`);
  return rollFormula(parsed, random).total;
}

/** One roll of the die. */
export function rollDie(die: TableDie, random: () => number): number {
  if (die.d66) return rollDice(1, 6, random) * 10 + rollDice(1, 6, random);
  return rollDice(die.count, die.faces, random);
}

/** Every number the die rolls with its chance, from the lowest. */
export function dieOdds(die: TableDie): Map<number, number> {
  if (die.d66) {
    const odds = new Map<number, number>();
    for (let tens = 1; tens <= 6; tens++) {
      for (let ones = 1; ones <= 6; ones++) odds.set(tens * 10 + ones, 1 / 36);
    }
    return odds;
  }
  // The sums of one die more are a sliding window over the sums so far.
  let sums = new Array<number>(die.faces + 1).fill(1 / die.faces);
  sums[0] = 0;
  for (let dice = 2; dice <= die.count; dice++) {
    const next = new Array<number>(sums.length + die.faces).fill(0);
    let window = 0;
    for (let total = 1; total < next.length; total++) {
      window += sums[total - 1] ?? 0;
      if (total - 1 - die.faces >= 0) window -= sums[total - 1 - die.faces] ?? 0;
      next[total] = window / die.faces;
    }
    sums = next;
  }
  const odds = new Map<number, number>();
  sums.forEach((chance, total) => {
    if (total >= die.count && chance > 0) odds.set(total, chance);
  });
  return odds;
}

/** A number drawn from `odds`, or null when they hold no chance at all. */
export function drawFromOdds(odds: ReadonlyMap<number, number>, random: () => number): number | null {
  let sum = 0;
  for (const chance of odds.values()) sum += chance;
  if (sum <= 0) return null;
  let pick = random() * sum;
  let last: number | null = null;
  for (const [value, chance] of odds) {
    if (chance <= 0) continue;
    last = value;
    pick -= chance;
    if (pick < 0) return value;
  }
  return last;
}
