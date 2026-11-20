import '../setup/obsidianDom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import css from '../../styles/main.scss?inline';
import { lineStarts } from '../../src/app/annotations/textWrap';

const style = document.createElement('style');
style.textContent = css;

/**
 * Where Chromium may break `text` in the field a map text is typed in. A text field's lines cannot
 * be asked for, so its twin is asked: a box with the styles the browser worked out for a real
 * field of the field's classes, too narrow for any two letters, and with the breaking inside
 * words that the field falls back on switched off. Every line that begins there is one the
 * browser chose to begin.
 */
function fieldStarts(text: string): number[] {
  const root = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-map-text-field atlas-map-text-field--wraps' });
  root.setCssProps({ '--atlas-text-field-font': '20px monospace', '--atlas-text-field-line': '1.2em', '--atlas-text-field-width': '1px', '--atlas-text-field-height': '4000px', '--atlas-text-field-room': '0px', '--atlas-text-field-shift': '0px' });
  const field = root.createEl('textarea', { cls: 'atlas-map-text-field__input' });
  const twin = root.createDiv();
  const made = getComputedStyle(field);
  for (const property of ['font', 'line-height', 'letter-spacing', 'white-space', 'word-break', 'line-break', 'hyphens', 'width', 'text-align']) twin.style.setProperty(property, made.getPropertyValue(property));
  twin.style.overflowWrap = 'normal';
  twin.textContent = text;
  const range = document.createRange();
  const starts: number[] = [];
  let top = Number.NaN;
  for (let i = 0; i < text.length; i++) {
    range.setStart(twin.firstChild!, i);
    range.setEnd(twin.firstChild!, i + 1);
    const rect = [...range.getClientRects()].pop();
    if (!rect || rect.height === 0) continue;
    if (rect.top > top + 2) starts.push(i);
    if (!(rect.top <= top + 2)) top = rect.top;
  }
  root.remove();
  return starts.filter((index) => index > 0 && text[index] !== ' ');
}

/** Texts whose lines the rule begins exactly where the field does. */
const SAME = [
  // Spaces, and a slash: no line begins after one, in a path or a fraction either.
  'ab cd', 'and/or', 'yes/no', 'a/b/c', 'http://ex.com/a/b', '1/2', 'km/h', '/x', 'x/ y', 'a//b',
  // The letters of every script stay together: ideographs, kana, Hangul, full-width letters, and beside Latin ones.
  '\u5730\u4e0b\u57ce\u7684\u5165\u53e3', '\u3072\u3089\u304c\u306a\u30ab\u30bf\u30ab\u30ca', '\ud55c\uad6d\uc5b4 \ud14d\uc2a4\ud2b8', '\uff21\uff22\uff23', 'abc\u5730\u4e0b\u57cedef', '\u5730\u4e0bab', '\u30ab\u30bf\u30ab\u30ca\u30fc\u30eb',
  // Marks inside a word.
  'a.b', 'a,b', 'a;b', 'a:b', 'a?b', 'a!b', '(a)b', 'a(b)', 'a|b', 'a\\b', 'a_b', 'a+b', 'a=b', 'a&b', 'a%b', '100%b', 'a@b.c', 'e.g.this', 'a\u2026b', 'a\u00b7b', "don't",
  '$5', '5$', '50\u00b0', '#1', 'a*b', 'a~b', 'a^b', 'a<b>c', 'a[b]c', 'a{b}c', '"a"b', '5,000', '3.5', '1:2', 'a}b', '\u00bfQu\u00e9?',
  // Hyphens and dashes.
  'a\u2013b', 'a\u2014b', 'a-b', 'a--b', '-5', '10-20', 'A-17', 'x- y', 'a\u2010b', 'a\u2011b', 'a\u2012b', 'a\u2015b', 'a\u2212b',
  // Spaces a keyboard does not type, and the soft hyphen.
  'a\u00adb', 'a\u200bb', 'a\u00a0b', 'a\u3000b', 'a\u2009b',
];

/** More of the same, found by asking: marks before letters with accents, ideographs with their marks and brackets, pictures. */
const SAME_TOO = [
  'a?\u00e9', 'a!\u00e9', 'a\u2026 b', 'a\u20261', 'a\u2026.', 'a\u2026\u2026b', '\u2026b', 'a\u2026(', 'a.\u00e9', 'a-\u00e9', 'a-\u5730', '\u5730-a', '\u5730(a)', '(\u5730)\u4e0b',
  '\u6d1e\u7a9f\u3001\u5165\u53e3\u3002\u5b9d', '\u6d1e\u3001\u3002\u5b9d', '\u6d1e\u3001a', 'a\u3001b', '\u6d1e\uff0c\u5b9d', '\u6d1e\uff01\u5b9d', '\u6d1e\uff1f\u5b9d', '\u300c\u6d1e\u300d\u5b9d', '\u5b9d\u300c\u6d1e\u300d', '\u6d1e\uff09\u5b9d', '\u6d1e\uff08\u5b9d\uff09', '\u6d1e\u30fb\u5b9d', '\u6d1e\u3001 \u5b9d', '\u6d1e\uff1a\u5b9d', '\u6d1e\uff1b\u5b9d',
  'emoji\ud83d\ude00\ud83d\ude00end', 'a\ud83d\ude00', '\ud83d\ude00a', '\ud83d\ude00\ud83d\ude00', '\ud83d\ude00.', '(\ud83d\ude00)', '\ud83d\ude00 a', '1\ud83d\ude00', '\u2764\ufe0fa', 'a\u2764\ufe0f', '\ud83d\udc4d\ud83c\udffd\ud83d\udc4d', '\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67a',
  'a\u2002b', 'a\u2007b', 'a\u202fb', 'a\u1680b', 'a\u200a b', 'a\u00ad-b', 'a\u3000\u3000b',
];

/**
 * What stays different, with where the field begins a line and the rule does not: Thai (and Lao,
 * Khmer, Burmese) words are told apart by a dictionary the browser has. A line of such a text
 * that is full breaks where its width ends, as a word too long for its line does.
 */
const DIFFERENT: readonly (readonly [string, number[]])[] = [
  ['\u0e44\u0e17\u0e22\u0e20\u0e32\u0e29\u0e32', [3]],
];

const escaped = (text: string): string => [...text].map((character) => (character >= ' ' && character <= '~' ? character : `\\u{${character.codePointAt(0)!.toString(16)}}`)).join('');

describe('where the field a map text is typed in may break a line', () => {
  beforeAll(() => { document.head.append(style); });
  afterAll(() => { style.remove(); });

  it('is where the rule begins a line, for what is written on maps', () => {
    for (const text of [...SAME, ...SAME_TOO]) expect(lineStarts(text), escaped(text)).toEqual(fieldStarts(text));
  });

  it('is elsewhere only for the scripts whose words a dictionary tells apart', () => {
    for (const [text, starts] of DIFFERENT) {
      expect(fieldStarts(text), escaped(text)).toEqual(starts);
      expect(lineStarts(text), escaped(text)).toEqual([]);
    }
  });

  it('is where the rule begins one between any two characters a keyboard types', () => {
    const differing: string[] = [];
    for (const lead of ['a', '1', ' ', '-']) {
      for (let one = 0x21; one < 0x7f; one++) {
        for (let two = 0x21; two < 0x7f; two++) {
          const text = lead + String.fromCharCode(one, two);
          if (fieldStarts(text).includes(2) !== lineStarts(text).includes(2)) differing.push(text);
        }
      }
    }
    expect(differing).toEqual([]);
  });
});
