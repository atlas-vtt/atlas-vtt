import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { patched, readAsObsidian, set } from './patchTestKit';

/** The S1 edge-case table: each note format keeps every byte a patch does not change. */

describe('line endings, byte order mark and the closing line', () => {
  it('keeps CRLF line endings and writes new lines with them', () => {
    const text = '---\r\nname: Goblin\r\nhp: 7\r\n---\r\nBody\r\n';
    const result = patched(text, [set(['hp'], 7, 12), set(['ac'], undefined, 15)]);
    expect(result.text).toBe('---\r\nname: Goblin\r\nhp: 12\r\nac: 15\r\n---\r\nBody\r\n');
    expect(result.conflicts).toEqual([]);
  });

  it('keeps a byte order mark in front', () => {
    const result = patched('﻿---\nhp: 7\n---\nBody', [set(['hp'], 7, 8)]);
    expect(result.text).toBe('﻿---\nhp: 8\n---\nBody');
  });

  it('writes into a note without a final newline', () => {
    expect(patched('---\nhp: 7\n---\nBody', [set(['hp'], 7, 8)]).text).toBe('---\nhp: 8\n---\nBody');
  });

  it('writes into a note that ends with its closing line', () => {
    expect(patched('---\nhp: 7\n---', [set(['hp'], 7, 8), set(['ac'], undefined, 12)]).text).toBe('---\nhp: 8\nac: 12\n---');
  });

  it('fills an empty frontmatter', () => {
    expect(patched('---\n---\nBody', [set(['hp'], undefined, 8)]).text).toBe('---\nhp: 8\n---\nBody');
    expect(patched('---\n---', [set(['hp'], undefined, 8)]).text).toBe('---\nhp: 8\n---');
  });

  it('adds a frontmatter to a note without one, in its line endings and after its byte order mark', () => {
    expect(patched('# Goblin\n', [set(['statblock'], undefined, true)]).text).toBe('---\nstatblock: true\n---\n# Goblin\n');
    expect(patched('# Goblin\r\n', [set(['hp'], undefined, 7)]).text).toBe('---\r\nhp: 7\r\n---\r\n# Goblin\r\n');
    expect(patched('﻿Body', [set(['hp'], undefined, 7)]).text).toBe('﻿---\nhp: 7\n---\nBody');
    expect(patched('', [set(['hp'], undefined, 7)]).text).toBe('---\nhp: 7\n---\n');
    expect(patched('---\nnot closed\n', [set(['hp'], undefined, 7)]).text).toBe('---\nhp: 7\n---\n---\nnot closed\n');
  });

  it('adds no frontmatter when nothing is written', () => {
    const result = patched('Body', [{ op: 'delete', path: ['hp'], base: 7 }]);
    expect(result).toEqual({ text: 'Body', applied: [{ op: 'delete', path: ['hp'], base: 7 }], conflicts: [] });
  });

  it('puts a new key before a `...` end marker', () => {
    expect(patched('---\na: 1\n...\n---\n', [set(['b'], undefined, 2)]).text).toBe('---\na: 1\nb: 2\n...\n---\n');
  });

  it('leaves a body that holds `---` lines alone', () => {
    const text = '---\nhp: 7\n---\nIntro\n---\nhp: 99\n---\n';
    expect(patched(text, [set(['hp'], 7, 8)]).text).toBe('---\nhp: 8\n---\nIntro\n---\nhp: 99\n---\n');
  });
});

describe('notes Atlas never writes into', () => {
  const refusedFor = (text: string): void => {
    const patches: NotePatch[] = [set(['hp'], 7, 8), set(['new'], undefined, 1), { op: 'delete', path: ['nothing'], base: 1 }];
    expect(patched(text, patches)).toEqual({ text, applied: [], conflicts: patches });
  };

  it('refuses duplicate keys', () => refusedFor('---\nhp: 7\nname: A\nhp: 7\n---\n'));
  it('refuses keys that read as the same string', () => refusedFor('---\nhp: 7\n1: a\n"1": b\n---\n'));
  it('refuses YAML with errors', () => refusedFor('---\nhp: 7\nname: [unclosed\n---\n'));
  it('refuses a frontmatter that is not a map', () => refusedFor('---\n- hp\n- 7\n---\n'));
  it('refuses a flow map at the top level', () => refusedFor('---\n{hp: 7}\n---\n'));
  it('refuses a second document', () => refusedFor('---\nhp: 7\n...\nname: A\n---\n'));
  it('refuses a closing line the two readers see differently', () => refusedFor('---\nhp: 7\n--- \nname: A\n---\n'));
  it('refuses complex keys', () => refusedFor('---\nhp: 7\n[a, b]: c\n---\n'));
  it('refuses a `__proto__` key', () => refusedFor('---\nhp: 7\n__proto__: x\n---\n'));
  it('refuses lone carriage returns', () => refusedFor('---\nhp: 7\rname: A\n---\n'));
});

