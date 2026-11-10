/**
 * Filter syntax for search fields: `prefix:value` tokens (`type:beast`,
 * `cr>=2`, `source:"Monster Manual"`) among plain words, negated with a leading
 * `-` or `!=` (`-type:beast`, `type!=beast`) where the keyword allows it.
 * Keywords are supplied by the caller, so any list can offer its own. Plain
 * words stay a text search.
 */

export type QueryOperator = '=' | '<' | '<=' | '>' | '>=';

export interface QueryKeyword {
  /** What users type before the operator, lowercase. */
  prefix: string;
  aliases: readonly string[];
  /** Shown beside the keyword in suggestions. */
  description: string;
  /** Numeric keywords also take `<`, `<=`, `>` and `>=`; others only `:` or `=`. */
  numeric: boolean;
  /** Takes `-prefix:value` and `prefix!=value` to exclude the value. */
  negatable?: boolean;
  /** Rejects values the keyword cannot use, which then stay plain words. */
  accepts?: (value: string) => boolean;
  /** An unquoted value runs on over spaces up to the next keyword or the end: `text:pack tactics`. */
  phrase?: boolean;
}

export interface QueryToken<K extends QueryKeyword> {
  keyword: K;
  op: QueryOperator;
  value: string;
  /** Excludes the value: `-type:beast` or `type!=beast`. */
  negated: boolean;
  /** Position of the token in the text, end exclusive. */
  start: number;
  end: number;
}

export interface ParsedQuery<K extends QueryKeyword> {
  tokens: QueryToken<K>[];
  /** The plain words, joined by single spaces. */
  leftover: string;
  /** Keywords typed without a usable value yet (`cr:`, `cr:abc`), as typed. */
  incomplete: string[];
}

/** What the word at the cursor is: a keyword being typed, or the value of one. */
export type QueryContext<K extends QueryKeyword> =
  | { kind: 'prefix'; fragment: string; start: number; end: number }
  | { kind: 'value'; keyword: K; op: QueryOperator; negated: boolean; fragment: string; start: number; end: number; valueStart: number };

const OPERATORS: Readonly<Record<string, QueryOperator>> = { ':': '=', '=': '=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
/** An optional `-`, the prefix, the operator. */
const TOKEN_HEAD = /^(-?)([a-z][a-z0-9_-]*)(!=|[:=<>]+)/i;
const WHITESPACE = /\s/;

/** Every keyword by its prefix and aliases, lowercase. */
export function keywordLookup<K extends QueryKeyword>(keywords: readonly K[]): ReadonlyMap<string, K> {
  const lookup = new Map<string, K>();
  for (const keyword of keywords) {
    for (const name of [keyword.prefix, ...keyword.aliases]) {
      if (!lookup.has(name)) lookup.set(name, keyword);
    }
  }
  return lookup;
}

interface TokenHead<K extends QueryKeyword> {
  keyword: K;
  op: QueryOperator;
  negated: boolean;
  length: number;
}

/** The keyword and operator a word starts with, or null when it names no keyword or uses an operator it does not take. */
function tokenHead<K extends QueryKeyword>(word: string, lookup: ReadonlyMap<string, K>): TokenHead<K> | null {
  const head = TOKEN_HEAD.exec(word);
  const keyword = head ? lookup.get(head[2]!.toLowerCase()) : undefined;
  if (!head || !keyword) return null;
  const minus = head[1] === '-';
  const unequal = head[3] === '!=';
  if ((minus || unequal) && (!keyword.negatable || (minus && unequal))) return null;
  const op = unequal ? '=' : OPERATORS[head[3]!];
  if (!op || (!keyword.numeric && op !== '=')) return null;
  return { keyword, op, negated: minus || unequal, length: head[0].length };
}

function wordEnd(text: string, from: number): number {
  let end = from;
  while (end < text.length && !WHITESPACE.test(text[end]!)) end++;
  return end;
}

/** Where a phrase starting at `from` ends: after its last word before the next keyword, or at the end. */
function phraseEnd<K extends QueryKeyword>(text: string, from: number, lookup: ReadonlyMap<string, K>): number {
  let end = wordEnd(text, from);
  for (;;) {
    let next = end;
    while (next < text.length && WHITESPACE.test(text[next]!)) next++;
    if (next >= text.length || tokenHead(text.slice(next), lookup)) return end;
    end = wordEnd(text, next);
  }
}

/** The token starting at `start`, or null when the word there is a plain word. */
function tokenAt<K extends QueryKeyword>(text: string, start: number, lookup: ReadonlyMap<string, K>): QueryToken<K> | null {
  const head = tokenHead(text.slice(start), lookup);
  if (!head) return null;
  const { keyword, op, negated } = head;

  const valueStart = start + head.length;
  let value: string;
  let end: number;
  if (text[valueStart] === '"') {
    const close = text.indexOf('"', valueStart + 1);
    end = close < 0 ? text.length : close + 1;
    value = text.slice(valueStart + 1, close < 0 ? text.length : close);
  } else {
    end = keyword.phrase ? phraseEnd(text, valueStart, lookup) : wordEnd(text, valueStart);
    value = text.slice(valueStart, end);
  }
  value = value.trim().replace(/\s+/g, ' ');
  if (!value || (keyword.accepts && !keyword.accepts(value))) return null;
  return { keyword, op, value, negated, start, end };
}

/** Splits `text` into filter tokens and the plain words around them. */
export function parseQuery<K extends QueryKeyword>(text: string, lookup: ReadonlyMap<string, K>): ParsedQuery<K> {
  const tokens: QueryToken<K>[] = [];
  const words: string[] = [];
  const incomplete: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (WHITESPACE.test(text[i]!)) { i++; continue; }
    const token = tokenAt(text, i, lookup);
    if (token) {
      tokens.push(token);
      i = token.end;
      continue;
    }
    const start = i;
    while (i < text.length && !WHITESPACE.test(text[i]!)) i++;
    const word = text.slice(start, i);
    const head = TOKEN_HEAD.exec(word);
    (head && lookup.has(head[2]!.toLowerCase()) ? incomplete : words).push(word);
  }
  return { tokens, leftover: words.join(' '), incomplete };
}

