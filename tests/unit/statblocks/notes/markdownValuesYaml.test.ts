import { describe, expect, it } from 'vitest';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { readAsObsidian, set } from './patchTestKit';

const NOTE = '---\nstatblock: true\nsenses: old\n---\nBody\n';

/** Markdown typed into a statblock's fields, as the note stores it. */
describe('Markdown values in frontmatter', () => {
  it('writes a link quoted, so Obsidian reads it as a link and not as a list, and reads it back as typed', () => {
    const { text } = applyFrontmatterPatches(NOTE, [set(['senses'], 'old', '[[Senses/Scent|scent]]')]);
    expect(text).toContain('senses: "[[Senses/Scent|scent]]"\n');
    expect(readAsObsidian(text).senses).toBe('[[Senses/Scent|scent]]');
  });

  it('writes marks at the start quoted and marks inside plain, each reading back as typed', () => {
    for (const value of ['**Keen** smell', '*keen*', 'keen **smell**', '`code`', '~~old~~ new', '==mark==', 'see [[Grappled]] and [[Prone]]']) {
      const { text, conflicts } = applyFrontmatterPatches(NOTE, [set(['senses'], 'old', value)]);
      expect(conflicts).toEqual([]);
      expect(readAsObsidian(text).senses, value).toBe(value);
    }
  });

  it("keeps a link in a table's row and an ability's text", () => {
    const { text } = applyFrontmatterPatches(NOTE, [
      set(['gear'], undefined, [['[[Longsword]]', '1d8 **slashing**'], ['Rope', 1]]),
      set(['actions'], undefined, [{ name: '[[Claws]]', desc: 'It *rends*. See [[Grappled]].' }]),
    ]);
    expect(text).toContain('- ["[[Longsword]]", 1d8 **slashing**]');
    const read = readAsObsidian(text);
    expect(read.gear).toEqual([['[[Longsword]]', '1d8 **slashing**'], ['Rope', 1]]);
    expect(read.actions).toEqual([{ name: '[[Claws]]', desc: 'It *rends*. See [[Grappled]].' }]);
  });
});
