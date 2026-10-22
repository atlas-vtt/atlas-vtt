/**
 * The rolls a statblock's text makes once its `@` references are filled in, each with the formula
 * that names its references (`2d8 + @agility` rolls `2d8-1[Agility]`), so the roll shows the number
 * as "Agility −1" rather than in its plain modifier. Only the formula rolled names them: the text
 * shown keeps its plain numbers (`2d8 - 1`).
 *
 * A reference is named where its number is a term of a sum: after a sign, or opening the roll, in a
 * formula that is a plain sum (`ParsedFormula.linear`). A dice count (`@level d6`) and a factor
 * (`2 * @str`) stay plain numbers, as do a number written with a label of its own (`@str[Might]`)
 * and every number of a formula that multiplies, divides or counts. A named formula the parser
 * refuses (one a label takes past the length limit) is none. The online player page keeps a copy of
 * this rule (`book/rolls/referenceRolls.ts`). Pure.
 */

import { parseFormula } from '../../tools/parseFormula';
import { rollPieces, toRollFormula } from '../../tools/textRolls';
import { formulaLabel } from '../rollBonuses/bonusFormula';
import { fillReferences, stringsIn, type Filled } from './fillReferences';
import { namesReference, type FieldLookup } from './references';

/** A roll of a text with references. */
export interface ReferenceRoll {
  /** What the filled text rolls, as the card's link on it rolls it (`toRollFormula`). */
  readonly formula: string;
  /** The same roll with its references' numbers named; null where it names none. */
  readonly named: string | null;
}

/** A reference's path as a roll names it: separators read as spaces, the first letter a capital (`str.mod` → `Str mod`). */
export function referenceLabel(path: string): string {
  const label = formulaLabel(path.replace(/[._-]+/g, ' '));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The roll of the filled text between `from` and `to` with each reference added in it named, but one labelled already; null where none is, or the parser refuses it. */
function namedRoll(filled: Filled, from: number, to: number): string | null {
  let piece = filled.text.slice(from, to);
  let named = false;
  for (const reference of [...filled.filled].reverse()) {
    const label = referenceLabel(reference.path);
    if (!reference.added || label === '' || reference.at < from || reference.end > to || filled.text[reference.end] === '[') continue;
    const at = reference.end - from;
    piece = `${piece.slice(0, at)}[${label}]${piece.slice(at)}`;
    named = true;
  }
  if (!named) return null;
  const formula = toRollFormula(piece);
  const parsed = parseFormula(formula);
  return parsed.ok && parsed.linear ? formula : null;
}

/** Every roll of `text` once its references are filled in by `lookup`, in order (`rollPieces`), each with its references named where they may be. */
export function referenceRolls(text: string, lookup: FieldLookup): ReferenceRoll[] {
  const filled = fillReferences(text, lookup);
  const rolls: ReferenceRoll[] = [];
  let at = 0;
  for (const piece of rollPieces(filled.text)) {
    const end = at + piece.text.length;
    if (piece.formula !== null) rolls.push({ formula: piece.formula, named: filled.filled.length === 0 ? null : namedRoll(filled, at, end) });
    at = end;
  }
  return rolls;
}

/**
 * For the rolls of a statblock's values (strings at any depth) that name a reference, what the
 * card's link on the filled text rolls to the formula that names it. A formula another value rolls
 * without a name, or with another, is left out: a link cannot tell which value it stands in. Empty
 * where no value names a reference.
 */
export function namedReferenceRolls(values: readonly unknown[], lookup: FieldLookup): ReadonlyMap<string, string> {
  const texts = values.flatMap(stringsIn);
  if (!texts.some(namesReference)) return new Map();
  const names = new Map<string, string | null>();
  for (const text of texts) {
    for (const { formula, named } of referenceRolls(text, lookup)) {
      const before = names.get(formula);
      names.set(formula, before === undefined || before === named ? named : null);
    }
  }
  return new Map([...names].flatMap(([formula, named]): [string, string][] => (named === null ? [] : [[formula, named]])));
}
