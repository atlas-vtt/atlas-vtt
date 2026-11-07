/**
 * Reads pattern text into a `PatternAst` (grammar in `patternTypes.ts`).
 * Parse a pattern once and render it for every statblock.
 */

import type { FieldKey } from '../model/templateTypes';
import { quoted } from '../values/valueText';
import { isExpressionError, syntaxError, type ExpressionError } from './errors';
import { parseFilter } from './filters';
import { parseFormula } from './parse';
import type { PatternAst, PatternFilter, PatternNode } from './patternTypes';
import { t } from '../../i18n';

const ESCAPABLE: ReadonlySet<string> = new Set(['{', '}', '[', ']', '\\', ',', '|']);
const ESCAPABLE_CHARACTERS = /[{}[\]\\,|]/g;
const MAX_OPTIONAL_DEPTH = 32;
const MAX_LENGTH = 10_000;
const CACHE_SIZE = 512;

/** Carries a syntax error out of the recursion; never leaves this module. */
class PatternFailure extends Error {
  constructor(readonly error: ExpressionError) {
    super(error.message);
  }
}

function fail(message: string, at: number): never {
  throw new PatternFailure(syntaxError(message, at));
}

class PatternParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): PatternAst {
    return { kind: 'pattern', nodes: this.sequence(null, 0) };
  }

  private char(): string {
    return this.source.charAt(this.index);
  }

  /** At a backslash: the character it escapes, or the backslash itself before any other. */
  private escaped(): string {
    const next = this.source.charAt(this.index + 1);
    const escapes = ESCAPABLE.has(next);
    this.index += escapes ? 2 : 1;
    return escapes ? next : '\\';
  }

  private sequence(openAt: number | null, depth: number): PatternNode[] {
    const nodes: PatternNode[] = [];
    let text = '';
    const flush = (): void => {
      if (text !== '') nodes.push({ kind: 'text', text });
      text = '';
    };
    for (let char = this.char(); char !== ''; char = this.char()) {
      if (char === '\\') {
        text += this.escaped();
      } else if (char === '{') {
        flush();
        nodes.push(this.value());
      } else if (char === '[') {
        flush();
        if (depth >= MAX_OPTIONAL_DEPTH) fail(t('statblockEditor.expr.optionalDeep'), this.index);
        const at = this.index;
        this.index += 1;
        nodes.push({ kind: 'optional', nodes: this.sequence(at, depth + 1) });
      } else if (char === ']') {
        if (openAt === null) fail(`There is a ${quoted(']')} without a ${quoted('[')}. Write \\] for the character itself.`, this.index);
        this.index += 1;
        flush();
        return nodes;
      } else if (char === '}') {
        fail(`There is a ${quoted('}')} without a ${quoted('{')}. Write \\} for the character itself.`, this.index);
      } else {
        text += char;
        this.index += 1;
      }
    }
    if (openAt !== null) fail(`A ${quoted('[')} is never closed.`, openAt);
    flush();
    return nodes;
  }

  private value(): PatternNode {
    const openAt = this.index;
    this.index += 1;
    if (this.char() === '=') return this.formulaValue(openAt);
    const refs: string[] = [];
    let ref = '';
    let refAt = this.index;
    for (let char = this.char(); ; char = this.char()) {
      if (char === '') fail(`A ${quoted('{')} is never closed.`, openAt);
      if (char === '\\') {
        ref += this.escaped();
        continue;
      }
      if (char === ',' || char === '|' || char === '}') {
        refs.push(this.finishedRef(ref, refAt));
        if (char !== ',') break;
        this.index += 1;
        ref = '';
        refAt = this.index;
        continue;
      }
      if (char === '{' || char === '[' || char === ']') {
        fail(`${quoted(char)} can't be used inside { }. Write \\${char} for the character itself.`, this.index);
      }
      ref += char;
      this.index += 1;
    }
    return { kind: 'refs', refs, filters: this.filters(openAt) };
  }

  private finishedRef(text: string, at: number): string {
    const ref = text.trim();
    if (ref === '') fail('A value needs the name of a field, like {hp}.', at);
    return ref;
  }

  private formulaValue(openAt: number): PatternNode {
    this.index += 1;
    const start = this.index;
    while (this.char() !== '' && this.char() !== '|' && this.char() !== '}') this.index += 1;
    if (this.char() === '') fail(`A ${quoted('{')} is never closed.`, openAt);
    const source = this.source.slice(start, this.index);
    const formula = parseFormula(source, start);
    if (isExpressionError(formula)) throw new PatternFailure(formula);
    return { kind: 'formula', source: source.trim(), formula, filters: this.filters(openAt) };
  }

  /** Reads `|filter` parts up to and including the value's closing `}`. */
  private filters(openAt: number): PatternFilter[] {
    const filters: PatternFilter[] = [];
    while (this.char() === '|') {
      this.index += 1;
      const at = this.index;
      let text = '';
      for (let char = this.char(); char !== '|' && char !== '}'; char = this.char()) {
        if (char === '') fail(`A ${quoted('{')} is never closed.`, openAt);
        if (char === '\\') {
          text += this.escaped();
        } else {
          text += char;
          this.index += 1;
        }
      }
      const filter = parseFilter(text, at);
      if (isExpressionError(filter)) throw new PatternFailure(filter);
      filters.push(filter);
    }
    this.index += 1;
    return filters;
  }
}

/** The pattern's syntax tree, or a syntax error with the offset it is at. Never throws. */
export function parsePattern(source: string): PatternAst | ExpressionError {
  if (source.length > MAX_LENGTH) return syntaxError(t('statblockEditor.expr.patternLong'), 0);
  try {
    return new PatternParser(source).parse();
  } catch (failure) {
    if (failure instanceof PatternFailure) return failure.error;
    throw failure;
  }
}

const parsed = new Map<string, PatternAst | ExpressionError>();

/** `parsePattern`, remembered for the patterns rendered most recently. */
export function parsePatternCached(source: string): PatternAst | ExpressionError {
  const known = parsed.get(source);
  if (known) return known;
  if (parsed.size >= CACHE_SIZE) parsed.clear();
  const result = parsePattern(source);
  parsed.set(source, result);
  return result;
}

/** What a block without a pattern shows: its field's value as text. */
export function singleFieldPattern(key: FieldKey): PatternAst {
  return { kind: 'pattern', nodes: [{ kind: 'refs', refs: [key], filters: [] }] };
}

/** Text that a pattern shows exactly as written: every special character escaped. */
export function escapePatternText(text: string): string {
  return text.replace(ESCAPABLE_CHARACTERS, (char) => `\\${char}`);
}
