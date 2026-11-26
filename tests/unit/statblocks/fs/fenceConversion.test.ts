import { describe, expect, it } from 'vitest';
import { convertFenceText, type FenceConversion } from '../../../../src/app/statblocks/fs/fenceConversion';
import { holdsNothing, sameStatblockValue } from '../../../../src/app/statblocks/fs/fenceValueMatch';
import { findStatblockFences } from '../../../../src/app/statblocks/fs/statblockFences';

const FENCE = '```statblock\nlayout: Marsh layout\nname: Fen hag\nhp: 9\n```\n';
const BEFORE = 'She waits by the water.\r\n\r\n';
const AFTER = '\n## Lair\n\n```js\nconst x = 1;\n```\nThe end, without a newline';

const conversion = (overrides: Partial<FenceConversion> = {}): FenceConversion => ({
  fence: FENCE,
  name: 'Fen hag',
  values: { hp: 9 },
  layout: 'Marsh layout',
  templateId: 'marsh-layout-k7m2qa',
  ...overrides,
});

describe('findStatblockFences', () => {
  it('finds each statblock fence with its place and params, and none inside another code block', () => {
    const text = `${BEFORE}${FENCE}${AFTER}\n\n\`\`\`\`markdown\n\`\`\`statblock\nname: Example\n\`\`\`\n\`\`\`\`\n~~~statblock\nname: [unclosed\n~~~\n`;
    const fences = findStatblockFences(text);
    expect(fences).toHaveLength(2);
    expect(text.slice(fences[0]!.from, fences[0]!.to)).toBe(FENCE);
    expect(fences[0]!.params).toEqual({ layout: 'Marsh layout', name: 'Fen hag', hp: 9 });
    // YAML that cannot be read is a fence all the same.
    expect(fences[1]!.params).toBeNull();
  });

  it('reads an empty fence as one without params, and a fence left open to the end of the note', () => {
    expect(findStatblockFences('```statblock\n```\n')[0]!.params).toEqual({});
    const open = 'Text\n```statblock\nname: Bog\n';
    const [fence] = findStatblockFences(open);
    expect(open.slice(fence!.from, fence!.to)).toBe('```statblock\nname: Bog\n');
  });
});

