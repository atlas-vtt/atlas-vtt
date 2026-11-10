import { describe, expect, it } from 'vitest';
import {
  duplicateBlock, insertBlock, moveBlock, removeBlock, updateBlock,
} from '../../../../src/app/statblocks/model/treeOps';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock, TemplateLayout } from '../../../../src/app/statblocks/model/templateTypes';
import { deepFreeze, idsFrom } from './treeFixtures';

// root ─ title
//  ├ row ─ ac, hp
//  ├ defenses (section) ─ saves, speed, inner (section) ─ desc
//  └ actions
function sample(): TemplateLayout {
  return deepFreeze({
    maxColumns: 2,
    blocks: [
      { id: 'title', type: 'title', field: 'name', level: 1 },
      { id: 'row', type: 'row', blocks: [
        { id: 'ac', type: 'stat', field: 'ac', look: 'stacked' },
        { id: 'hp', type: 'stat', field: 'hp', look: 'stacked' },
      ] },
      { id: 'defenses', type: 'section', heading: 'Defenses', blocks: [
        { id: 'saves', type: 'pairs', field: 'saves' },
        { id: 'speed', type: 'stat', field: 'speed', look: 'run-in' },
        { id: 'inner', type: 'section', blocks: [{ id: 'desc', type: 'text', field: 'description' }] },
      ] },
      { id: 'actions', type: 'entries', field: 'actions', heading: 'Actions' },
    ],
  });
}

const order = (blocks: readonly TemplateBlock[]): string[] => blocks.map((block) => block.id);
const childIds = (layout: TemplateLayout, id: string): string[] => {
  const found = findBlock(layout.blocks, id);
  return found && 'blocks' in found.block ? order(found.block.blocks) : [];
};

describe('insertBlock', () => {
  it('puts a block into a container at the index and selects it', () => {
    const layout = sample();
    const edit = insertBlock(layout, { id: 'cr', type: 'stat', field: 'cr', look: 'run-in' }, { parentId: 'defenses', index: 1 });
    expect(edit).toMatchObject({ ok: true, focus: 'cr' });
    expect(childIds(edit.layout, 'defenses')).toEqual(['saves', 'cr', 'speed', 'inner']);
  });

  it('clamps the index into the list', () => {
    const layout = sample();
    const block: TemplateBlock = { id: 'end', type: 'divider' };
    expect(order(insertBlock(layout, block, { parentId: null, index: 99 }).layout.blocks).at(-1)).toBe('end');
    expect(order(insertBlock(layout, block, { parentId: null, index: -3 }).layout.blocks)[0]).toBe('end');
    expect(order(insertBlock(layout, block, { parentId: null, index: 1.7 }).layout.blocks)[1]).toBe('end');
  });

  it('shares every container off the path to the change', () => {
    const layout = sample();
    const next = insertBlock(layout, { id: 'x', type: 'divider' }, { parentId: 'inner', index: 0 }).layout;
    expect(next.blocks[1]).toBe(layout.blocks[1]);
    expect(next.blocks[3]).toBe(layout.blocks[3]);
    expect(next.blocks[2]).not.toBe(layout.blocks[2]);
    expect(childIds(next, 'inner')).toEqual(['x', 'desc']);
  });

  it.each([
    ['an id already in the template', { id: 'hp', type: 'divider' }, { parentId: null, index: 0 }, 'duplicate-id'],
    ['ids repeated inside the block', { id: 'n', type: 'section', blocks: [{ id: 'm', type: 'divider' }, { id: 'm', type: 'divider' }] }, { parentId: null, index: 0 }, 'duplicate-id'],
    ['a parent that does not exist', { id: 'n', type: 'divider' }, { parentId: 'nope', index: 0 }, 'target-not-found'],
    ['a parent that holds no children', { id: 'n', type: 'divider' }, { parentId: 'ac', index: 0 }, 'not-a-container'],
    ['a Row into a Row', { id: 'n', type: 'row', blocks: [] }, { parentId: 'row', index: 0 }, 'not-allowed-here'],
    ['a block holding a Row in a Row', { id: 'n', type: 'row', blocks: [{ id: 'm', type: 'row', blocks: [] }] }, { parentId: null, index: 0 }, 'not-allowed-here'],
  ] as const)('refuses %s and returns the same layout', (_, block, target, reason) => {
    const layout = sample();
    const edit = insertBlock(layout, block as TemplateBlock, target);
    expect(edit).toEqual({ ok: false, layout, reason });
    expect(edit.layout).toBe(layout);
  });
});

describe('removeBlock', () => {
  it('takes a block out with everything inside it', () => {
    const edit = removeBlock(sample(), 'defenses');
    expect(edit).toMatchObject({ ok: true, focus: null });
    expect(order(edit.layout.blocks)).toEqual(['title', 'row', 'actions']);
    expect(findBlock(edit.layout.blocks, 'desc')).toBeNull();
  });

  it('refuses an unknown id', () => {
    const layout = sample();
    expect(removeBlock(layout, 'nope')).toEqual({ ok: false, layout, reason: 'block-not-found' });
  });
});

