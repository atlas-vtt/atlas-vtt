/**
 * Reads the JavaScript of a Fantasy Statblocks callback into a small syntax
 * tree, so `fsCallbackPatterns` can recognise the few shapes that only format
 * values. Only a narrow subset of the language is understood; anything else
 * (functions, loops, assignments, regular expressions) gives null. Nothing here runs code: it reads text.
 */

import { fail, lexCallback, Unreadable, type Token } from './fsCallbackLexer';

export type JsNode =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'template'; parts: (string | JsNode)[] }
  | { kind: 'name'; name: string }
  | { kind: 'member'; object: JsNode; key: string }
  /** `table[monster.cr]`: a member whose key is worked out. */
  | { kind: 'index'; object: JsNode; key: JsNode }
  | { kind: 'call'; callee: JsNode; args: JsNode[] }
  | { kind: 'unary'; op: string; arg: JsNode }
  | { kind: 'binary'; op: string; left: JsNode; right: JsNode }
  | { kind: 'conditional'; test: JsNode; yes: JsNode; no: JsNode }
  | { kind: 'array'; items: JsNode[] }
  /** `{ cr: "1/4", xp: 50 }`: keys as written, in order. */
  | { kind: 'object'; entries: [string, JsNode][] };

export type JsStatement =
  | { kind: 'return'; value: JsNode | null }
  | { kind: 'declare'; name: string; value: JsNode }
  /** `otherwise`: the `else` branch, where there is one (an `else if` is an `if` alone in it). */
  | { kind: 'if'; test: JsNode; then: JsStatement[]; otherwise?: JsStatement[] }
  | { kind: 'expression'; value: JsNode };

/** Longer callbacks do more than format a value. */
const MAX_LENGTH = 4000;
const MAX_NESTING = 48;
const KEYWORDS: ReadonlySet<string> = new Set(['return', 'const', 'let', 'var', 'if', 'else']);

const BINARY_LEVELS: readonly (readonly string[])[] = [
  ['??'], ['||'], ['&&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>=', 'in'], ['+', '-'], ['*', '/', '%'],
];

class Parser {
  private at = 0;

  /** `nesting`: how deep the template literal this parser reads sits, so the limit holds across them. */
  constructor(private readonly tokens: readonly Token[], private nesting = 0) {}

  statements(closer: string | null): JsStatement[] {
    const list: JsStatement[] = [];
    while (!(closer === null ? this.atEnd() : this.takes(closer))) {
      if (this.atEnd()) fail();
      if (!this.takes(';')) list.push(this.statement());
    }
    return list;
  }

  /** The whole token list as one expression. */
  only(): JsNode {
    const node = this.expression();
    if (!this.atEnd()) fail();
    return node;
  }

