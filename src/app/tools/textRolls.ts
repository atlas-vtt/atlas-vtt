/**
 * Where a text holds rolls, and the formula each rolls: the one rule every surface that shows
 * statblock values and texts with roll links reads (the card, the DM screen, the note panel, and the
 * online player page, which keeps a copy of this file). Pure.
 *
 * A formula is a roll where the dice parser accepts it (`parseFormula`, within its limits) and it
 * throws dice (`2d8+2`, `d20`, `3d6kh2+1`) or opens with a sign (`+2`, `+4+1`, `-1+2`): a bonus,
 * which the dice tool adds to the game's dice. A number alone (`3`) or a sum without a sign (`4+1`)
 * is no roll.
 *
 * In running text a roll opens on a die (`2d8`, `D12`, `d%`), on a sign standing directly on its
 * first die or number (`+4`, `−1`, `+2d6`), or on an attack label before such a sign (`ATK: +4`),
 * and goes on over further dice and numbers joined by `+ - − – * / ×` (and the SRD's `+ -`), with
 * spaces or tabs around them if any. A die or number never starts or ends inside a word or a
 * number ("x2d6", "hd6", "5d", "+5ft", "+1.5"), so numbers in sentences ("3 goblins", "Recharge
 * 5-6", "CR 1/4", "1 + 1") roll nothing, and a dash with a space after it is punctuation ("Very
 * Close - 1d12+2" rolls 1d12+2). Brackets are punctuation too ("(2d6 + 3)" rolls 2d6 + 3), and a
 * single `!` after dice ends a sentence rather than exploding them. What the parser refuses
 * (`101d6`, `1d0`) rolls nothing. Where that leaves a number outside every roll, the whole text is
 * read as one formula instead, so a value such as `2 + 1d6` or `(1d8+2)*2` rolls whole.
 *
 * A roll joined to a `@` reference by operators, brackets and spaces alone (`2d6 + @int`,
 * `@level d6`) is part of one that cannot be made: text is read once its references that name a
 * number are filled in, so one left names none, and the roll beside it rolls nothing. An `@` inside
 * a word (an address) is none.
 */
import { parseFormula } from './parseFormula';

/** A piece of a text: words, or a roll written in it with the formula a click on it rolls. */
export interface RollPiece {
  readonly text: string;
  /** What the piece rolls; null for plain words. */
  readonly formula: string | null;
}

/** Nothing of a word or a number stands right before a roll, nor right after any of its terms. */
const OPENS = String.raw`(?<![\p{L}\p{N}_])`;
const ENDS = String.raw`(?![\p{L}\p{N}_])`;

/** Dice with their modifiers, in the order the parser reads them: reroll, explode (not a single bare `!`), keep or drop, count. */
const DIE = [
  String.raw`\d*d(?:\d+|%|f)`,
  String.raw`(?:r[or]?(?:(?:<=|>=|<|>)?\d+)?)?`,
  String.raw`(?:!!(?:\d+|i)?|!(?:\d+|i)|xo?(?:>=?\d+)?)?`,
  String.raw`(?:[kd][hl]?\d*)?`,
  String.raw`(?:(?:c[sf](?:>=|<=|[<>=])|>=|<=)\d+)?`,
].join('');
const LABEL = String.raw`(?:\[[\p{L}\p{N} '\-]{1,24}\])?`;
const DIE_TERM = `${DIE}${LABEL}${ENDS}`;
const TERM = String.raw`(?:${DIE}|\d+(?!\.\d))${LABEL}${ENDS}`;
const SIGN = '[+\\-−]';
const OPERATOR = String.raw`[ \t]*(?:\+[ \t]*-|[+\-−–*/×])[ \t]*`;

const ROLLS = new RegExp(
  String.raw`${OPENS}(?:(?:ATK|Attack)[ \t]*:[ \t]*${SIGN}${TERM}|${SIGN}${TERM}|${DIE_TERM})(?:${OPERATOR}${TERM})*`,
  'giu',
);

const REFERENCE_AFTER = /^[\s()+\-−–*/×]*(?<![\w.])@[A-Za-z_]/;
const REFERENCE_BEFORE = /(?<![\w.])@[A-Za-z_][\w.-]*[\s()+\-−–*/×]*$/;

/** A roll as written, spelled as the parser reads it: no label, a plain minus and times, `+ -` as `-`. */
function spelled(written: string): string {
  return written
    .trim()
    .replace(/^(?:ATK|Attack)[ \t]*:[ \t]*/i, '')
    .replace(/[−–]/g, '-')
    .replace(/×/g, '*')
    .replace(/\+[ \t]*-/g, '-');
}

/** A roll as written, as the formula the dice tool rolls: no spaces (but in a label), no label before it; a bare bonus stays bare. */
export function toRollFormula(written: string): string {
  return spelled(written).replace(/\s+(?![^[]*\])/g, '');
}

/** Whether a formula is a roll: the parser accepts it, and it throws dice or opens with a sign. */
export function isRollFormula(formula: string): boolean {
  const parsed = parseFormula(formula);
  return parsed.ok && (/^[+-]/.test(formula) || parsed.terms.some((term) => term.kind === 'dice' && term.count > 0));
}

/** The formula a text written as one roll rolls, or null where it is no roll. */
export function writtenRoll(written: string): string | null {
  return isRollFormula(spelled(written)) ? toRollFormula(written) : null;
}

/** The text in pieces as running text reads it, before a stray number sends it to be read whole. */
function scanned(text: string): RollPiece[] {
  const pieces: RollPiece[] = [];
  const words = (part: string): void => {
    const last = pieces[pieces.length - 1];
    if (last && last.formula === null) pieces[pieces.length - 1] = { text: last.text + part, formula: null };
    else pieces.push({ text: part, formula: null });
  };
  let at = 0;
  for (const found of text.matchAll(ROLLS)) {
    if (found.index > at) words(text.slice(at, found.index));
    const end = found.index + found[0].length;
    const joined = REFERENCE_AFTER.test(text.slice(end)) || REFERENCE_BEFORE.test(text.slice(0, found.index));
    const formula = joined ? null : writtenRoll(found[0]);
    if (formula === null) words(found[0]);
    else pieces.push({ text: found[0], formula });
    at = end;
  }
  if (at < text.length) words(text.slice(at));
  return pieces;
}

/** The whole text as one roll, its spaces around it as words; null where it is no roll. */
function wholeRoll(text: string): RollPiece[] | null {
  const written = text.trim();
  const formula = written === '' ? null : writtenRoll(written);
  if (formula === null) return null;
  const at = text.indexOf(written);
  const pieces: RollPiece[] = [
    { text: text.slice(0, at), formula: null },
    { text: written, formula },
    { text: text.slice(at + written.length), formula: null },
  ];
  return pieces.filter((piece) => piece.text !== '');
}

/** A text in pieces: its words, and every roll written in it on its own. */
export function rollPieces(text: string): RollPiece[] {
  const pieces = scanned(text);
  const strayNumber = pieces.some((piece) => piece.formula === null && /\d/.test(piece.text));
  return strayNumber ? wholeRoll(text) ?? pieces : pieces;
}
