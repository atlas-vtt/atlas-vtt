import { describe, expect, it } from 'vitest';
import { AUTHORABLE_BLOCK_TYPES } from '../../../../src/app/statblocks/model/blockCatalogue';
import { blockIdSource } from '../../../../src/app/statblocks/model/templateIds';
import type { TreeEdit } from '../../../../src/app/statblocks/model/treeEdit';
import { putSideBySide, unwrap, wrapInSection } from '../../../../src/app/statblocks/model/treeGrouping';
import { duplicateBlock, insertBlock, moveBlock, removeBlock, updateBlock } from '../../../../src/app/statblocks/model/treeOps';
import { collectBlockIds, findBlock, flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import { turnInto } from '../../../../src/app/statblocks/model/turnInto';
import { isContainerBlock, type TemplateLayout } from '../../../../src/app/statblocks/model/templateTypes';
import {
  deepFreeze, int, leavesById, mulberry32, parentIds, pick, randomFields, randomLayout, randomSubtree, treeProblems,
  type Random,
} from './treeFixtures';

const SEEDS = 150;
const STEPS = 40;

function anyId(random: Random, layout: TemplateLayout): string {
  const ids = [...collectBlockIds(layout.blocks)];
  return ids.length === 0 || random() < 0.05 ? 'missing' : pick(random, ids);
}

function anyTarget(random: Random, layout: TemplateLayout): { parentId: string | null; index: number } {
  const parentId = random() < 0.05 ? 'missing' : pick(random, parentIds(layout));
  const length = (parentId === null ? layout.blocks : (() => {
    const found = parentId ? findBlock(layout.blocks, parentId) : null;
    return found && isContainerBlock(found.block) ? found.block.blocks : [];
  })()).length;
  return { parentId, index: int(random, -1, length + 1) };
}

/** Ids of a sibling run: usually adjacent, sometimes not, sometimes across parents. */
function anyRun(random: Random, layout: TemplateLayout): string[] {
  const parentId = pick(random, parentIds(layout));
  const list = parentId === null ? layout.blocks : (() => {
    const found = findBlock(layout.blocks, parentId);
    return found && isContainerBlock(found.block) ? found.block.blocks : [];
  })();
  if (list.length === 0) return [];
  const start = int(random, 0, list.length - 1);
  const run = list.slice(start, start + int(random, 1, 3)).map((block) => block.id);
  if (random() < 0.15) run.push(anyId(random, layout));
  return run;
}

interface Step {
  name: string;
  edit: TreeEdit;
  /** The ids the layout should hold after a successful edit. */
  expectedIds: Set<string>;
  /** Leaves the edit may replace (an update or turn of that block). */
  changed: string | null;
}

function step(random: Random, layout: TemplateLayout, fields: ReturnType<typeof randomFields>): Step {
  const before = collectBlockIds(layout.blocks);
  const nextId = blockIdSource(before, random);
  const subtreeIds = (id: string): string[] => {
    const found = findBlock(layout.blocks, id);
    return found ? flattenReadingOrder([found.block]).map((block) => block.id) : [];
  };
  const kind = int(random, 0, 8);
  switch (kind) {
    case 0: {
      const block = random() < 0.1 && before.size > 0
        ? { id: pick(random, [...before]), type: 'divider' as const }
        : randomSubtree(random, nextId);
      const target = anyTarget(random, layout);
      const edit = insertBlock(layout, block, target);
      if (target.parentId === null && !before.has(block.id)) expect(edit.ok, 'insert at the root').toBe(true);
      return { name: 'insert', edit, expectedIds: new Set([...before, ...flattenReadingOrder([block]).map((b) => b.id)]), changed: null };
    }
    case 1: {
      const id = anyId(random, layout);
      const gone = new Set(subtreeIds(id));
      const edit = removeBlock(layout, id);
      expect(edit.ok, 'remove').toBe(before.has(id));
      return { name: 'remove', edit, expectedIds: new Set([...before].filter((x) => !gone.has(x))), changed: null };
    }
    case 2: {
      const id = anyId(random, layout);
      const target = random() < 0.2 ? { parentId: null, index: int(random, 0, 3) } : anyTarget(random, layout);
      const edit = moveBlock(layout, id, target);
      if (target.parentId === null) expect(edit.ok, 'move to the root').toBe(before.has(id));
      return { name: 'move', edit, expectedIds: before, changed: null };
    }
    case 3: {
      const id = anyId(random, layout);
      const edit = duplicateBlock(layout, id, nextId);
      expect(edit.ok, 'duplicate').toBe(before.has(id));
      const added = edit.ok && edit.focus ? subtreeIdsIn(edit.layout, edit.focus) : [];
      expect(added.length).toBe(edit.ok ? subtreeIds(id).length : 0);
      return { name: 'duplicate', edit, expectedIds: new Set([...before, ...added]), changed: null };
    }
    case 4:
    case 5: {
      const wrapOp = kind === 4 ? wrapInSection : putSideBySide;
      const edit = wrapOp(layout, anyRun(random, layout), nextId);
      return { name: kind === 4 ? 'wrap' : 'side by side', edit, expectedIds: new Set([...before, ...(edit.ok && edit.focus ? [edit.focus] : [])]), changed: null };
    }
    case 6: {
      const id = anyId(random, layout);
      const found = findBlock(layout.blocks, id);
      const edit = unwrap(layout, id);
      if (found?.parentId === null) expect(edit.ok, 'unwrap at the root').toBe(isContainerBlock(found.block));
      return { name: 'unwrap', edit, expectedIds: new Set([...before].filter((x) => x !== id)), changed: null };
    }
    case 7: {
      const id = anyId(random, layout);
      return { name: 'turn into', edit: turnInto(layout, id, pick(random, AUTHORABLE_BLOCK_TYPES), fields), expectedIds: before, changed: id };
    }
    default: {
      const id = anyId(random, layout);
      const type = findBlock(layout.blocks, id)?.block.type ?? 'divider';
      const changes = random() < 0.5 ? { className: `c${int(random, 0, 3)}` } : { className: undefined };
      return { name: 'update', edit: updateBlock(layout, id, random() < 0.9 ? type : 'heading', changes), expectedIds: before, changed: id };
    }
  }
}

function subtreeIdsIn(layout: TemplateLayout, id: string): string[] {
  const found = findBlock(layout.blocks, id);
  return found ? flattenReadingOrder([found.block]).map((block) => block.id) : [];
}

describe('tree operations under random sequences', () => {
  it('keep ids unique, lose and duplicate no block, make no cycles and never change their input', () => {
    const applied = new Map<string, number>();
    const refused = new Map<string, number>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const random = mulberry32(seed);
      const fields = randomFields(random);
      let layout = deepFreeze(randomLayout(random));
      expect(treeProblems(layout), `seed ${seed}`).toEqual([]);
      for (let i = 0; i < STEPS; i++) {
        const { name, edit, expectedIds, changed } = step(random, layout, fields);
        const context = `seed ${seed}, step ${i}, ${name}`;
        const tally = edit.ok ? applied : refused;
        tally.set(name, (tally.get(name) ?? 0) + 1);
        if (!edit.ok) {
          expect(edit.layout, context).toBe(layout);
          continue;
        }
        expect(treeProblems(edit.layout), context).toEqual([]);
        expect(collectBlockIds(edit.layout.blocks), context).toEqual(expectedIds);
        const after = leavesById(edit.layout);
        for (const [id, leaf] of leavesById(layout)) {
          if (after.has(id) && id !== changed) expect(after.get(id), `${context}: leaf ${id}`).toBe(leaf);
        }
        layout = deepFreeze(edit.layout);
      }
    }
    // Every operation was both applied and refused often enough to mean something.
    for (const name of ['insert', 'remove', 'move', 'duplicate', 'wrap', 'side by side', 'unwrap', 'turn into', 'update']) {
      expect(applied.get(name) ?? 0, `${name} applied`).toBeGreaterThan(50);
      expect(refused.get(name) ?? 0, `${name} refused`).toBeGreaterThan(5);
    }
  });
});