describe('moveBlock', () => {
  it('reads the index as the place the block ends up in', () => {
    const edit = moveBlock(sample(), 'title', { parentId: null, index: 2 });
    expect(order(edit.layout.blocks)).toEqual(['row', 'defenses', 'title', 'actions']);
  });

  it('moves between containers and keeps the block itself', () => {
    const layout = sample();
    const edit = moveBlock(layout, 'speed', { parentId: 'row', index: 1 });
    expect(edit).toMatchObject({ ok: true, focus: 'speed' });
    expect(childIds(edit.layout, 'row')).toEqual(['ac', 'speed', 'hp']);
    expect(childIds(edit.layout, 'defenses')).toEqual(['saves', 'inner']);
    expect(findBlock(edit.layout.blocks, 'speed')?.block).toBe(findBlock(layout.blocks, 'speed')?.block);
  });

  it('returns the same layout for a move to where the block is', () => {
    const layout = sample();
    expect(moveBlock(layout, 'speed', { parentId: 'defenses', index: 1 })).toEqual({ ok: true, layout, focus: 'speed' });
    expect(moveBlock(layout, 'speed', { parentId: 'defenses', index: 1 }).layout).toBe(layout);
  });

  it.each([
    ['into itself', 'defenses', 'defenses', 'inside-itself'],
    ['below itself', 'defenses', 'inner', 'inside-itself'],
    ['a Row into itself', 'row', 'row', 'inside-itself'],
    ['into a leaf', 'title', 'ac', 'not-a-container'],
    ['into nowhere', 'title', 'nope', 'target-not-found'],
  ] as const)('refuses a move %s', (_, id, parentId, reason) => {
    const layout = sample();
    expect(moveBlock(layout, id, { parentId, index: 0 })).toEqual({ ok: false, layout, reason });
  });

  it('refuses a Row into a Row', () => {
    const layout = insertBlock(sample(), { id: 'row2', type: 'row', blocks: [] }, { parentId: null, index: 0 }).layout;
    expect(moveBlock(layout, 'row2', { parentId: 'row', index: 0 })).toMatchObject({ ok: false, reason: 'not-allowed-here' });
  });

  it('refuses an unknown block', () => {
    expect(moveBlock(sample(), 'nope', { parentId: null, index: 0 })).toMatchObject({ ok: false, reason: 'block-not-found' });
  });
});

describe('duplicateBlock', () => {
  it('copies a block and its children with new ids right after it', () => {
    const layout = sample();
    const edit = duplicateBlock(layout, 'defenses', idsFrom('d2', 's2', 'p2', 'i2', 't2'));
    expect(edit).toMatchObject({ ok: true, focus: 'd2' });
    expect(order(edit.layout.blocks)).toEqual(['title', 'row', 'defenses', 'd2', 'actions']);
    expect(childIds(edit.layout, 'd2')).toEqual(['s2', 'p2', 'i2']);
    expect(childIds(edit.layout, 'i2')).toEqual(['t2']);
    expect(findBlock(edit.layout.blocks, 'd2')?.block).toMatchObject({ type: 'section', heading: 'Defenses' });
    expect(edit.layout.blocks[2]).toBe(layout.blocks[2]);
  });

  it('refuses ids that are taken', () => {
    const layout = sample();
    expect(duplicateBlock(layout, 'ac', idsFrom('hp'))).toEqual({ ok: false, layout, reason: 'duplicate-id' });
    expect(duplicateBlock(layout, 'inner', idsFrom('x', 'x'))).toEqual({ ok: false, layout, reason: 'duplicate-id' });
    expect(duplicateBlock(layout, 'nope', idsFrom('x'))).toEqual({ ok: false, layout, reason: 'block-not-found' });
  });
});

describe('updateBlock', () => {
  it('sets values and removes optional ones given as undefined', () => {
    const layout = sample();
    const edit = updateBlock(layout, 'speed', 'stat', { look: 'stacked', label: 'Movement' });
    expect(findBlock(edit.layout.blocks, 'speed')?.block).toEqual({ id: 'speed', type: 'stat', field: 'speed', look: 'stacked', label: 'Movement' });
    const cleared = updateBlock(edit.layout, 'speed', 'stat', { label: undefined });
    expect(findBlock(cleared.layout.blocks, 'speed')?.block).toStrictEqual({ id: 'speed', type: 'stat', field: 'speed', look: 'stacked' });
  });

  it('returns the same layout when nothing changes', () => {
    const layout = sample();
    expect(updateBlock(layout, 'speed', 'stat', { look: 'run-in', label: undefined }).layout).toBe(layout);
  });

  it('refuses a block of another type or an unknown block', () => {
    const layout = sample();
    expect(updateBlock(layout, 'saves', 'stat', { look: 'stacked' })).toEqual({ ok: false, layout, reason: 'wrong-type' });
    expect(updateBlock(layout, 'nope', 'stat', { look: 'stacked' })).toEqual({ ok: false, layout, reason: 'block-not-found' });
  });

  it('never changes a container\'s children', () => {
    const layout = sample();
    const changes = { heading: 'Guard', blocks: [] } as unknown as { heading: string };
    const edit = updateBlock(layout, 'defenses', 'section', changes);
    expect(childIds(edit.layout, 'defenses')).toEqual(['saves', 'speed', 'inner']);
    expect(findBlock(edit.layout.blocks, 'defenses')?.block).toMatchObject({ heading: 'Guard' });
  });
});
