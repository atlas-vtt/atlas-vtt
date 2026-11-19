/**
 * The tray's clicks written into its formula field. A formula of plain dice and
 * a modifier is written anew (`2d6 + 1d20 − 3`); one the GM typed for itself
 * (`4d6kh3 + 2`) is changed only where a click changes it, and keeps the rest.
 */
import { MINUS, dieCountOf, modifierSuffix, readTray, writeTray, type TrayDie } from './diceTrayPool';

/** The formula as the parser reads it: the tray writes a true minus sign, the parser reads the hyphen. */
export function parseableFormula(text: string): string {
  return text.replaceAll(MINUS, '-').trim();
}

// The number added or taken away at the formula's end: its modifier. (A number alone is a plain tray, `readTray`.)
const TRAILING_MODIFIER = /\s*([+\-−])\s*(\d+)\s*$/;

/** The number at the formula's end (`2d6 + 3` gives 3, `4d6kh3 − 1` gives −1), else 0. */
export function modifierOf(text: string): number {
  const simple = readTray(text);
  if (simple) return simple.modifier;
  const trailing = TRAILING_MODIFIER.exec(text);
  if (!trailing) return 0;
  const [, sign, digits] = trailing;
  return (sign === '-' || sign === MINUS ? -1 : 1) * Number(digits);
}

/** The formula with `modifier` at its end in place of the one it had. */
export function withModifier(text: string, modifier: number): string {
  const simple = readTray(text);
  if (simple) return writeTray({ pool: simple.pool, modifier });
  const trailing = TRAILING_MODIFIER.exec(text);
  const rest = trailing ? text.slice(0, trailing.index) : text.trimEnd();
  return `${rest}${modifierSuffix(modifier)}`;
}

/** A term of `sides`-sided dice, with what is written after it (`4d6kh3`) and the operator before it. */
function dieTerm(sides: TrayDie): RegExp {
  const faces = sides === 100 ? '(?:100|%)' : String(sides);
  return new RegExp(`(\\s*[+\\-\\u2212]\\s*)?(?<![\\w%])(\\d*)d(${faces})(?![\\d%])([^\\s+\\-\\u2212*/()]*)`);
}

/**
 * The formula with `delta` more (or fewer) dice of `sides` faces. A formula of
 * its own changes the first term of that die (`4d6kh3` takes a fifth d6 as
 * `5d6kh3`) or gains the die before its modifier; a term taken down to none
 * goes with its operator.
 */
export function withDie(text: string, sides: TrayDie, delta: number): string {
  const simple = readTray(text);
  if (simple) {
    const count = Math.max(0, (simple.pool[sides] ?? 0) + delta);
    return writeTray({ pool: { ...simple.pool, [sides]: count }, modifier: simple.modifier });
  }
  const term = dieTerm(sides).exec(text);
  if (!term) {
    if (delta <= 0) return text;
    const trailing = TRAILING_MODIFIER.exec(text);
    const at = trailing ? trailing.index : text.trimEnd().length;
    return `${text.slice(0, at)} + ${delta}d${sides}${text.slice(at)}`;
  }
  const [whole, operator = '', count, faces, after] = term;
  const next = dieCountOf(count) + delta;
  const start = term.index;
  const end = start + whole.length;
  if (next > 0) return `${text.slice(0, start)}${operator}${next}d${faces}${after}${text.slice(end)}`;
  // At the start the operator after the term goes with it; elsewhere the one before.
  const rest = operator === '' ? text.slice(end).replace(/^\s*\+\s*/, '') : text.slice(end);
  return `${text.slice(0, start)}${rest}`.trim();
}

/** A saved roll as one term of the tray's formula: in brackets where it adds, subtracts, multiplies or divides itself. */
export function presetTerm(formula: string): string {
  const bare = formula.trim().replace(/\[[^\]]*\]/g, '');
  return /[+\-−*/\s]/.test(bare) ? `(${formula.trim()})` : formula.trim();
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where `term` stands in `text` as a whole term added (at the start, or after ` + `), last one first. */
function termPlaces(text: string, term: string): RegExpExecArray[] {
  const pattern = new RegExp(`(^|\\s*\\+\\s*)${escaped(term)}(?=\\s*[+\\-\\u2212]|\\s*$)`, 'g');
  return [...text.matchAll(pattern)].reverse();
}

/** How many times a saved roll stands in the tray's formula: the badge on its place in the row. */
export function presetCount(text: string, formula: string): number {
  return termPlaces(text, presetTerm(formula)).length;
}

/**
 * The formula with a saved roll added (before its modifier, as a die is) or, for `delta` −1, its last copy
 * taken out with the ` + ` before it.
 */
export function withPreset(text: string, formula: string, delta: 1 | -1): string {
  const term = presetTerm(formula);
  if (delta < 0) {
    const last = termPlaces(text, term)[0];
    if (!last) return text;
    const rest = `${text.slice(0, last.index)}${text.slice(last.index + last[0].length)}`;
    return (last.index === 0 ? rest.replace(/^\s*\+\s*/, '') : rest).trim();
  }
  if (text.trim() === '') return term;
  const trailing = TRAILING_MODIFIER.exec(text);
  const at = trailing ? trailing.index : text.trimEnd().length;
  return `${text.slice(0, at)} + ${term}${text.slice(at)}`;
}
