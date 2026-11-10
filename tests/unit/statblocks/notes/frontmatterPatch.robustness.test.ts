import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { bodyOf, int, mulberry32, pick, readAsObsidian } from './patchTestKit';

/**
 * Arbitrary, often broken, frontmatter: the patcher never throws, and whatever it writes reads
 * back as the patched values with the body intact. It may refuse; it may never write wrong.
 */

const LINES = [
  'a: 1', 'b: [1, 2', 'c: {x: 1}', '? k', ': v', 'd: &x 5', 'e: *x', 'f: *missing', 'g: !!str 5', 'h: |', '  block', 'i: >-',
  '  - item', '- top item', '\tj: tab', 'k: "unclosed', "l: 'it''s'", 'm:', '  n: 2', '    o: 3', '...', '%YAML 1.2', 'p: q: r',
  '# comment', '', '  ', 'r: value # c', 's: [a, {b: c}]', 't: "a\\nb"', 'a: 2', 'u: 2024-01-01', 'v: ~', '<<: *x', 'w: @x',
];

function brokenNote(random: () => number): string {
  const eol = pick(random, ['\n', '\r\n']);
  const yaml = Array.from({ length: int(random, 7) }, () => pick(random, LINES)).map((line) => line + eol).join('');
  return `---${eol}${yaml}---${eol}Body${eol}`;
}

function readable(text: string): Record<string, FieldValue> | null {
  try {
    return readAsObsidian(text);
  } catch {
    return null;
  }
}

describe('applyFrontmatterPatches on arbitrary frontmatter', () => {
  it('never throws and never writes what does not read back', () => {
    const random = mulberry32(4242);
    let written = 0;
    for (let trial = 0; trial < 3000; trial++) {
      const text = brokenNote(random);
      const before = readable(text);
      const key = pick(random, ['a', 'b', 'm', 'new key']);
      const patches: NotePatch[] = [{ op: 'set', path: [key], base: before?.[key], next: 'patched' }];
      const result = applyFrontmatterPatches(text, patches);
      expect(result.applied.length + result.conflicts.length).toBe(1);
      if (result.text === text) continue;
      written++;
      expect(before).not.toBeNull();
      expect(readAsObsidian(result.text)).toEqual({ ...before, [key]: 'patched' });
      expect(bodyOf(result.text)).toBe(bodyOf(text));
    }
    expect(written).toBeGreaterThan(300);
  });
});
