import { describe, expect, it } from 'vitest';
import { linesOf, wrapBreaks, wrapped, type RunMeasure } from '../textWrap';
import { seeded } from './annotationKit';

/** Every letter and space is 10 wide. */
const mono: RunMeasure = (run) => [...run].length * 10;
/** Letters of several widths: a wide `m`, a thin `i`. */
const WIDTHS: Readonly<Record<string, number>> = { m: 15, w: 14, i: 4, l: 4, ' ': 5 };
const proportional: RunMeasure = (run) => [...run].reduce((sum, letter) => sum + (WIDTHS[letter] ?? 9), 0);

describe('where a text with a width breaks', () => {
  it('breaks at spaces, and fits as many words into a line as it holds', () => {
    expect(wrapped('aaa bbb ccc', 70, mono)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapped('aaa bbb ccc', 110, mono)).toEqual(['aaa bbb ccc']);
    expect(wrapped('aaa bbb ccc', 69, mono)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(wrapBreaks('aaa bbb ccc', 70, mono)).toEqual([8]);
  });

  it('lets the spaces a line breaks at hang at its end: they take no room and are not drawn', () => {
    // "aaa bbb" is exactly as wide as the line; the three spaces after it need none.
    expect(wrapped('aaa bbb   ccc', 70, mono)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapBreaks('aaa bbb   ccc', 70, mono)).toEqual([10]);
    // Spaces at the end of the text hang too: they break nothing.
    expect(wrapped('aaa bbb     ', 70, mono)).toEqual(['aaa bbb     ']);
  });

  it('breaks inside a word only where the word alone is longer than the width', () => {
    expect(wrapped('abcdefghij', 40, mono)).toEqual(['abcd', 'efgh', 'ij']);
    // A long word after others first goes to a line of its own.
    expect(wrapped('ab cdefghi', 40, mono)).toEqual(['ab', 'cdef', 'ghi']);
    // What is left of it shares its line with the words that follow.
    expect(wrapped('abcdef gh', 40, mono)).toEqual(['abcd', 'ef', 'gh']);
    expect(wrapped('abcdef g', 40, mono)).toEqual(['abcd', 'ef g']);
  });

  it('breaks after a hyphen and at a dash, as a browser\'s text field does, and keeps the hyphen on the line it ends', () => {
    expect(wrapped('well-known half-orc', 60, mono)).toEqual(['well-', 'known', 'half-', 'orc']);
    expect(wrapBreaks('well-known', 60, mono)).toEqual([5]);
    expect(wrapped('well-known', 100, mono)).toEqual(['well-known']);
    // An en dash too, also between numbers; an em dash on either side of it.
    expect(wrapped('pages 3\u20134', 80, mono)).toEqual(['pages 3\u2013', '4']);
    expect(wrapped('gold\u2014or lead', 40, mono)).toEqual(['gold', '\u2014or', 'lead']);
    expect(wrapped('gold\u2014or lead', 50, mono)).toEqual(['gold\u2014', 'or', 'lead']);
    // Between two numbers or after a letter a hyphen-minus ends a line too, as in a long code.
    expect(wrapped('room 10-20', 80, mono)).toEqual(['room 10-', '20']);
    expect(wrapped('key A-17', 60, mono)).toEqual(['key A-', '17']);
  });

  it('breaks at no minus, between no two hyphens, and at no slash', () => {
    // The minus of a number stays with it, and goes to the next line with it.
    expect(wrapped('at -5 or -12', 80, mono)).toEqual(['at -5 or', '-12']);
    // Of two hyphens together only the second ends a line.
    expect(wrapped('aaa--bbb', 60, mono)).toEqual(['aaa--', 'bbb']);
    expect(wrapped('and/or not', 60, mono)).toEqual(['and/or', 'not']);
    // A hyphen before a space is the space's break.
    expect(wrapped('aaaa- bbbb', 70, mono)).toEqual(['aaaa-', 'bbbb']);
  });

  it('keeps the line breaks typed into the text, empty lines too', () => {
    expect(wrapped('ab\n\ncd ef', 40, mono)).toEqual(['ab', '', 'cd', 'ef']);
    expect(wrapped('ab\r\ncd', 400, mono)).toEqual(['ab', 'cd']);
    expect(wrapBreaks('ab\n\ncd ef', 40, mono)).toEqual([7]);
  });

  it('gives every line one character at least, and tears neither an emoji nor an accent', () => {
    expect(wrapped('abc', 1, mono)).toEqual(['a', 'b', 'c']);
    expect(wrapped('a👍🏽b', 10, mono)).toEqual(['a', '👍🏽', 'b']);
    expect(wrapped('éé', 10, (run) => [...run.normalize('NFC')].length * 10)).toEqual(['é', 'é']);
  });

  it('breaks nothing at a width that is no size', () => {
    for (const width of [0, -5, Number.NaN, Infinity]) expect(wrapBreaks('aaa bbb ccc', width, mono)).toEqual([]);
  });

  it('holds its rule for texts of every kind: each line fits, none could have taken the next word, and nothing but hanging spaces is lost', () => {
    const random = seeded(7);
    const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)]!;
    for (let trial = 0; trial < 400; trial++) {
      const words = Array.from({ length: 1 + Math.floor(random() * 12) }, () => Array.from({ length: 1 + Math.floor(random() * 9) }, () => pick(['m', 'i', 'a', 'w', 'l', 'o'])).join(''));
      const text = words.map((word) => word + pick([' ', ' ', '  ', '\n', '   '])).join('').replace(/\s$/, '');
      const width = 12 + random() * 120;
      const breaks = wrapBreaks(text, width, proportional);
      const lines = linesOf(text, breaks);
      // Breaks rise, lie inside the text, and none stands at a space: a line never begins with what hung on the one before.
      expect(breaks.every((at, index) => at > (breaks[index - 1] ?? 0) && at < text.length && text[at] !== ' ')).toBe(true);
      // Nothing is lost or added but spaces at the breaks.
      expect(lines.join('').replace(/ /g, '')).toBe(text.replace(/[ \n]/g, ''));
      const starts = [0, ...breaks];
      lines.forEach((line) => {
        // A line fits, unless it is one character that is wider than the width by itself. The spaces before a typed line break hang too.
        const shown = line.replace(/ +$/, '');
        expect(proportional(shown) <= width + 1e-3 || [...shown].length === 1).toBe(true);
      });
      // Greedy: what a break sent to the next line would not have fitted on the line before it.
      breaks.forEach((at, index) => {
        const lineStart = Math.max(starts[index]!, text.lastIndexOf('\n', at - 1) + 1);
        const rest = text.slice(at);
        const next = /^\S+/.exec(rest)?.[0] ?? '';
        const whole = text[at - 1] === ' ' || text[at - 1] === '\n';
        // After a space the whole next word did not fit; inside a word not even its next character did.
        expect(proportional(text.slice(lineStart, at).replace(/ +$/, '') + (whole ? ' '.repeat(at - text.slice(0, at).replace(/ +$/, '').length) + next : next[0] ?? ''))).toBeGreaterThan(width);
      });
    }
  });
});

describe('the lines of a text that saved where it breaks', () => {
  it('breaks at the saved places and at typed line breaks, without the spaces that hung', () => {
    expect(linesOf('aaa bbb   ccc', [10])).toEqual(['aaa bbb', 'ccc']);
    expect(linesOf('aaa\nbbb ccc', [8])).toEqual(['aaa', 'bbb', 'ccc']);
    expect(linesOf('aaa bbb', null)).toEqual(['aaa bbb']);
    expect(linesOf('', [])).toEqual(['']);
  });

  it('breaks nothing at a place outside the text, or where a line begins anyway', () => {
    expect(linesOf('aaa\nbbb', [0, 4, 99])).toEqual(['aaa', 'bbb']);
  });
});
