import { describe, expect, it } from 'vitest';
import { creaturesByNote } from '../../src/app/creatures/linkedCreature';

const NOTES = new Set(['Bestiary/Goblin Boss.md', 'Bestiary/Orc.md']);
const isNote = (path: string): boolean => NOTES.has(path);
const names = (byPath: ReadonlyMap<string, { name: string }>): string[] => [...byPath.values()].map((creature) => creature.name).sort();

describe('creaturesByNote', () => {
  it('drops the entry Fantasy Statblocks keeps under a renamed note\'s old path', () => {
    const byPath = creaturesByNote([
      { name: 'Goblin', path: 'Bestiary/Goblin.md' },
      { name: 'Goblin Boss', path: 'Bestiary/Goblin Boss.md' },
      { name: 'Orc', path: 'Bestiary/Orc.md' },
    ], isNote);
    expect(names(byPath)).toEqual(['Goblin Boss', 'Orc']);
  });

  it('keeps of two entries on one note the one named like the note, in either order', () => {
    const current = { name: 'Goblin Boss', path: 'Bestiary/Goblin Boss.md', cr: 1 };
    const stale = { name: 'Goblin', path: 'Bestiary/Goblin Boss.md', cr: 0.25 };
    expect(creaturesByNote([current, stale], isNote).get(current.path)).toBe(current);
    expect(creaturesByNote([stale, current], isNote).get(current.path)).toBe(current);
  });

  it('never asks the vault about a creature without a note', () => {
    const asked: string[] = [];
    const byPath = creaturesByNote([{ name: 'Ancient Red Dragon' }, { name: 'Orc', path: 'Bestiary/Orc.md' }], (path) => {
      asked.push(path);
      return isNote(path);
    });
    expect(asked).toEqual(['Bestiary/Orc.md']);
    expect(names(byPath)).toEqual(['Orc']);
  });
});
