/**
 * A recursive-descent parser for formulas:
 *
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/') unary)*
 *   unary      := ('-' | '+') unary | primary
 *   primary    := number | 'value' | ref | function '(' expression (',' expression)* ')' | '(' expression ')'
 *
 * Operators of one level group from the left: `8 - 2 - 1` is 5.
 */

import { quoted } from '../values/valueText';
import { syntaxError, type ExpressionError } from './errors';
import { FORMULA_FUNCTIONS, isFormulaFunction, SLOT_WORD, type FormulaNode, type FormulaToken } from './formulaTypes';
import { tokenizeFormula } from './tokenize';
import { t } from '../../i18n';

/** Deeper nesting than any statblock needs; it keeps hostile input from exhausting the stack. */
const MAX_DEPTH = 64;
/** Operator chains make trees as deep as they are long, and every reader of a tree recurses. */
const MAX_TOKENS = 1000;
const COMMA_OUTSIDE_CALL = `${quoted(',')} only separates the numbers of min and max.`;

/** Carries a syntax error out of the recursion; never leaves this module. */
class SyntaxFailure extends Error {
  constructor(readonly error: ExpressionError) {
    super(error.message);
  }
}

function tokenText(token: FormulaToken): string {
  switch (token.type) {
    case 'number': return token.text;
    case 'name': return token.name;
    case 'op': return token.op;
    case 'open': return '(';
    case 'close': return ')';
    case 'comma': return ',';
    case 'end': return '';
  }
}

function arityProblem(fn: string, count: number): string | null {
  if (!isFormulaFunction(fn)) return null;
  const { min, max } = FORMULA_FUNCTIONS[fn];
  if (count >= min && count <= max) return null;
  return max === 1 ? t('statblockEditor.expr.oneNumber', { fn }) : t('statblockEditor.expr.someNumber', { fn });
}

class FormulaParser {
  private position = 0;
  private depth = 0;

  constructor(private readonly tokens: readonly FormulaToken[]) {}

  parse(): FormulaNode {
    const node = this.expression();
    const next = this.peek();
    if (next.type === 'close') this.fail(`There is a ${quoted(')')} without a ${quoted('(')}.`, next.at);
    if (next.type === 'comma') this.fail(COMMA_OUTSIDE_CALL, next.at);
    if (next.type !== 'end') this.fail(`${quoted(tokenText(next))} doesn't belong here.`, next.at);
    return node;
  }

  private peek(): FormulaToken {
    return this.tokens[this.position] ?? this.tokens[this.tokens.length - 1] ?? { type: 'end', at: 0 };
  }

  private take(): FormulaToken {
    const token = this.peek();
    if (token.type !== 'end') this.position += 1;
    return token;
  }

  private fail(message: string, at: number): never {
    throw new SyntaxFailure(syntaxError(message, at));
  }

  private nested<T>(at: number, read: () => T): T {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) this.fail(t('statblockEditor.expr.deep'), at);
    const result = read();
    this.depth -= 1;
    return result;
  }

  private expression(): FormulaNode {
    let left = this.term();
    for (let next = this.peek(); next.type === 'op' && (next.op === '+' || next.op === '-'); next = this.peek()) {
      this.take();
      left = { kind: 'binary', op: next.op, left, right: this.term() };
    }
    return left;
  }

  private term(): FormulaNode {
    let left = this.unary();
    for (let next = this.peek(); next.type === 'op' && (next.op === '*' || next.op === '/'); next = this.peek()) {
      this.take();
      left = { kind: 'binary', op: next.op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): FormulaNode {
    const next = this.peek();
    if (next.type === 'op' && (next.op === '-' || next.op === '+')) {
      this.take();
      const operand = this.nested(next.at, () => this.unary());
      return next.op === '-' ? { kind: 'negate', operand } : operand;
    }
    return this.primary();
  }

  private primary(): FormulaNode {
    const token = this.take();
    switch (token.type) {
      case 'number': return { kind: 'number', value: token.value };
      case 'name': return this.named(token.name, token.at);
      case 'open': return this.nested(token.at, () => this.bracketed(token.at));
      case 'end': return this.fail(t('statblockEditor.expr.early'), token.at);
      case 'close': return this.fail(`There is a ${quoted(')')} without a ${quoted('(')}.`, token.at);
      case 'op': return this.fail(`${quoted(token.op)} needs a number before it.`, token.at);
      case 'comma': return this.fail(COMMA_OUTSIDE_CALL, token.at);
    }
  }

  private bracketed(openAt: number): FormulaNode {
    const node = this.expression();
    if (this.peek().type !== 'close') this.unclosed(openAt);
    this.take();
    return node;
  }

  private unclosed(openAt: number): never {
    const next = this.peek();
    if (next.type === 'end') this.fail(`A ${quoted('(')} is never closed.`, openAt);
    return this.fail(`${quoted(tokenText(next))} doesn't belong here.`, next.at);
  }

  private named(name: string, at: number): FormulaNode {
    if (this.peek().type !== 'open') return name === SLOT_WORD ? { kind: 'slot' } : { kind: 'ref', ref: name };
    const fn = name.toLowerCase();
    if (!isFormulaFunction(fn)) this.fail(`${quoted(name)} isn't a function. There are floor, ceil, round, abs, min and max.`, at);
    const openAt = this.take().at;
    const args = this.nested(openAt, () => this.argumentsUntilClose(openAt));
    const problem = arityProblem(fn, args.length);
    if (problem) this.fail(problem, at);
    return { kind: 'call', fn, args };
  }

  private argumentsUntilClose(openAt: number): FormulaNode[] {
    const args: FormulaNode[] = [];
    if (this.peek().type === 'close') {
      this.take();
      return args;
    }
    for (;;) {
      args.push(this.expression());
      const next = this.peek();
      if (next.type === 'close') {
        this.take();
        return args;
      }
      if (next.type !== 'comma') this.unclosed(openAt);
      this.take();
    }
  }
}

/**
 * The formula's syntax tree, or a syntax error. `offset` is where the formula
 * starts in a longer text (a pattern), so error positions point into it.
 */
export function parseFormula(source: string, offset = 0): FormulaNode | ExpressionError {
  const tokens = tokenizeFormula(source, offset);
  if (!Array.isArray(tokens)) return tokens;
  if (tokens.length === 1) return syntaxError(t('statblockEditor.expr.empty'), offset);
  if (tokens.length > MAX_TOKENS) return syntaxError(t('statblockEditor.expr.long'), offset);
  try {
    return new FormulaParser(tokens).parse();
  } catch (failure) {
    if (failure instanceof SyntaxFailure) return failure.error;
    throw failure;
  }
}
