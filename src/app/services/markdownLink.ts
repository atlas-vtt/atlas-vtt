/** A Markdown link as a note writes it: `[words](address)`, `[words](<address>)`, either with a title in quotes after the address. */
export interface MarkdownLink {
  /** What stands in its square brackets. */
  readonly words: string;
  /** Where it leads, as written: without the angle brackets around it and without the title after it. */
  readonly address: string;
  /** The index after its closing bracket. */
  readonly end: number;
}

const isBlank = (character: string | undefined): boolean => character === ' ' || character === '\t';

function pastBlanks(text: string, at: number): number {
  let next = at;
  while (isBlank(text[next])) next += 1;
  return next;
}

/**
 * Where a link ends whose address ended at `at`: after its closing bracket, with a title in quotes
 * before that where blanks and one follow the address. -1 where the link does not end here.
 */
function linkEndFrom(text: string, at: number, lineEnd: number): number {
  let next = pastBlanks(text, at);
  const quote = text[next];
  if (next > at && (quote === '"' || quote === "'")) {
    const close = text.indexOf(quote, next + 1);
    if (close < 0 || close > lineEnd) return -1;
    next = pastBlanks(text, close + 1);
  }
  return text[next] === ')' ? next + 1 : -1;
}

/**
 * The Markdown link that starts at `start` of `text`, or null where none does. An address ends at
 * the bracket that closes the link, so it may hold brackets of its own that close
 * (`[Rage (3/day)](#Rage%20(3/day))`, as a heading with brackets is linked); one in angle brackets
 * may hold anything but those. Address and title stand on one line.
 */
export function markdownLinkAt(text: string, start: number): MarkdownLink | null {
  if (text[start] !== '[') return null;
  const wordsEnd = text.indexOf(']', start + 1);
  if (wordsEnd < 0 || text[wordsEnd + 1] !== '(') return null;
  const words = text.slice(start + 1, wordsEnd);
  const begin = pastBlanks(text, wordsEnd + 2);
  const lineBreak = text.indexOf('\n', begin);
  const lineEnd = lineBreak < 0 ? text.length : lineBreak;

  if (text[begin] === '<') {
    const close = text.indexOf('>', begin + 1);
    if (close < 0 || close > lineEnd || text.slice(begin + 1, close).includes('<')) return null;
    const end = linkEndFrom(text, close + 1, lineEnd);
    return end < 0 ? null : { words, address: text.slice(begin + 1, close), end };
  }

  let open = 0;
  for (let at = begin; at < lineEnd;) {
    const character = text[at];
    if (character === '<' || character === '>') return null;
    if (open === 0 && (character === ')' || isBlank(character))) {
      const end = linkEndFrom(text, at, lineEnd);
      if (end >= 0) return { words, address: text.slice(begin, at), end };
    }
    if (character === '(') open += 1;
    else if (character === ')') open -= 1;
    at = isBlank(character) ? pastBlanks(text, at) : at + 1;
  }
  return null;
}