describe('inverses restore the tree exactly', () => {
  it('move, then move back', () => {
    let checked = 0;
    for (let seed = 1; seed <= SEEDS * 4; seed++) {
      const random = mulberry32(seed);
      const layout = deepFreeze(randomLayout(random));
      const id = anyId(random, layout);
      const origin = findBlock(layout.blocks, id);
      const moved = moveBlock(layout, id, anyTarget(random, layout));
      if (!moved.ok || !origin) continue;
      const back = moveBlock(moved.layout, id, { parentId: origin.parentId, index: origin.index });
      expect(back.ok, `seed ${seed}`).toBe(true);
      expect(back.layout, `seed ${seed}`).toStrictEqual(layout);
      if (moved.layout !== layout) checked++;
    }
    expect(checked).toBeGreaterThan(SEEDS);
  });

  it('wrap, then unwrap', () => {
    let checked = 0;
    for (let seed = 1; seed <= SEEDS * 4; seed++) {
      const random = mulberry32(seed);
      const layout = deepFreeze(randomLayout(random));
      const nextId = blockIdSource(collectBlockIds(layout.blocks), random);
      const wrapOp = random() < 0.5 ? wrapInSection : putSideBySide;
      const wrapped = wrapOp(layout, anyRun(random, layout), nextId);
      if (!wrapped.ok || !wrapped.focus) continue;
      const back = unwrap(wrapped.layout, wrapped.focus);
      expect(back.ok, `seed ${seed}`).toBe(true);
      expect(back.layout, `seed ${seed}`).toStrictEqual(layout);
      checked++;
    }
    expect(checked).toBeGreaterThan(SEEDS);
  });

  it('insert, then remove; remove, then insert where it was', () => {
    let checked = 0;
    for (let seed = 1; seed <= SEEDS * 4; seed++) {
      const random = mulberry32(seed);
      const layout = deepFreeze(randomLayout(random));
      const block = randomSubtree(random, blockIdSource(collectBlockIds(layout.blocks), random));
      const inserted = insertBlock(layout, block, anyTarget(random, layout));
      if (inserted.ok) {
        expect(removeBlock(inserted.layout, block.id).layout, `seed ${seed}`).toStrictEqual(layout);
        checked++;
      }

      const id = anyId(random, layout);
      const origin = findBlock(layout.blocks, id);
      const removed = removeBlock(layout, id);
      if (!origin) continue;
      const restored = insertBlock(removed.layout, origin.block, { parentId: origin.parentId, index: origin.index });
      expect(restored.ok, `seed ${seed}`).toBe(true);
      expect(restored.layout, `seed ${seed}`).toStrictEqual(layout);
      checked++;
    }
    expect(checked).toBeGreaterThan(SEEDS * 2);
  });

  it('duplicate, then remove the copy', () => {
    let checked = 0;
    for (let seed = 1; seed <= SEEDS * 4; seed++) {
      const random = mulberry32(seed);
      const layout = deepFreeze(randomLayout(random));
      const copied = duplicateBlock(layout, anyId(random, layout), blockIdSource(collectBlockIds(layout.blocks), random));
      if (!copied.ok || !copied.focus) continue;
      expect(removeBlock(copied.layout, copied.focus).layout, `seed ${seed}`).toStrictEqual(layout);
      checked++;
    }
    expect(checked).toBeGreaterThan(SEEDS);
  });
});
