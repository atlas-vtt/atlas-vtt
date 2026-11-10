import { describe, expect, it } from 'vitest';
import { convertFenceText, type FenceConversion } from '../../../../src/app/statblocks/fs/fenceConversion';
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

  it('leaves a note with several fences, a fence that changed, or properties Atlas cannot write', () => {
    expect(convertFenceText(`${FENCE}${FENCE}`, conversion())).toEqual({ problem: 'It holds 2 statblocks; only a note with one is moved.' });
    expect(convertFenceText(FENCE.replace('hp: 9', 'hp: 10'), conversion())).toEqual({ problem: 'Its statblock changed while it was being moved.' });
    expect(convertFenceText('No fence.\n', conversion())).toEqual({ problem: 'Its statblock is no longer in the note.' });
    expect(convertFenceText(`---\ntags: [marsh\n---\n${FENCE}`, conversion())).toEqual({ problem: expect.stringContaining('YAML error') });
  });
});