/** What the word around `cursor` is being typed as; a word of a phrase is part of its value. */
export function queryContextAt<K extends QueryKeyword>(text: string, cursor: number, lookup: ReadonlyMap<string, K>): QueryContext<K> {
  for (const token of parseQuery(text, lookup).tokens) {
    // Spaces after a phrase are where its next word goes.
    const inside = cursor > token.start && (cursor <= token.end || text.slice(token.end, cursor).trim() === '');
    if (!token.keyword.phrase || !inside) continue;
    const head = tokenHead(text.slice(token.start), lookup);
    if (!head || cursor < token.start + head.length) break;
    const valueStart = token.start + head.length;
    return {
      kind: 'value', keyword: token.keyword, op: token.op, negated: token.negated,
      fragment: text.slice(valueStart, token.end).replace(/^"/, ''), start: token.start, end: token.end, valueStart,
    };
  }
  let start = cursor;
  while (start > 0 && !WHITESPACE.test(text[start - 1]!)) start--;
  let end = cursor;
  while (end < text.length && !WHITESPACE.test(text[end]!)) end++;
  const word = text.slice(start, end);

  const head = tokenHead(word, lookup);
  if (head) {
    const { keyword, op, negated } = head;
    return { kind: 'value', keyword, op, negated, fragment: word.slice(head.length).replace(/^"/, ''), start, end, valueStart: start + head.length };
  }
  return { kind: 'prefix', fragment: word, start, end };
}

/** Keywords whose prefix or an alias starts with `fragment`, in their given order. */
export function matchingKeywords<K extends QueryKeyword>(keywords: readonly K[], fragment: string): K[] {
  const query = fragment.toLowerCase();
  if (!query) return [...keywords];
  return keywords.filter((keyword) => [keyword.prefix, ...keyword.aliases].some((name) => name.startsWith(query)));
}

/** A value as it must be typed: quoted when it holds spaces. */
export function quoteValue(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * The next highlighted suggestion for an arrow key, wrapping at both ends. A
 * closed list opens on its first row, so ArrowDown always shows the options.
 */
export function nextHighlight(index: number, count: number, key: 'ArrowDown' | 'ArrowUp', isOpen: boolean): number {
  if (count <= 0 || !isOpen) return 0;
  return (index + (key === 'ArrowDown' ? 1 : count - 1)) % count;
}
