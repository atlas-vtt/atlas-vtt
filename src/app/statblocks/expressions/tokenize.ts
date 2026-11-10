import { quoted } from '../values/valueText';
import { syntaxError, type ExpressionError } from './errors';
import type { BinaryOperator, FormulaToken } from './formulaTypes';

/** "14", "2.5", ".5", "3." */
const NUMBER = /\d+(?:\.\d*)?|\.\d+/y;
/**
 * A field reference: a key of letters, digits and underscores, optionally with
 * one index (`stats.1`, `saves.dex`). Keys with spaces or hyphens cannot be
 * named in a formula; a hyphen is always a minus.
 */
const NAME = /[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}\p{N}_]+)?/uy;
const SPACE = /\s/;

/** Operators, including the typographic ones text pasted from a rulebook brings. */
const OPERATORS: Readonly<Record<string, BinaryOperator>> = {
  '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '/': '/', '÷': '/',
};
const PUNCTUATION: Readonly<Record<string, 'open' | 'close' | 'comma'>> = { '(': 'open', ')': 'close', ',': 'comma' };

function matchAt(pattern: RegExp, source: string, at: number): string | null {
  pattern.lastIndex = at;
  return pattern.exec(source)?.[0] ?? null;
}

/**
 * The formula's tokens, ending with an `end` token. `offset` is where the
 * formula starts in the text it came from, so positions point into that text.
 */
export function tokenizeFormula(source: string, offset = 0): FormulaToken[] | ExpressionError {
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const at = offset + index;
    if (SPACE.test(char)) {
      index += 1;
      continue;
    }
    const number = matchAt(NUMBER, source, index);
    if (number !== null) {
      tokens.push({ type: 'number', value: Number(number), at, text: number });
      index += number.length;
      continue;
    }
    const name = matchAt(NAME, source, index);
    if (name !== null) {
      tokens.push({ type: 'name', name, at });
      index += name.length;
      continue;
    }
    const op = OPERATORS[char];
    const punctuation = PUNCTUATION[char];
    if (op !== undefined) tokens.push({ type: 'op', op, at });
    else if (punctuation !== undefined) tokens.push({ type: punctuation, at });
    else return syntaxError(`${quoted(char)} can't be used in a formula.`, at);
    index += 1;
  }
  tokens.push({ type: 'end', at: offset + source.length });
  return tokens;
}