describe('sameStatblockValue', () => {
  it('reads a number or a switch written as text as that number or switch, and text without the blanks around it', () => {
    for (const [held, fence] of [[3, '3'], ['3.0', 3], [' 14 ', 14], [true, 'True'], ['false', false], ['30 ft. ', '30 ft.'], ['Lurks.\n', 'Lurks.'], [0.25, '0.25']] as const) {
      expect(sameStatblockValue(held, fence), `${String(held)} / ${String(fence)}`).toBe(true);
      expect(sameStatblockValue(fence, held), `${String(fence)} / ${String(held)}`).toBe(true);
    }
  });

  it('keeps apart what says something else', () => {
    for (const [held, fence] of [[14, 'Creature 14'], [0, ''], [0, false], [1, true], ['1', true], ['a', 'A'], [null, ''], [null, 0], [['a'], 'a'], [3, 4]] as const) {
      expect(sameStatblockValue(held, fence), `${String(held)} / ${String(fence)}`).toBe(false);
    }
  });

  it('compares lists item by item in order and maps key by key in any order', () => {
    expect(sameStatblockValue([{ name: 'Claw', bonus: '5' }, 2], [{ bonus: 5, name: 'Claw ' }, '2'])).toBe(true);
    expect(sameStatblockValue(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameStatblockValue(['a'], ['a', 'b'])).toBe(false);
    expect(sameStatblockValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameStatblockValue({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameStatblockValue(null, null)).toBe(true);
  });

  it('knows a property that is there without a value', () => {
    expect([null, '', '  '].map(holdsNothing)).toEqual([true, true, true]);
    expect([0, false, 'x', [], {}].map(holdsNothing)).toEqual([false, false, false, false, false]);
  });
});

describe('convertFenceText', () => {
  it('writes the statblock into the properties, removes the fence and keeps the rest of the body byte for byte', () => {
    const text = `---\ntags: marsh\n---\n${BEFORE}${FENCE}${AFTER}`;
    const result = convertFenceText(text, conversion({ values: { hp: 9, actions: [{ name: 'Claw', desc: 'Rends.' }] } }));
    if ('problem' in result) throw new Error(result.problem);
    expect(result.text).toBe(
      '---\ntags: marsh\nstatblock: true\natlas-template: marsh-layout-k7m2qa\nname: Fen hag\nlayout: Marsh layout\nhp: 9\nactions:\n  - name: Claw\n    desc: Rends.\n---\n'
      + `${BEFORE}${AFTER}`,
    );
  });

  it('gives a note without properties its own, and replaces statblock: inline', () => {
    const bare = convertFenceText(`Text.\n\n${FENCE}`, conversion({ layout: null }));
    expect(bare).toEqual({ text: '---\nstatblock: true\natlas-template: marsh-layout-k7m2qa\nname: Fen hag\nhp: 9\n---\nText.\n\n', applied: expect.any(Array) });
    // The properties take the note's own line endings.
    const windows = convertFenceText(`${BEFORE}${FENCE}`, conversion({ layout: null, values: {} }));
    expect('text' in windows && windows.text).toBe(`---\r\nstatblock: true\r\natlas-template: marsh-layout-k7m2qa\r\nname: Fen hag\r\n---\r\n${BEFORE}`);
    const inline = convertFenceText(`---\nstatblock: inline\n---\n${FENCE}`, conversion({ layout: null }));
    expect('text' in inline && inline.text).toBe('---\nstatblock: true\natlas-template: marsh-layout-k7m2qa\nname: Fen hag\nhp: 9\n---\n');
  });

  it('keeps a value the properties already hold alike, and never writes over one they hold otherwise', () => {
    const same = convertFenceText(`---\nhp: 9\n---\n${FENCE}`, conversion());
    expect('text' in same && same.text).toContain('---\nhp: 9\nstatblock: true\n');
    const text = `---\nhp: 12\nname: Old hag\nstatblock: Marsh layout\n---\n${FENCE}`;
    expect(convertFenceText(text, conversion())).toEqual({ problem: 'The note already holds other values for statblock, name and hp.' });
  });

  it('takes a value written another way for the same value, and leaves the note\'s own spelling', () => {
    const values = { level: 3, speed: '30 ft.', senses: ['darkvision', 'scent'], hidden: 'true', stats: [10, '12'], notes: 'Lurks.\n', empty: 'Filled' };
    const held = 'level: "3"\nspeed: "30 ft. "\nsenses: [darkvision,   scent]\nhidden: true\nstats:\n  - "10"\n  - 12\nnotes: Lurks.\nempty:\n';
    const result = convertFenceText(`---\n${held}---\n${FENCE}`, conversion({ values, layout: null }));
    if ('problem' in result) throw new Error(result.problem);
    // Only the property that held nothing is written; every other line is the note's own.
    expect(result.text).toBe(`---\n${held.replace('empty:\n', 'empty: Filled\n')}statblock: true\natlas-template: marsh-layout-k7m2qa\nname: Fen hag\n---\n`);
    // A number is the same as its text either way round, and so is a name.
    const reversed = convertFenceText(`---\nlevel: 3\nname: "Fen hag "\n---\n${FENCE}`, conversion({ values: { level: ' 3' }, layout: null }));
    expect('text' in reversed && reversed.text).toBe('---\nlevel: 3\nname: "Fen hag "\nstatblock: true\natlas-template: marsh-layout-k7m2qa\n---\n');
  });

  it('says under which keys the note holds other values, where those alone keep it from moving', () => {
    const text = `---\nlevel: 14\nhp: 12\n---\n${FENCE}`;
    expect(convertFenceText(text, conversion({ values: { level: 'Creature 14', hp: 9, ac: 15 } }))).toEqual({
      problem: 'The note already holds other values for level and hp.',
      conflicts: ['level', 'hp'],
    });
    // A list of other items, or in another order, is another value.
    expect(convertFenceText(`---\nsenses: [scent, darkvision]\n---\n${FENCE}`, conversion({ values: { senses: ['darkvision', 'scent'] } })))
      .toEqual({ problem: 'The note already holds other values for senses.', conflicts: ['senses'] });
    // A note that is another kind of statblock is not one the statblock's values settle.
    const marked = convertFenceText(`---\nstatblock: Marsh layout\nhp: 12\n---\n${FENCE}`, conversion());
    expect(marked).toEqual({ problem: 'The note already holds other values for statblock and hp.' });
  });

  it('writes the statblock\'s values over the note\'s only when told to, and leaves every other line as it was', () => {
    const held = '# for Dataview\nlevel: 14\ntags:   [marsh,  hag]\nhp: 12\naliases:\n    - The Hag\n';
    const text = `---\n${held}---\n${BEFORE}${FENCE}${AFTER}`;
    const values = { level: 'Creature 14', hp: 9 };
    expect(convertFenceText(text, conversion({ values }))).toEqual({ problem: expect.any(String), conflicts: ['level', 'hp'] });
    expect(convertFenceText(text, conversion({ values }), { conflicts: 'refuse' })).toEqual({ problem: expect.any(String), conflicts: ['level', 'hp'] });
    const result = convertFenceText(text, conversion({ values }), { conflicts: 'fence' });
    if ('problem' in result) throw new Error(result.problem);
    expect(result.text).toBe(
      `---\n${held.replace('level: 14', 'level: Creature 14').replace('hp: 12', 'hp: 9')}`
      + `statblock: true\natlas-template: marsh-layout-k7m2qa\nname: Fen hag\nlayout: Marsh layout\n---\n${BEFORE}${AFTER}`,
    );
  });

  it('never writes a note whose properties cannot be read, whatever it is told about other values', () => {
    const fence = { conflicts: 'fence' } as const;
    expect(convertFenceText(`---\ntags: [marsh\nhp: 12\n---\n${FENCE}`, conversion(), fence)).toEqual({ problem: expect.stringContaining('YAML error') });
    expect(convertFenceText(`---\nhp: 12\nhp: 13\n---\n${FENCE}`, conversion(), fence)).toEqual({ problem: expect.any(String) });
    // Markers that say the note is another kind of statblock stay a refusal.
    expect(convertFenceText(`---\nstatblock: Marsh layout\nhp: 12\n---\n${FENCE}`, conversion(), fence))
      .toEqual({ problem: 'The note already holds other values for statblock.' });
    expect(convertFenceText(`---\natlas-template: other-a1b2c3\n---\n${FENCE}`, conversion(), fence))
      .toEqual({ problem: 'The note already holds other values for atlas-template.' });
  });

  it('leaves a note with several fences, a fence that changed, or properties Atlas cannot write', () => {
    expect(convertFenceText(`${FENCE}${FENCE}`, conversion())).toEqual({ problem: 'It holds 2 statblocks; only a note with one is moved.' });
    expect(convertFenceText(FENCE.replace('hp: 9', 'hp: 10'), conversion())).toEqual({ problem: 'Its statblock changed while it was being moved.' });
    expect(convertFenceText('No fence.\n', conversion())).toEqual({ problem: 'Its statblock is no longer in the note.' });
    expect(convertFenceText(`---\ntags: [marsh\n---\n${FENCE}`, conversion())).toEqual({ problem: expect.stringContaining('YAML error') });
  });
});
