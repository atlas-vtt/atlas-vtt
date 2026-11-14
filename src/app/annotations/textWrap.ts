/**
 * Where the lines of a text break that has a width. One rule for whoever shows the text: the field
 * it is typed in, the map, the players' page.
 *
 * A line breaks at spaces, after a hyphen or at a dash ("half-orc") and at a few marks
 * (`mayBegin`), never elsewhere inside a word, unless a part alone is longer than the width: then
 * it breaks wherever the width ends. Line breaks typed into the text are kept. The spaces a line
 * breaks at hang at its end: they take no room and are not drawn. These are the places a browser
 * breaks such text at too, so the field a text is typed in (a browser's own text field) shows
 * the lines the map will draw.
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
/** A character of the plain set a keyboard types, but no space. */
const isPlain = (character: string): boolean => character >= '!' && character <= '~';
const EM_DASH = '\u2014';
/** A hyphen, a figure dash and an en dash: a line may always end after one of them. */
const DASHES = '\u2010\u2012\u2013';
/** Brackets that open: a line may begin at one after the marks of `BEFORE_OPENER`, and after a letter of the scripts written without spaces. */
const OPENERS = '(<[{';
const WIDE_OPENERS = '\uff08\uff3b\uff5b\u300c\u300e\u3010\u3014\u3008\u300a';
const BEFORE_OPENER = '!"#%&)*+,.:;=>\\]|}~\u2026';
/** The plain marks no line begins at after a hyphen-minus, and after a question mark. */
const NOT_AFTER_HYPHEN = '!$),./:;?]}';
const NOT_AFTER_QUESTION = '!"\'),./:;?]}';
/**
 * Characters a line may end after though they are no space a keyboard types: the spaces of fixed
 * widths, the ideographic space, the space of no width, and the soft hyphen. They stay on the line
 * they end, as wide as they are.
 */
const ENDS_A_LINE = /^[\u00ad\u1680\u2000-\u2006\u2008-\u200b\u3000]$/;
/** Ideographic and full-width marks that close a phrase, and the middle dot between names: a line may end after one, unless another follows. */
const CLOSES = '\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff01\uff1f\uff09\uff3d\uff5d\u300d\u300f\u3011\u3015\u3009\u300b\u30fb';
/** A letter of a script written without spaces between words: its letters stay together, but brackets part from them. */
const isUnspaced = (character: string): boolean => /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character);
const isPicture = (character: string): boolean => /^\p{Extended_Pictographic}/u.test(character);
const ZERO_WIDTH_JOINER = '\u200d';
/** What follows a picture as a part of it: the mark that makes it one, and a skin tone. */
const isPictureMark = (character: string): boolean => /^(?:\ufe0f|[\u{1f3fb}-\u{1f3ff}])/u.test(character);

/** The character (a whole one, also beyond the first 65,536) that ends before `index`, and the one that begins at it. */
function around(text: string, index: number): { before: string; here: string } {
  const low = text.charCodeAt(index - 1);
  const paired = low >= 0xdc00 && low <= 0xdfff && index >= 2;
  return { before: paired ? text.slice(index - 2, index) : text[index - 1]!, here: String.fromCodePoint(text.codePointAt(index)!) };
}

/**
 * Whether a line may begin at `index` of `text`, as the field a text is typed in sees it: the
 * places Chromium breaks a line at with the field's styles, which keep the letters of every
 * script together (`tests/gpu/textFieldBreaks.gpu.test.ts` asks the browser). After spaces; after
 * a hyphen-minus that a letter follows, or a digit where a letter or digit stands before the
 * hyphen ("1-2", but not the minus of "-5"), or one of most other marks; after a hyphen, a figure
 * dash or an en dash; before and after an em dash; after a question mark, but for the marks that
 * end a phrase; before a bracket that opens, after a mark; after an ellipsis; after the marks
 * that close a phrase of ideographs; and before and after a picture (an emoji) beside letters.
 */