describe('comments, anchors and quoting', () => {
  it('keeps comments, including one after the value it changes', () => {
    const text = '---\n# Monster\nname: Goblin # the boss\n# stats follow\nhp: 7\n---\n';
    expect(patched(text, [set(['name'], 'Goblin', 'Hobgoblin')]).text)
      .toBe('---\n# Monster\nname: Hobgoblin # the boss\n# stats follow\nhp: 7\n---\n');
    expect(patched('---\nhp: # unknown\nac: 1\n---\n', [set(['hp'], null, 7)]).text).toBe('---\nhp: 7 # unknown\nac: 1\n---\n');
  });

  it('keeps anchors and aliases elsewhere, and will not change an aliased value', () => {
    const text = '---\nbase: &b 5\nother: *b\nhp: 7\n---\n';
    expect(patched(text, [set(['hp'], 7, 8)]).text).toBe('---\nbase: &b 5\nother: *b\nhp: 8\n---\n');
    expect(patched(text, [set(['other'], 5, 6)]).text).toBe('---\nbase: &b 5\nother: 6\nhp: 7\n---\n');
    const aliased = patched(text, [set(['base'], 5, 6)]);
    expect(aliased.text).toBe(text);
    expect(aliased.conflicts).toHaveLength(1);
  });

  it('keeps the quoting of the string it replaces', () => {
    const text = "---\ncr: \"1/4\"\nsize: 'Small'\ntype: humanoid\n---\n";
    expect(patched(text, [set(['cr'], '1/4', '1/2'), set(['size'], 'Small', 'Medium'), set(['type'], 'humanoid', 'beast')]).text)
      .toBe("---\ncr: \"1/2\"\nsize: 'Medium'\ntype: beast\n---\n");
  });

  it('tells numbers from numeric strings', () => {
    const text = '---\nlevel: "5"\n---\n';
    expect(patched(text, [set(['level'], 5, 6)]).conflicts).toHaveLength(1);
    expect(patched(text, [set(['level'], '5', '6')]).text).toBe('---\nlevel: "6"\n---\n');
    expect(patched(text, [set(['level'], '5', 6)]).text).toBe('---\nlevel: 6\n---\n');
    expect(patched('---\nlevel: 5\n---\n', [set(['level'], 5, '6')]).text).toBe('---\nlevel: "6"\n---\n');
  });

  it('quotes strings that would read as something else', () => {
    const strings = ['yes', 'on', 'No', 'true', 'null', '~', '', '2024-01-01', '1:30', '1_000', '0x1F', '1e3', '.5', '+1', '007',
      'a: b', '#hash', 'a #b', '- item', '[x]', '{x}', '*ref', '&anchor', '!tag', '|', '>', '%', '@at', '`tick', "'", '"', ' lead', 'trail '];
    for (const value of strings) {
      const result = patched('---\nx: 1\n---\n', [set(['x'], 1, value)]);
      expect(readAsObsidian(result.text)).toEqual({ x: value });
      expect(result.text).toMatch(/^---\nx: ["'][^\n]*["']\n---\n$/);
    }
  });

  it('writes plain what reads back the same everywhere', () => {
    for (const value of ['Goblin', '1/4', '3+1*', '7d10 + 14', 'Ünïcödé 🐉', 'a:b', '30 ft.']) {
      expect(patched('---\nx: 1\n---\n', [set(['x'], 1, value)]).text).toBe(`---\nx: ${value}\n---\n`);
    }
  });

  it('quotes keys that need it', () => {
    const result = patched('---\na: 1\n---\n', [set(['b: c'], undefined, 1), set(['2'], undefined, 2), set(['yes'], undefined, 3), set(['atlas-template'], undefined, 'x')]);
    expect(result.text).toBe('---\na: 1\n"b: c": 1\n"2": 2\n"yes": 3\natlas-template: x\n---\n');
    expect(readAsObsidian(result.text)).toEqual({ a: 1, 'b: c': 1, 2: 2, yes: 3, 'atlas-template': 'x' });
  });

  it('writes a null value as an empty one', () => {
    expect(patched('---\na: 1\n---\n', [set(['a'], 1, null), set(['b'], undefined, null)]).text).toBe('---\na:\nb:\n---\n');
  });
});

describe('flow style', () => {
  it('replaces one element of a flow sequence in place', () => {
    expect(patched('---\nstats: [18, 8, 15]\n---\n', [set(['stats', 1], 8, 9)]).text).toBe('---\nstats: [18, 9, 15]\n---\n');
    expect(patched('---\nstats: [ 18, 8, 15 ]\n---\n', [set(['stats', 1], 8, 9)]).text).toBe('---\nstats: [ 18, 9, 15 ]\n---\n');
  });

  it('writes a whole flow sequence without padding', () => {
    expect(patched('---\nstats: [ 18, 8, 15 ]\n---\n', [set(['stats'], [18, 8, 15], [10, 11, 12])]).text)
      .toBe('---\nstats: [10, 11, 12]\n---\n');
  });

  it('rewrites a flow collection whose entries change', () => {
    const text = '---\nspeed: {walk: 30, fly: 60}\ntags: [a, "b, c"]\n---\n';
    const result = patched(text, [
      set(['speed', 'swim'], undefined, 20),
      { op: 'insert', list: 'tags', after: 'a', item: 'd' },
      { op: 'delete', path: ['speed', 'fly'], base: 60 },
    ]);
    expect(result.text).toBe('---\nspeed: {walk: 30, swim: 20}\ntags: [a, d, "b, c"]\n---\n');
  });

  it('quotes for the flow context', () => {
    expect(patched('---\ntags: [a, b]\n---\n', [set(['tags', 1], 'b', 'x, y')]).text).toBe('---\ntags: [a, "x, y"]\n---\n');
  });
});

describe('block styles, long lines and indentation', () => {
  it('keeps a literal block scalar literal', () => {
    const text = '---\ndesc: |\n  line one\n  line two\nhp: 7\n---\n';
    expect(patched(text, [set(['desc'], 'line one\nline two\n', 'new text')]).text).toBe('---\ndesc: |-\n  new text\nhp: 7\n---\n');
    expect(patched(text, [set(['hp'], 7, 8)]).text).toBe('---\ndesc: |\n  line one\n  line two\nhp: 8\n---\n');
  });

  it('writes a multi-line string as a literal block', () => {
    const result = patched('---\ndesc: short\nhp: 7\n---\n', [set(['desc'], 'short', 'one\ntwo')]);
    expect(result.text).toBe('---\ndesc: |-\n  one\n  two\nhp: 7\n---\n');
  });

  it('never folds a long plain scalar', () => {
    const long = `${'word '.repeat(30)}end`;
    const text = `---\ndesc: ${long}\nhp: 7\n---\n`;
    expect(patched(text, [set(['hp'], 7, 8)]).text).toBe(`---\ndesc: ${long}\nhp: 8\n---\n`);
    const longer = `${'more '.repeat(40)}end`;
    expect(patched(text, [set(['desc'], long, longer)]).text).toBe(`---\ndesc: ${longer}\nhp: 7\n---\n`);
  });

  it('writes new list items and keys in the note’s 4-space indentation', () => {
    const text = '---\nactions:\n    - name: Bite\n      desc: Ouch\nhp: 7\n---\n';
    const result = patched(text, [
      { op: 'insert', list: 'actions', after: { name: 'Bite', desc: 'Ouch' }, item: { name: 'Claw', desc: 'Scratch', tags: ['a'] } },
      set(['senses'], undefined, ['darkvision 60 ft.']),
    ]);
    expect(result.text).toBe(
      '---\nactions:\n    - name: Bite\n      desc: Ouch\n    - name: Claw\n      desc: Scratch\n      tags:\n          - a\nhp: 7\nsenses:\n    - darkvision 60 ft.\n---\n',
    );
  });

  it('writes into a list flush with its key', () => {
    const text = '---\ntags:\n- a\n- b\n---\n';
    expect(patched(text, [{ op: 'insert', list: 'tags', after: 'b', item: 'c' }]).text).toBe('---\ntags:\n- a\n- b\n- c\n---\n');
    expect(patched(text, [set(['other'], undefined, ['x'])]).text).toBe('---\ntags:\n- a\n- b\nother:\n- x\n---\n');
  });

  it('keeps CRLF inside written values and reads Windows line endings in strings back', () => {
    const text = '---\r\ndesc: |\r\n  one\r\n  two\r\nhp: 7\r\n---\r\n';
    const result = patched(text, [set(['desc'], 'one\ntwo\n', 'three\nfour'), set(['note'], undefined, 'a\r\nb')]);
    expect(result.text).toBe('---\r\ndesc: |-\r\n  three\r\n  four\r\nhp: 7\r\nnote: "a\\r\\nb"\r\n---\r\n');
    expect(readAsObsidian(result.text)).toEqual({ desc: 'three\nfour', hp: 7, note: 'a\r\nb' });
  });

  it('writes unicode keys and values as they are', () => {
    const text = '---\nnäme: Ünïcödé\n---\nÄ';
    expect(patched(text, [set(['näme'], 'Ünïcödé', 'Drache 🐉'), set(['größe'], undefined, 'groß')]).text)
      .toBe('---\nnäme: Drache 🐉\ngröße: groß\n---\nÄ');
  });
});
