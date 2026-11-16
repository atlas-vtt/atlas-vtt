/**
 * How many of one creature an encounter brings: a number, or dice rolled anew each time the
 * encounter is spawned ("2d4 goblins"), as rulebooks give a number appearing.
 */
import { parseFormula, type FormulaTerm, type ParsedFormula } from '../tools/parseFormula';
import { rollFormula } from '../tools/diceFormula';

/** The most copies of one creature an encounter takes; a typo of 1000 goblins stops here. */
export const MAX_COPIES = 99;

/** A number of copies, or a dice formula (`"2d4"`, `"1d6+2"`) that rolls one. */
export type Quantity = number | string;

export interface QuantityRange {
  min: number;
  max: number;
}

function isPlainTerm(term: FormulaTerm): boolean {
  return term.kind === 'constant'
    || (!term.fate && !term.reroll && !term.explode && !term.keep && !term.tally);
}

/** The fewest and most a plain sum of dice and numbers comes to, never below 0. */
function rangeOf(formula: ParsedFormula): QuantityRange {
  let min = 0;
  let max = 0;
  for (const term of formula.terms) {
    const low = term.kind === 'dice' ? term.count : term.value;
    const high = term.kind === 'dice' ? term.count * term.faces : term.value;
    min += term.negative ? -high : low;
    max += term.negative ? -low : high;
  }
  return { min: Math.max(0, min), max };
}

/**
 * A dice quantity as it rolls: a sum of plain dice and numbers (no rerolls, explosions, keeps or
 * counted dice, which say nothing about how many creatures come), holding a die, that can bring at
 * least one creature and never more than `MAX_COPIES`. Null for anything else.
 */
export function readDiceQuantity(text: string): ParsedFormula | null {
  const parsed = parseFormula(text.trim());
  if (!parsed.ok || !parsed.linear || !parsed.terms.some((term) => term.kind === 'dice')) return null;
  if (!parsed.terms.every(isPlainTerm)) return null;
  const { max } = rangeOf(parsed);
  return max >= 1 && max <= MAX_COPIES ? parsed : null;
}

/** What the GM typed as a quantity: a whole number (clamped to 0..MAX_COPIES) or valid dice; null otherwise. */
export function parseQuantity(text: string): Quantity | null {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(MAX_COPIES, Number(trimmed));
  return readDiceQuantity(trimmed) ? trimmed : null;
}

/** The fewest and most copies a quantity brings. A dice quantity that cannot be read brings one. */
export function quantityRange(quantity: Quantity): QuantityRange {
  if (typeof quantity === 'number') return { min: quantity, max: quantity };
  const parsed = readDiceQuantity(quantity);
  return parsed ? rangeOf(parsed) : { min: 1, max: 1 };
}

/** How many copies a quantity brings this time: dice are rolled, a number is itself. */
export function rollQuantity(quantity: Quantity, random: () => number = Math.random): number {
  if (typeof quantity === 'number') return quantity;
  const parsed = readDiceQuantity(quantity);
  if (!parsed) return 1;
  return Math.max(0, Math.min(MAX_COPIES, rollFormula(parsed, random).total));
}

// The dice of the first dice term, outside labels (whose text may hold a "d6" of its own).
const FIRST_DICE = /(\d*)d(?=\d|%)/i;

/**
 * One more or one fewer: a number steps by one; dice step their first term's dice (2d4 → 3d4), and a
 * term stepped to no dice leaves 0, which takes the creature out. Unchanged where the step would
 * pass `MAX_COPIES`.
 */
export function stepQuantity(quantity: Quantity, delta: 1 | -1): Quantity {
  if (typeof quantity === 'number') return Math.max(0, Math.min(MAX_COPIES, quantity + delta));
  const unlabelled = quantity.replace(/\[[^\]]*\]/g, (label) => ' '.repeat(label.length));
  const match = FIRST_DICE.exec(unlabelled);
  if (!match) return quantity;
  const dice = Number(match[1] || '1') + delta;
  if (dice <= 0) return 0;
  const stepped = `${quantity.slice(0, match.index)}${dice}${quantity.slice(match.index + match[1]!.length)}`;
  return readDiceQuantity(stepped) ? stepped : quantity;
}

/**
 * What a stored token reference stands for: its dice where they read as a quantity, else one copy.
 * The field comes from a file, so anything that is not such dice (a hand-edited number) is one.
 */
export function refQuantity(ref: { readonly quantity?: unknown }): Quantity {
  return typeof ref.quantity === 'string' && readDiceQuantity(ref.quantity) ? ref.quantity : 1;
}

/** The fewest and most copies several quantities bring together. */
export function totalRange(quantities: readonly Quantity[]): QuantityRange {
  return quantities.reduce((sum: QuantityRange, quantity) => {
    const range = quantityRange(quantity);
    return { min: sum.min + range.min, max: sum.max + range.max };
  }, { min: 0, max: 0 });
}

/** The fewest and most tokens a list of references brings. */
export function refsRange(refs: readonly { readonly quantity?: unknown }[]): QuantityRange {
  return totalRange(refs.map(refQuantity));
}

/** The references of one spawn: each as many times as its quantity rolls this time, in their order. */
export function rolledRefs<T extends { readonly quantity?: unknown }>(refs: readonly T[], random: () => number = Math.random): T[] {
  return refs.flatMap((ref) => Array.from({ length: rollQuantity(refQuantity(ref), random) }, () => ref));
}