function mayBegin(text: string, index: number): boolean {
  const { before, here } = around(text, index);
  // Inside a character of two halves no line begins.
  if (here >= '\udc00' && here <= '\udfff') return false;
  if (isSpace(here)) return false;
  if (isSpace(before)) return true;
  if (ENDS_A_LINE.test(before)) return !ENDS_A_LINE.test(here) && here !== '-';
  if (before === EM_DASH || here === EM_DASH) return before !== here;
  if (DASHES.includes(before)) return !DASHES.includes(here) && here !== '-';
  if (before === '-') {
    if (isDigit(here)) return isAsciiLetterOrDigit(text[index - 2]);
    return isPlain(here) ? !NOT_AFTER_HYPHEN.includes(here) : isLetter(here);
  }
  if (before === '?') return isPlain(here) ? !NOT_AFTER_QUESTION.includes(here) : isLetter(here);
  if (before === '!' && !isPlain(here)) return isLetter(here);
  if (OPENERS.includes(here)) return BEFORE_OPENER.includes(before) || isUnspaced(before);
  if (WIDE_OPENERS.includes(here)) return isUnspaced(before);
  if (before === '\u2026') return isLetter(here) || isDigit(here);
  if (CLOSES.includes(before)) return !CLOSES.includes(here);
  if (')]}'.includes(before)) return isUnspaced(here);
  // A picture parts from the letters, digits and pictures beside it, but never from its own parts.
  if (isPicture(here)) return before !== ZERO_WIDTH_JOINER && (isLetter(before) || isDigit(before) || isPicture(before) || isPictureMark(before));
  if (isPicture(before) || isPictureMark(before)) return isLetter(here) || isDigit(here);
  return false;
}

/** The places in `text` at which a line may begin once the line before it is full, in order: what the field's browser calls its break opportunities. */
export function lineStarts(text: string): number[] {
  const starts: number[] = [];
  for (let index = 1; index < text.length; index++) {
    if (mayBegin(text, index)) starts.push(index);
  }
  return starts;
}

/** The next place after `from` where a line may begin (`mayBegin`); `end` where there is none before it. */
function nextStart(text: string, from: number, end: number): number {
  for (let index = from + 1; index < end; index++) {
    if (mayBegin(text, index)) return index;
  }
  return end;
}

/** A line longer than this many characters is measured from its start in growing pieces, never whole at once: a run without a space can be the whole text. */
const LONG_LINE = 256;
/** The characters looked at first for where such a line ends; twice as many each time they all fit. */
const FIRST_REACH = 64;

/**
 * Where the line that begins at `lineStart` must end if it may not pass `end`: the last place
 * after a whole character up to which it fits (`fits(lineStart, place)`), one character at least;
 * `end` itself where all of it fits. Found from the line's start outwards, so a line costs by its
 * own length however much text follows it.
 */
function fittingEnd(text: string, lineStart: number, end: number, fits: (start: number, end: number) => boolean): number {
  for (let reach = FIRST_REACH; ; reach *= 2) {
    const limit = Math.min(end, lineStart + reach);
    const ends = characterEnds(text.slice(lineStart, limit));
    // The piece may end inside a character: the last one found is whole only where the piece ends with the part.
    if (limit < end) ends.pop();
    if (ends.length === 0) continue;
    const whole = limit === end;
    if (whole && fits(lineStart, end)) return end;
    if (!whole && fits(lineStart, lineStart + ends[ends.length - 1]!)) continue;
    let low = 0;
    let high = ends.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (fits(lineStart, lineStart + ends[middle]!)) low = middle;
      else high = middle - 1;
    }
    return lineStart + ends[low]!;
  }
}

/**
 * The indexes into `text` at which a line begins because the line before it was full: where
 * `text` wraps at `width`, measured by `measure`. Each is after the one before, none at a line
 * break typed into the text. None for a width that is no size.
 *
 * It costs by the length of the text, also where the text is one run without a space: no run is
 * measured or looked through more than a few times.
 */
export function wrapBreaks(text: string, width: number, measure: RunMeasure): number[] {
  const breaks: number[] = [];
  if (!(width > 0) || !Number.isFinite(width)) return breaks;
  const fits = (start: number, end: number): boolean => measure(text.slice(start, end)) <= width + FIT_SLACK;
  for (const { start, end } of paragraphs(text)) {
    let lineStart = start;
    /** The farthest place the line may end at with everything before it fitting. */
    let fitted = start;
    /** No line may begin between these two: a cut inside a long part does not look for the next start again. */
    let [soughtFrom, sought] = [-1, -1];
    while (fitted < end) {
      const next = fitted >= soughtFrom && fitted < sought ? sought : nextStart(text, fitted, end);
      [soughtFrom, sought] = [fitted, next];
      // The spaces before the next start hang: only what is drawn must fit.
      let shown = next;
      while (shown > lineStart && isSpace(text[shown - 1])) shown--;
      if (shown === lineStart) {
        fitted = next;
        continue;
      }
      // How far the line fits: asked of all of it at once only where that is little to measure.
      const reach = shown - lineStart > LONG_LINE ? fittingEnd(text, lineStart, shown, fits) : fits(lineStart, shown) ? shown : -1;
      if (reach >= shown) {
        fitted = next;
      } else if (fitted > lineStart) {
        // The part goes to a line of its own, where it is looked at again.
        breaks.push(fitted);
        lineStart = fitted;
      } else {
        // The part alone is longer than the width: as much of it as fits stays, one character at least.
        const cut = reach >= 0 ? reach : fittingEnd(text, lineStart, shown, fits);
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