  private atEnd(): boolean {
    return this.at >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private takes(value: string): boolean {
    const token = this.peek();
    const matches = token !== undefined && (token.kind === 'punct' || token.kind === 'name') && token.value === value;
    if (matches) this.at += 1;
    return matches;
  }

  private expect(value: string): void {
    if (!this.takes(value)) fail();
  }

  private name(): string {
    const token = this.peek();
    if (token?.kind !== 'name' || KEYWORDS.has(token.value)) fail();
    this.at += 1;
    return token.value;
  }

  private statement(): JsStatement {
    let statement: JsStatement;
    if (this.takes('return')) {
      const ends = this.atEnd() || this.peekIs(';') || this.peekIs('}');
      statement = { kind: 'return', value: ends ? null : this.expression() };
    } else if (this.takes('const') || this.takes('let') || this.takes('var')) {
      const name = this.name();
      this.expect('=');
      statement = { kind: 'declare', name, value: this.expression() };
    } else if (this.takes('if')) {
      this.expect('(');
      const test = this.expression();
      this.expect(')');
      const then = this.branch();
      return this.takes('else') ? { kind: 'if', test, then, otherwise: this.branch() } : { kind: 'if', test, then };
    } else {
      statement = { kind: 'expression', value: this.expression() };
    }
    this.takes(';');
    return statement;
  }

  /** An `if`'s or `else`'s branch: a block, or one statement. */
  private branch(): JsStatement[] {
    return this.takes('{') ? this.statements('}') : [this.statement()];
  }

  private peekIs(value: string): boolean {
    const token = this.peek();
    return token !== undefined && (token.kind === 'punct' || token.kind === 'name') && token.value === value;
  }

  private expression(): JsNode {
    if (++this.nesting > MAX_NESTING) fail();
    const test = this.binary(0);
    const node: JsNode = this.takes('?') ? this.conditional(test) : test;
    this.nesting -= 1;
    return node;
  }

  private conditional(test: JsNode): JsNode {
    const yes = this.expression();
    this.expect(':');
    return { kind: 'conditional', test, yes, no: this.expression() };
  }

  private binary(level: number): JsNode {
    const operators = BINARY_LEVELS[level];
    if (!operators) return this.unary();
    let left = this.binary(level + 1);
    for (let op = operators.find((candidate) => this.peekIs(candidate)); op; op = operators.find((candidate) => this.peekIs(candidate))) {
      this.at += 1;
      left = { kind: 'binary', op, left, right: this.binary(level + 1) };
    }
    return left;
  }

  private unary(): JsNode {
    const op = ['!', '-', '+'].find((candidate) => this.peekIs(candidate));
    if (!op) return this.postfix(this.primary());
    this.at += 1;
    if (++this.nesting > MAX_NESTING) fail();
    const node: JsNode = { kind: 'unary', op, arg: this.unary() };
    this.nesting -= 1;
    return node;
  }

  private postfix(start: JsNode): JsNode {
    let node = start;
    for (;;) {
      if (this.takes('.') || this.takes('?.')) node = { kind: 'member', object: node, key: this.memberName() };
      else if (this.takes('[')) node = this.bracketMember(node);
      else if (this.takes('(')) node = { kind: 'call', callee: node, args: this.list(')') };
      else return node;
    }
  }

  private memberName(): string {
    const token = this.peek();
    if (token?.kind !== 'name') fail();
    this.at += 1;
    return token.value;
  }

  /** `object["key"]` is a member as `object.key` is; any other key is worked out (`index`). */
  private bracketMember(object: JsNode): JsNode {
    const token = this.peek();
    const next = this.tokens[this.at + 1];
    if (token?.kind === 'string' && next?.kind === 'punct' && next.value === ']') {
      this.at += 2;
      return { kind: 'member', object, key: token.value };
    }
    const key = this.expression();
    this.expect(']');
    return { kind: 'index', object, key };
  }

  /** `{ key: value, "key": value, 1: value }`, the opening brace taken. */
  private objectLiteral(): JsNode {
    const entries: [string, JsNode][] = [];
    while (!this.takes('}')) {
      if (entries.length > 0) {
        this.expect(',');
        if (this.takes('}')) break;
      }
      const token = this.peek() ?? fail();
      if (token.kind !== 'name' && token.kind !== 'string' && token.kind !== 'number') fail();
      this.at += 1;
      this.expect(':');
      entries.push([String(token.value), this.expression()]);
    }
    return { kind: 'object', entries };
  }

  private list(closer: string): JsNode[] {
    const items: JsNode[] = [];
    while (!this.takes(closer)) {
      if (items.length > 0) this.expect(',');
      items.push(this.expression());
    }
    return items;
  }

  private primary(): JsNode {
    const token = this.peek() ?? fail();
    this.at += 1;
    if (token.kind === 'string') return { kind: 'string', value: token.value };
    if (token.kind === 'number') return { kind: 'number', value: token.value };
    if (token.kind === 'template') {
      return { kind: 'template', parts: token.parts.map((part) => (typeof part === 'string' ? part : new Parser(part, this.nesting + 1).only())) };
    }
    if (token.kind === 'name') {
      if (KEYWORDS.has(token.value) || token.value === 'in') fail();
      return { kind: 'name', name: token.value };
    }
    if (token.value === '(') {
      const inner = this.expression();
      this.expect(')');
      return inner;
    }
    if (token.value === '[') return { kind: 'array', items: this.list(']') };
    if (token.value === '{') {
      if (++this.nesting > MAX_NESTING) fail();
      const node = this.objectLiteral();
      this.nesting -= 1;
      return node;
    }
    return fail();
  }
}

function read<T>(code: string, parse: (parser: Parser) => T): T | null {
  if (code.length > MAX_LENGTH) return null;
  try {
    return parse(new Parser(lexCallback(code)));
  } catch (error) {
    // A stack overflow is a last line of defence; the nesting limits come first
    if (error instanceof Unreadable || error instanceof RangeError) return null;
    throw error;
  }
}

/** A callback's statements, or null where it is not in the subset this reads. */
export function parseCallbackBody(code: string): JsStatement[] | null {
  return read(code, (parser) => parser.statements(null));
}
