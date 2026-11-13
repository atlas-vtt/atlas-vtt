/**
 * Where the lines of a text break that has a width. One rule for whoever shows the text: the field
 * it is typed in, the map, the players' page.
 *
 * A line breaks at spaces, and after a hyphen or at a dash ("half-orc"), never elsewhere inside a
 * word, unless a part alone is longer than the width: then it breaks wherever the width ends. Line breaks typed into the text are kept. The spaces a line breaks at hang at its end:
 * they take no room and are not drawn. These are the places a browser breaks such text at too, so
 * the field a text is typed in (a browser's own text field) shows the lines the map will draw.
 *
 * Two browsers measure the same run a little differently (and one of them widens bold that the
 * font has no weight for), so lines can break elsewhere on another device. A text therefore keeps
 * where its lines broke when it was written (`breaks`), and is drawn from that.
 */

/** The width of a run of the text as it is drawn in its face and size, in the units of the wrap width. */
export type RunMeasure = (run: string) => number;

/** How far a line may be over the width and still fit: sums of glyph widths are not exact. */
const FIT_SLACK = 1e-3;
const LINE_BREAK = /\r\n|\r|\n/g;

const isSpace = (character: string | undefined): boolean => character === ' ' || character === '\t';

/** The parts of `text` between the line breaks typed into it: where each starts and ends. */
function paragraphs(text: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  let start = 0;
  for (const match of text.matchAll(LINE_BREAK)) {
    found.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  found.push({ start, end: text.length });
  return found;
}

/** The places in `part` it may be broken at: after each character as a reader sees it, so no accent or emoji is torn. */
function characterEnds(part: string): number[] {
  const ends: number[] = [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    for (const { index, segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(part)) ends.push(index + segment.length);
    return ends;
  }
  let at = 0;
  for (const character of part) ends.push(at += character.length);
  return ends;
}

const isDigit = (character: string | undefined): boolean => character !== undefined && character >= '0' && character <= '9';
const isAsciiLetterOrDigit = (character: string | undefined): boolean => character !== undefined && /^[0-9A-Za-z]$/.test(character);
const isLetter = (character: string): boolean => /^\p{L}/u.test(character);
const EM_DASH = '\u2014';
/** A hyphen and an en dash: a line may always end after one of them. */
const DASHES = '\u2010\u2013';

/**
 * Whether a line may begin at `index` of `text`, as a browser's text field sees it (the places
 * Chromium breaks a line at, for what is written on maps): after spaces; after a hyphen-minus
 * that a letter follows, or a digit where a letter or digit stands before the hyphen ("1-2", but
 * not the minus of "-5"); after a hyphen or an en dash; before and after an em dash.
 */
function mayBegin(text: string, index: number): boolean {
  const before = text[index - 1]!;
  const here = text[index]!;
  if (isSpace(here)) return false;
  if (isSpace(before)) return true;
  if (before === EM_DASH || here === EM_DASH) return before !== here;
  if (DASHES.includes(before)) return !DASHES.includes(here) && here !== '-';
  if (before !== '-') return false;
  return isDigit(here) ? isAsciiLetterOrDigit(text[index - 2]) : isLetter(here);
}

/** The next place after `from` where a line may begin (`mayBegin`); `end` where there is none before it. */
function nextStart(text: string, from: number, end: number): number {
  for (let index = from + 1; index < end; index++) {
    if (mayBegin(text, index)) return index;
  }
  return end;
}

/**
 * The indexes into `text` at which a line begins because the line before it was full: where
 * `text` wraps at `width`, measured by `measure`. Each is after the one before, none at a line
 * break typed into the text. None for a width that is no size.
 */
export function wrapBreaks(text: string, width: number, measure: RunMeasure): number[] {
  const breaks: number[] = [];
  if (!(width > 0) || !Number.isFinite(width)) return breaks;
  const fits = (start: number, end: number): boolean => measure(text.slice(start, end)) <= width + FIT_SLACK;
  for (const { start, end } of paragraphs(text)) {
    let lineStart = start;
    /** The farthest place the line may end at with everything before it fitting. */
    let fitted = start;
    while (fitted < end) {
      const next = nextStart(text, fitted, end);
      // The spaces before the next start hang: only what is drawn must fit.
      let shown = next;
      while (shown > lineStart && isSpace(text[shown - 1])) shown--;
      if (shown === lineStart || fits(lineStart, shown)) {
        fitted = next;
      } else if (fitted > lineStart) {
        // The part goes to a line of its own, where it is looked at again.
        breaks.push(fitted);
        lineStart = fitted;
      } else {
        // The part alone is longer than the width: as much of it as fits stays, one character at least.
        const ends = characterEnds(text.slice(lineStart, shown));
        let low = 0;
        let high = ends.length - 1;
        while (low < high) {
          const middle = (low + high + 1) >> 1;
          if (fits(lineStart, lineStart + ends[middle]!)) low = middle;
          else high = middle - 1;
        }
        const cut = lineStart + ends[low]!;
        if (cut >= shown) {
          // One character wider than the width: it stands alone, and is as wide as it is.
          fitted = next;
        } else {
          breaks.push(cut);
          lineStart = fitted = cut;
        }
      }
    }
  }
  return breaks;
}

/**
 * The lines of `text` as they are drawn: broken at the line breaks typed into it and at `breaks`
 * (`wrapBreaks`, or what a text saved), without the spaces that hang at the end of a line that
 * was full. A break outside the text, or at a typed line break, breaks nothing.
 */
export function linesOf(text: string, breaks: readonly number[] | null): string[] {
  const lines: string[] = [];
  const soft = breaks ?? [];
  let next = 0;
  for (const { start, end } of paragraphs(text)) {
    let lineStart = start;
    while (next < soft.length && soft[next]! <= start) next++;
    for (; next < soft.length && soft[next]! < end; next++) {
      lines.push(text.slice(lineStart, soft[next]).replace(/[ \t]+$/, ''));
      lineStart = soft[next]!;
    }
    lines.push(text.slice(lineStart, end));
  }
  return lines;
}

/** The lines `text` is drawn in at `width` (see `wrapBreaks` and `linesOf`). */
export function wrapped(text: string, width: number, measure: RunMeasure): string[] {
  return linesOf(text, wrapBreaks(text, width, measure));
}
