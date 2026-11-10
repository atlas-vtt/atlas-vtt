import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { int, mulberry32, patched, pick, readAsObsidian } from './patchTestKit';

/**
 * List identity under reordering: patches made against one order of a list are applied to
 * a note where the list was reordered (and sometimes edited) meanwhile.
 */

interface Action { name: string; desc: string }

const CASES = 1500;
const DESCS = ['Bites', 'Claws', 'Stings', 'Roars', 'Bites'];

function actionsNote(actions: readonly Action[], eol: string): string {
  const lines = ['---', 'name: Beast', 'actions:', ...actions.flatMap((action) => [`  - name: ${action.name}`, `    desc: ${action.desc}`]), 'hp: 7', '---', 'Body'];
  return lines.join(eol) + eol;
}

function shuffled<T>(random: () => number, items: readonly T[]): T[] {
  return items.map((item) => ({ item, order: random() })).sort((a, b) => a.order - b.order).map(({ item }) => item);
}

function readActions(text: string): Action[] {
  return readAsObsidian(text).actions as unknown as Action[];
}

describe('list identity under reordering', () => {
  it('index paths write only into an entry that held the base, and into the right one when it is unique', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const random = mulberry32(seed);
      const count = 2 + int(random, 4);
      const original = Array.from({ length: count }, (_, index) => ({ name: `A${index}`, desc: pick(random, DESCS) }));
      const index = int(random, count);
      const target = original[index] as Action;
      const patch: NotePatch = { op: 'set', path: ['actions', index, 'desc'], base: target.desc, next: 'Edited' };
      const reordered = shuffled(random, original);
      const text = actionsNote(reordered, pick(random, ['\n', '\r\n']));
      const result = patched(text, [patch]);
      const after = readActions(result.text);

      const holders = reordered.filter((action) => action.desc === target.desc);
      const atIndex = reordered[index];
      const written = after.filter((action, i) => action.desc !== reordered[i]?.desc);
      if (atIndex?.desc === target.desc) {
        expect(written).toEqual([{ name: atIndex.name, desc: 'Edited' }]);
      } else if (holders.length === 1) {
        expect(written).toEqual([{ name: target.name, desc: 'Edited' }]);
      } else {
        expect(result.conflicts).toEqual([patch]);
        expect(result.text).toBe(text);
      }
      for (const entry of written) expect(reordered.find((action) => action.name === entry.name)?.desc).toBe(target.desc);
    }
  });

  it('remove, move and insert find items by value wherever they went', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const random = mulberry32(seed);
      const original: Action[] = Array.from({ length: 2 + int(random, 4) }, (_, index) => ({ name: `A${index}`, desc: `D${index}` }));
      const reordered = shuffled(random, original);
      const text = actionsNote(reordered, '\n');
      const item = pick(random, original);
      const other = pick(random, original.filter((action) => action !== item));
      const fresh = { name: 'New', desc: 'Fresh' };
      const kind = pick(random, ['remove', 'move', 'insert']);
      const patch: NotePatch = kind === 'remove'
        ? { op: 'remove', list: 'actions', item: toValue(item) }
        : kind === 'move'
          ? { op: 'move', list: 'actions', item: toValue(item), after: toValue(other) }
          : { op: 'insert', list: 'actions', after: toValue(item), item: fresh };
      const names = readActions(patched(text, [patch]).text).map((action) => action.name);
      const before = reordered.map((action) => action.name);
      if (kind === 'remove') expect(names).toEqual(before.filter((name) => name !== item.name));
      if (kind === 'move') {
        const rest = before.filter((name) => name !== item.name);
        rest.splice(rest.indexOf(other.name) + 1, 0, item.name);
        expect(names).toEqual(rest);
      }
      if (kind === 'insert') expect(names).toEqual(before.flatMap((name) => (name === item.name ? [name, 'New'] : [name])));
    }
  });

  it('an item edited meanwhile is never matched, so nothing is written', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const random = mulberry32(seed);
      const original: Action[] = Array.from({ length: 2 + int(random, 4) }, (_, index) => ({ name: `A${index}`, desc: `D${index}` }));
      const item = pick(random, original);
      const edited = original.map((action) => (action === item ? { ...action, desc: `${action.desc} (changed)` } : action));
      const text = actionsNote(shuffled(random, edited), '\n');
      const patches: NotePatch[] = [
        { op: 'move', list: 'actions', item: toValue(item), after: null },
        { op: 'set', path: ['actions', original.indexOf(item)], base: toValue(item), next: { name: 'X', desc: 'Y' } },
        { op: 'delete', path: ['actions', original.indexOf(item)], base: toValue(item) },
      ];
      expect(patched(text, patches)).toEqual({ text, applied: [], conflicts: patches });
    }
  });
});

function toValue(action: Action): FieldValue {
  return { name: action.name, desc: action.desc };
}
