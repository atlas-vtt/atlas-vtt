import {
  cacheFrontmatter, frontmatterBounds, readersAgree,
} from '../../../../src/app/statblocks/notes/frontmatterBounds';
import { mulberry32, pick } from './patchTestKit';

/**
 * Obsidian 1.13.7's two readers, transcribed from its app.js (`getFrontMatterInfo`) and
 * worker.js (the metadata cache's frontmatter tokenizer), as oracles.
 */
function obsidianFrontMatterInfo(text: string): { exists: boolean; from: number; to: number; contentStart: number } {
  const opening = /^---(\r?\n)/g;
  const closing = /---(\r?\n|$)/g;
  if (!opening.exec(text)) return { exists: false, from: 0, to: 0, contentStart: 0 };
  const from = opening.lastIndex;
  closing.lastIndex = from;
  let match = closing.exec(text);
  while (match && text.charAt(match.index - 1) !== '\n') match = closing.exec(text);
  if (!match) return { exists: false, from: 0, to: 0, contentStart: 0 };
  return { exists: true, from, to: match.index, contentStart: closing.lastIndex };
}

function obsidianCacheYaml(text: string): string | null {
  let source = text.replace(/\r\n|\r/g, '\n');
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  if (source.slice(0, 3) !== '---' || source.charAt(3) !== '\n') return null;
  let index = source.indexOf('---', 3);
  while (index !== -1 && source.charAt(index - 1) !== '\n') index = source.indexOf('---', index + 3);
  return index === -1 ? null : source.slice(4, index - 1);
}

describe('frontmatterBounds', () => {
  const cases: Array<[string, string, string | null, string]> = [
    // name, text, YAML text (null: none), body
    ['plain', '---\na: 1\n---\nbody\n', 'a: 1\n', 'body\n'],
    ['CRLF', '---\r\na: 1\r\n---\r\nbody\r\n', 'a: 1\r\n', 'body\r\n'],
    ['no final newline', '---\na: 1\n---\nbody', 'a: 1\n', 'body'],
    ['closing at the end of the text', '---\na: 1\n---', 'a: 1\n', ''],
    ['empty frontmatter', '---\n---', '', ''],
    ['empty frontmatter with a body', '---\n---\nbody', '', 'body'],
    ['no frontmatter', '# Title\n---\n', null, '# Title\n---\n'],
    ['unclosed', '---\na: 1\n', null, '---\na: 1\n'],
    ['`...` does not close', '---\na: 1\n...\nbody\n', null, '---\na: 1\n...\nbody\n'],
    ['`...` before a real closing line', '---\na: 1\n...\n---\nbody', 'a: 1\n...\n', 'body'],
    ['a trailing space does not close', '---\na: 1\n--- \nb: 2\n---\nx', 'a: 1\n--- \nb: 2\n', 'x'],
    ['four dashes do not close', '---\na: 1\n----\n---\n', 'a: 1\n----\n', ''],
    ['opening line with a trailing space', '--- \na: 1\n---\n', null, '--- \na: 1\n---\n'],
    ['opening needs a line break', '---a\n---\n', null, '---a\n---\n'],
    ['a body `---` line after the closing one', '---\na: 1\n---\n---\n', 'a: 1\n', '---\n'],
    ['unicode', '---\nname: Ünïcödé 🐉\n---\nÄ', 'name: Ünïcödé 🐉\n', 'Ä'],
  ];

  it.each(cases)('%s', (_name, text, yaml, body) => {
    const bounds = frontmatterBounds(text);
    expect(bounds.exists).toBe(yaml !== null);
    expect(bounds.bom).toBe(false);
    if (yaml !== null) expect(text.slice(bounds.from, bounds.to)).toBe(yaml);
    expect(text.slice(bounds.contentStart, bounds.contentEnd)).toBe(body);
    expect(bounds.contentEnd).toBe(text.length);
  });

  it('reads past a byte order mark and keeps it in front', () => {
    const text = '﻿---\r\na: 1\r\n---\r\nbody';
    const bounds = frontmatterBounds(text);
    expect(bounds).toEqual({ exists: true, from: 6, to: 12, contentStart: 17, contentEnd: text.length, lineEnding: '\r\n', bom: true });
    expect(frontmatterBounds('﻿body')).toMatchObject({ exists: false, from: 1, to: 1, contentStart: 1, bom: true });
  });

  it('takes the line ending of the opening line, else of the first line', () => {
    expect(frontmatterBounds('---\r\na: 1\n---\n').lineEnding).toBe('\r\n');
    expect(frontmatterBounds('---\na: 1\r\n---\r\n').lineEnding).toBe('\n');
    expect(frontmatterBounds('# Title\r\nbody').lineEnding).toBe('\r\n');
    expect(frontmatterBounds('one line').lineEnding).toBe('\n');
    expect(frontmatterBounds('').lineEnding).toBe('\n');
  });

  it("agrees with Obsidian's getFrontMatterInfo on random texts", () => {
    const random = mulberry32(0x5eed);
    const lines = ['---', '--- ', '----', '...', 'a: 1', '', ' ---', '---x', '# c', '\r', 'b: [1, 2]'];
    const breaks = ['\n', '\r\n', '\r'];
    for (let trial = 0; trial < 4000; trial++) {
      const count = Math.floor(random() * 7);
      let text = '';
      for (let line = 0; line < count; line++) text += pick(random, lines) + (random() < 0.9 ? pick(random, breaks) : '');
      const ours = frontmatterBounds(text);
      const theirs = obsidianFrontMatterInfo(text);
      expect(ours.exists).toBe(theirs.exists);
      if (theirs.exists) expect([ours.from, ours.to, ours.contentStart]).toEqual([theirs.from, theirs.to, theirs.contentStart]);
      expect(cacheFrontmatter(text)).toBe(obsidianCacheYaml(text));
      expect(cacheFrontmatter(`﻿${text}`)).toBe(obsidianCacheYaml(`﻿${text}`));
    }
  });
});

describe('readersAgree', () => {
  it('holds for ordinary notes, with or without frontmatter', () => {
    for (const text of ['---\na: 1\n---\nbody', '---\r\na: 1\r\n---\r\n', '---\n---', 'no frontmatter', '', '﻿---\na: 1\n---\n']) {
      expect(readersAgree(text)).toBe(true);
    }
  });

  it('fails where the metadata cache closes the block earlier or sees one getFrontMatterInfo does not', () => {
    expect(readersAgree('---\na: 1\n--- \nb: 2\n---\n')).toBe(false);
    expect(readersAgree('---\na: 1\n--- \n')).toBe(false);
    expect(readersAgree('---\na: 1\n----\n---\n')).toBe(false);
    expect(readersAgree('---\ra: 1\r---\r')).toBe(false);
  });

  it('fails on a lone carriage return inside the YAML', () => {
    expect(readersAgree('---\na: 1\rb: 2\n---\n')).toBe(false);
  });
});
