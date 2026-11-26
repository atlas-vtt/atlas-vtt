import { describe, expect, it } from 'vitest';
import { plainAbilityName } from '../../src/app/online/gm/book/abilityLinks';
import { headingTitle } from '../../src/app/utils/pathUtils';

/**
 * Two rules were written with regex lookbehinds, which Obsidian's review rejects for a plugin that
 * runs on mobile. They are written without now; the lookbehind forms stay here as what they must
 * still answer.
 */
const OLD_EMPHASIS = /(?<![\p{L}\p{N}\\])(\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;
function oldPlainName(text: string): string {
  let plain = text;
  for (let previous = ''; previous !== plain;) [previous, plain] = [plain, plain.replace(OLD_EMPHASIS, '$2')];
  return plain.replace(/\s+/g, ' ').trim();
}
const oldHeadingTitle = (heading: string): string => heading.replace(/#+$/, '').replace(/(?<=\S)#(?=\S)/g, ' > ');

/** Texts of `length` characters from `alphabet`, the same on every run. */
function samples(alphabet: string, count: number, length: number): string[] {
  let seed = 12345;
  const next = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  return Array.from({ length: count }, () => Array.from({ length: 1 + (next() % length) }, () => alphabet[next() % alphabet.length]).join(''));
}

describe('rules once written with lookbehinds', () => {
  it('leave out emphasis as before: marks inside words open nothing, and neighbours without a space both give way', () => {
    const named = ['**Bold**', '_x_', 'a*b *c*', '**Bold**_italic_', 'snake_case_name', '2*3*4', '\\*kept\\*', '* not *', '***both***', '__a__ and *b*', '*a**b*', 'é*x*', '😀*x*', '*a* *b*'];
    for (const text of [...named, ...samples('*_ ab1\\', 4000, 14)]) expect(plainAbilityName(text), text).toBe(oldPlainName(text));
  });

  it('read a heading path as before', () => {
    const named = ['Stag#Overview#', 'Room #3', 'a##b', '#a', 'a#b#c', 'a# b', ''];
    for (const text of [...named, ...samples('# ab', 2000, 10)]) expect(headingTitle(text), text).toBe(oldHeadingTitle(text));
  });
});
