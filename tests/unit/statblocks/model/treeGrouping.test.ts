import { describe, expect, it } from 'vitest';
import { putSideBySide, unwrap, wrapInSection } from '../../../../src/app/statblocks/model/treeGrouping';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock, TemplateLayout } from '../../../../src/app/statblocks/model/templateTypes';
import { deepFreeze, idsFrom } from './treeFixtures';

// root ─ a, b, c, row ─ (r1, r2), sec ─ (s1, innerRow ─ (x))
function sample(): TemplateLayout {
  return deepFreeze({
    maxColumns: 2,
    blocks: [
      { id: 'a', type: 'stat', field: 'ac', look: 'run-in' },
      { id: 'b', type: 'stat', field: 'hp', look: 'run-in' },
      { id: 'c', type: 'divider' },
      { id: 'row', type: 'row', align: 'spread', blocks: [
        { id: 'r1', type: 'stat', field: 'str', look: 'stacked' },
        { id: 'r2', type: 'section', heading: 'Inside', blocks: [{ id: 'deep', type: 'heading', text: 'Deep', level: 'minor' }] },
      ] },
      { id: 'sec', type: 'section', blocks: [
        { id: 's1', type: 'text', field: 'description' },
        { id: 'innerRow', type: 'row', blocks: [{ id: 'x', type: 'divider' }] },
      ] },
    ],
  });
}

const order = (blocks: readonly TemplateBlock[]): string[] => blocks.map((block) => block.id);

describe('wrapInSection', () => {
  it('wraps adjacent siblings, given in any order, into a Section in their place', () => {
    const layout = sample();
    const edit = wrapInSection(layout, ['c', 'b'], idsFrom('wrap'));
    expect(edit).toMatchObject({ ok: true, focus: 'wrap' });
    expect(order(edit.layout.blocks)).toEqual(['a', 'wrap', 'row', 'sec']);
    const wrapped = findBlock(edit.layout.blocks, 'wrap')?.block;
    expect(wrapped).toEqual({ id: 'wrap', type: 'section', blocks: [layout.blocks[1], layout.blocks[2]] });
  });

  it('wraps inside a Row too', () => {
    const edit = wrapInSection(sample(), ['r1'], idsFrom('wrap'));
    expect(edit.ok).toBe(true);
    expect(findBlock(edit.layout.blocks, 'wrap')).toMatchObject({ parentId: 'row', index: 0 });
  });

  it.each([
    ['nothing', [], 'nothing-selected'],
    ['an unknown block', ['a', 'nope'], 'block-not-found'],
    ['blocks of different parents', ['a', 'r1'], 'not-siblings'],
    ['blocks with a gap between them', ['a', 'c'], 'not-adjacent'],
    ['a container id that is taken', ['a'], 'duplicate-id'],
  ] as const)('refuses %s', (_, ids, reason) => {
    const layout = sample();
    const nextId = reason === 'duplicate-id' ? idsFrom('b') : idsFrom('wrap');
    expect(wrapInSection(layout, ids, nextId)).toEqual({ ok: false, layout, reason });
  });

  it('ignores an id given twice', () => {
    expect(wrapInSection(sample(), ['a', 'a', 'b'], idsFrom('wrap')).ok).toBe(true);
  });
});

describe('putSideBySide', () => {
  it('wraps adjacent siblings into a Row', () => {
    const edit = putSideBySide(sample(), ['a', 'b'], idsFrom('pair'));
    expect(edit).toMatchObject({ ok: true, focus: 'pair' });
    expect(findBlock(edit.layout.blocks, 'pair')?.block).toMatchObject({ type: 'row' });
    expect(order(edit.layout.blocks)).toEqual(['pair', 'c', 'row', 'sec']);
  });

  it('refuses a Row among the blocks and blocks already inside a Row', () => {
    const layout = sample();
    expect(putSideBySide(layout, ['row', 'sec'], idsFrom('pair'))).toEqual({ ok: false, layout, reason: 'not-allowed-here' });
    expect(putSideBySide(layout, ['r1', 'r2'], idsFrom('pair'))).toEqual({ ok: false, layout, reason: 'not-allowed-here' });
  });
});

describe('unwrap', () => {
  it('puts a container\'s children in its place', () => {
    const layout = sample();
    const edit = unwrap(layout, 'row');
    expect(edit).toMatchObject({ ok: true, focus: 'r1' });
    expect(order(edit.layout.blocks)).toEqual(['a', 'b', 'c', 'r1', 'r2', 'sec']);
  });

  it('removes an empty container and selects nothing', () => {
    const empty: TemplateLayout = { maxColumns: 1, blocks: [{ id: 'e', type: 'section', blocks: [] }] };
    expect(unwrap(empty, 'e')).toEqual({ ok: true, layout: { maxColumns: 1, blocks: [] }, focus: null });
  });

  it('refuses where a child would land in a parent that does not take it', () => {
    const layout: TemplateLayout = deepFreeze({
      maxColumns: 2,
      blocks: [{ id: 'outer', type: 'row', blocks: [{ id: 'mid', type: 'section', blocks: [{ id: 'inner', type: 'row', blocks: [] }] }] }],
    });
    expect(unwrap(layout, 'mid')).toEqual({ ok: false, layout, reason: 'not-allowed-here' });
  });

  it('refuses a leaf and an unknown block', () => {
    const layout = sample();
    expect(unwrap(layout, 'a')).toEqual({ ok: false, layout, reason: 'not-a-container' });
    expect(unwrap(layout, 'nope')).toEqual({ ok: false, layout, reason: 'block-not-found' });
  });
});
