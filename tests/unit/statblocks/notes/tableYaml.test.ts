import { describe, expect, it } from 'vitest';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';

const NOTE = '---\nstatblock: true\nname: Bog Hag\n---\nBody.\n';

describe('a Table written into a note', () => {
  it('writes its rows one per line, each a short list', () => {
    const { text } = applyFrontmatterPatches(NOTE, [{ op: 'set', path: ['loot'], base: undefined, next: [['Rope', 1], ['Torch', null, '1 cp'], []] }]);
    expect(text).toBe('---\nstatblock: true\nname: Bog Hag\nloot:\n  - [Rope, 1]\n  - [Torch, null, 1 cp]\n  - []\n---\nBody.\n');
  });

  it('writes the names of a statblock\'s own columns over its rows', () => {
    const { text } = applyFrontmatterPatches(NOTE, [{ op: 'set', path: ['loot'], base: undefined, next: { columns: ['Item', 'Qty', ''], rows: [['Rope', 1]] } }]);
    expect(text).toBe('---\nstatblock: true\nname: Bog Hag\nloot:\n  columns: [Item, Qty, ""]\n  rows:\n    - [Rope, 1]\n---\nBody.\n');
  });

  it('keeps a row of ability scores in the flow list it was written as', () => {
    const { text } = applyFrontmatterPatches('---\nstats: [14, 12, 13]\n---\n', [{ op: 'set', path: ['stats'], base: [14, 12, 13], next: [14, 16, 13] }]);
    expect(text).toBe('---\nstats: [14, 16, 13]\n---\n');
  });
});
