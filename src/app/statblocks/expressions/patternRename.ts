/**
 * Renaming a field key inside patterns and formulas (§8.8): every reference
 * to the key, with or without an index (`hp`, `stats.1`), names the new key;
 * the rest of the text stays exactly as written, escapes and spacing included.
 */

import type { FieldKey } from '../model/templateTypes';
import { splitRef } from '../values/fieldValues';
import { isExpressionError } from './errors';
import { SLOT_WORD, type FormulaToken } from './formulaTypes';
import { escapePatternText, parsePatternCached } from './patternParse';
import type { PatternNode } from './patternTypes';
import { tokenizeFormula } from './tokenize';

/** A formula reads a key only when it is a name: letters, digits and underscores, starting with a letter or `_`. */
const FORMULA_NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;
/** A backslash before a character patterns escape, as `patternParse` reads it. */
const ESCAPED = /\\([{}[\]\\,|])/g;

/** Whether a formula can name `key`; a hyphen in a formula is always a minus. */
export function formulaCanName(key: FieldKey): boolean {
  return FORMULA_NAME.test(key);
}

/** Whether a reference (`hp`, `stats.1`) reads `key`. */
export function refReads(ref: string, key: FieldKey): boolean {
  return splitRef(ref).key === key;
}

/** `ref` with its key renamed, or null when it reads another key. */
export function renamedRef(ref: string, from: FieldKey, to: FieldKey): string | null {
  const { key, index } = splitRef(ref);
  if (key !== from) return null;
  return index === null ? to : `${to}.${index}`;
}

type NameToken = Extract<FormulaToken, { type: 'name' }>;

/** The name tokens of a formula that are field references: not a function's name, not the slot word. */
function refTokens(source: string): NameToken[] | null {
  const tokens = tokenizeFormula(source);
  if (isExpressionError(tokens)) return null;
  return tokens.filter((token, index): token is NameToken =>
    token.type === 'name' && token.name !== SLOT_WORD && tokens[index + 1]?.type !== 'open');
}

/** The keys a formula reads, each once; text that does not read as a formula reads none. */
export function formulaRefs(source: string): FieldKey[] {
  return [...new Set((refTokens(source) ?? []).map((token) => splitRef(token.name).key))];
}

/** Whether a formula reads `key`. */
export function formulaReads(source: string, key: FieldKey): boolean {
  return formulaRefs(source).includes(key);
}

/** The formulas of a pattern's `{= … }` values, as written; none when the pattern does not parse. */
export function patternFormulas(pattern: string): string[] {
  const ast = parsePatternCached(pattern);
  if (isExpressionError(ast)) return [];
  const sources: string[] = [];
  const visit = (nodes: readonly PatternNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'formula') sources.push(node.source);
      else if (node.kind === 'optional') visit(node.nodes);
    }
  };
  visit(ast.nodes);
  return sources;
}

/** The formula with every reference to `from` naming `to`; text that does not read as a formula stays as it is. */
export function renameFormulaRefs(source: string, from: FieldKey, to: FieldKey): string {
  let result = '';
  let copied = 0;
  for (const token of refTokens(source) ?? []) {
    const renamed = renamedRef(token.name, from, to);
    if (renamed === null) continue;
    result += source.slice(copied, token.at) + renamed;
    copied = token.at + token.name.length;
  }
  return copied === 0 ? source : result + source.slice(copied);
}

/** Walks pattern text as `patternParse` reads it, rewriting the references of each value. */
class PatternRenamer {
  private index = 0;
  private output = '';

  constructor(private readonly source: string, private readonly from: FieldKey, private readonly to: FieldKey) {}

  run(): string {
    while (this.index < this.source.length) {
      const char = this.char();
      if (char === '\\') this.copyEscape();
      else if (char === '{') this.value();
      else this.copy(1);
    }
    return this.output;
  }

  private char(): string {
    return this.source.charAt(this.index);
  }

  private copy(length: number): void {
    this.output += this.source.slice(this.index, this.index + length);
    this.index += length;
  }

  private copyEscape(): void {
    this.copy(this.source.charAt(this.index + 1) === '' ? 1 : 2);
  }

  private value(): void {
    this.copy(1);
    if (this.char() === '=') {
      this.copy(1);
      const start = this.index;
      while (this.char() !== '' && this.char() !== '|' && this.char() !== '}') this.index += 1;
      this.output += renameFormulaRefs(this.source.slice(start, this.index), this.from, this.to);
    } else {
      this.refs();
    }
    // Filters name tables and text, never fields: copied up to the value's end.
    while (this.char() !== '' && this.char() !== '}') {
      if (this.char() === '\\') this.copyEscape();
      else this.copy(1);
    }
    this.copy(1);
  }

  private refs(): void {
    let raw = '';
    for (let char = this.char(); char !== '' && char !== '|' && char !== '}'; char = this.char()) {
      if (char === ',') {
        this.output += `${this.renamed(raw)},`;
        raw = '';
        this.index += 1;
        continue;
      }
      raw += char === '\\' ? this.source.slice(this.index, this.index + 2) : char;
      this.index += char === '\\' ? 2 : 1;
    }
    this.output += this.renamed(raw);
  }

  /** A reference as written, renamed where it reads the key; spacing around it is kept. */
  private renamed(raw: string): string {
    const text = raw.replace(ESCAPED, '$1');
    const ref = text.trim();
    const renamed = renamedRef(ref, this.from, this.to);
    if (renamed === null) return raw;
    const leading = /^\s*/.exec(raw)?.[0] ?? '';
    const trailing = /\s*$/.exec(raw)?.[0] ?? '';
    return `${leading}${escapePatternText(renamed)}${trailing}`;
  }
}

/**
 * The pattern with every reference to `from` naming `to`, in values and in
 * formulas. A pattern that does not parse names no field and stays as it is.
 */
export function renamePatternRefs(pattern: string, from: FieldKey, to: FieldKey): string {
  if (from === to || isExpressionError(parsePatternCached(pattern))) return pattern;
  return new PatternRenamer(pattern, from, to).run();
}
