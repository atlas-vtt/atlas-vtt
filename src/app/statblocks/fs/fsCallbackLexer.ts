/**
 * Splits the JavaScript of a Fantasy Statblocks callback into tokens for
 * `fsCallbackSyntax`. Only what formatting callbacks use is understood:
 * strings, template literals, numbers, names and operators, with comments
 * skipped. Anything else (regular expressions, unicode names, numeric escapes)
 * throws `Unreadable`, which the parser turns into null.
 */

export type Token =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'template'; parts: (string | Token[])[] }
  | { kind: 'name'; value: string }
  | { kind: 'punct'; value: string };

const PUNCTUATION = [
  '===', '!==', '?.', '??', '==', '!=', '<=', '>=', '&&', '||', '=>',
  '+', '-', '*', '/', '%', '(', ')', '[', ']', '{', '}', '.', ',', ';', ':', '?', '<', '>', '=', '!',
];
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r' };

/** Carries a failure out of the recursion; the parser catches it. */
export class Unreadable extends Error {}

export function fail(): never {
  throw new Unreadable('unreadable');
}

/** Template literals inside template literals; callbacks that format values nest one or two. */
const MAX_TEMPLATE_NESTING = 8;

class Lexer {
  private at = 0;
  private templates = 0;

  constructor(private readonly source: string) {}

  /** Tokens to the end, or (inside `${ }`) to the brace that closes the expression. */
  tokens(inTemplate: boolean): Token[] {
    const tokens: Token[] = [];
    let braces = 0;
    for (;;) {
      this.skipSpace();
      const char = this.source.charAt(this.at);
      if (char === '') {
        if (inTemplate) fail();
        return tokens;
      }
      if (char === '}' && inTemplate && braces === 0) {
        this.at += 1;
        return tokens;
      }
      if (char === '"' || char === "'") tokens.push({ kind: 'string', value: this.quoted(char) });
      else if (char === '`') tokens.push(this.template());
      else if (/\d/.test(char)) tokens.push(this.number());
      else if (/[A-Za-z_$]/.test(char)) tokens.push({ kind: 'name', value: this.match(/[A-Za-z_$][\w$]*/y) });
      else {
        const punct = this.punctuation();
        if (punct === '{') braces += 1;
        if (punct === '}') braces -= 1;
        tokens.push({ kind: 'punct', value: punct });
      }
    }
  }

  private skipSpace(): void {
    for (;;) {
      const rest = this.source.slice(this.at, this.at + 2);
      if (/^\s/.test(rest)) this.at += 1;
      else if (rest === '//') this.at = this.endOf('\n', this.at);
      else if (rest === '/*') this.at = this.endOf('*/', this.at + 2) + 2;
      else return;
    }
  }

  private endOf(marker: string, from: number): number {
    const index = this.source.indexOf(marker, from);
    if (index < 0 && marker !== '\n') fail();
    return index < 0 ? this.source.length : index;
  }

  private match(pattern: RegExp): string {
    pattern.lastIndex = this.at;
    const found = pattern.exec(this.source)?.[0] ?? fail();
    this.at += found.length;
    return found;
  }

  private number(): Token {
    return { kind: 'number', value: Number(this.match(/\d+(?:\.\d+)?/y)) };
  }

  private punctuation(): string {
    const found = PUNCTUATION.find((punct) => this.source.startsWith(punct, this.at)) ?? fail();
    // `a ? .5 : 1` is a conditional, not optional chaining
    if (found === '?.' && /\d/.test(this.source.charAt(this.at + 2))) {
      this.at += 1;
      return '?';
    }
    this.at += found.length;
    return found;
  }

  /** The character after a backslash. */
  private escaped(): string {
    const char = this.source.charAt(this.at + 1);
    if (char === '' || /[0-9bfvxuc\r\n]/.test(char)) fail();
    this.at += 2;
    return ESCAPES[char] ?? char;
  }

  private quoted(quote: string): string {
    this.at += 1;
    let text = '';
    for (let char = this.source.charAt(this.at); char !== quote; char = this.source.charAt(this.at)) {
      if (char === '' || char === '\n') fail();
      if (char === '\\') text += this.escaped();
      else {
        text += char;
        this.at += 1;
      }
    }
    this.at += 1;
    return text;
  }

  private template(): Token {
    if (++this.templates > MAX_TEMPLATE_NESTING) fail();
    this.at += 1;
    const parts: (string | Token[])[] = [];
    let text = '';
    for (let char = this.source.charAt(this.at); char !== '`'; char = this.source.charAt(this.at)) {
      if (char === '') fail();
      if (char === '\\') {
        text += this.escaped();
      } else if (this.source.startsWith('${', this.at)) {
        this.at += 2;
        if (text) parts.push(text);
        text = '';
        parts.push(this.tokens(true));
      } else {
        text += char;
        this.at += 1;
      }
    }
    this.at += 1;
    if (text) parts.push(text);
    this.templates -= 1;
    return { kind: 'template', parts };
  }
}

/** The tokens of `code`; throws `Unreadable` where it holds something this does not read. */
export function lexCallback(code: string): Token[] {
  return new Lexer(code).tokens(false);
}
