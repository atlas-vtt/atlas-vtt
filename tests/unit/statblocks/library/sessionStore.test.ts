import { describe, expect, it } from 'vitest';
import { createTemplateDraftStore, sameTemplate } from '../../../../src/app/statblocks/library/sessionStore';
import { createBlock } from '../../../../src/app/statblocks/model/blockCatalogue';
import { renameFieldKey } from '../../../../src/app/statblocks/model/fieldOps';
import { blockIdSource } from '../../../../src/app/statblocks/model/templateIds';
import { insertBlock, moveBlock, removeBlock } from '../../../../src/app/statblocks/model/treeOps';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import {
  abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction, getHistoryStore, runUntracked,
} from '../../../../src/app/statblocks/library/sessionHistory';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

const withLayout = (edit: (template: StatblockTemplate) => StatblockTemplate['layout']) =>
  (template: StatblockTemplate): StatblockTemplate => ({ ...template, layout: edit(template) });

function draftStore() {
  const store = createTemplateDraftStore(MARSH_CREATURE);
  const history = getHistoryStore(store)!;
  return { store, past: () => history.getState().pastStates.length, history: () => history.getState() };
}

describe('the template draft store', () => {
  it('records exactly one past state for one tree edit', () => {
    const { store, past } = draftStore();
    const block = createBlock('divider', blockIdSource([], () => 0.25));
    store.getState().edit(withLayout((template) => insertBlock(template.layout, block, { parentId: null, index: 2 }).layout));
    expect(past()).toBe(1);
    store.getState().edit(withLayout((template) => moveBlock(template.layout, block.id, { parentId: null, index: 0 }).layout));
    store.getState().edit(withLayout((template) => removeBlock(template.layout, block.id).layout));
    expect(past()).toBe(3);
    store.getState().edit((template) => renameFieldKey(template, 'hp', 'health'));
    expect(past()).toBe(4);
  });

  it('records nothing for a refused edit or a copy that changes nothing', () => {
    const { store, past } = draftStore();
    store.getState().edit(withLayout((template) => moveBlock(template.layout, 'nowhere', { parentId: null, index: 0 }).layout));
    store.getState().edit((template) => ({ ...template }));
    expect(past()).toBe(0);
    expect(store.getState().template).toBe(MARSH_CREATURE);
  });

  it('runs every edit on the template as it is when the edit runs', () => {
    const { store } = draftStore();
    const first = createBlock('divider', blockIdSource([], () => 0.1));
    const second = createBlock('divider', blockIdSource([first.id], () => 0.1));
    const insert = (block: typeof first) => withLayout((template) => insertBlock(template.layout, block, { parentId: null, index: 0 }).layout);
    store.getState().edit(insert(first));
    store.getState().edit(insert(second));
    expect(store.getState().template.layout.blocks.slice(0, 2).map((block) => block.id)).toEqual([second.id, first.id]);
  });

  it('makes one step of a transaction, none of an abandoned one, and none of an untracked write', () => {
    const { store, past } = draftStore();
    beginHistoryTransaction(store);
    for (const description of ['a', 'ab', 'abc']) store.getState().edit((template) => ({ ...template, description }));
    endHistoryTransaction(store);
    expect(past()).toBe(1);
    beginHistoryTransaction(store);
    store.getState().edit((template) => ({ ...template, description: 'gone' }));
    store.setState({ template: MARSH_CREATURE });
    abandonHistoryTransaction(store);
    runUntracked(store, () => store.setState({ template: { ...MARSH_CREATURE, description: 'reloaded' } }));
    expect(past()).toBe(1);
  });
});

describe('sameTemplate', () => {
  it('counts a copy whose every value is the same object as the same template', () => {
    expect(sameTemplate(MARSH_CREATURE, { ...MARSH_CREATURE })).toBe(true);
    expect(sameTemplate(MARSH_CREATURE, { ...MARSH_CREATURE, layout: { ...MARSH_CREATURE.layout } })).toBe(false);
    expect(sameTemplate(MARSH_CREATURE, { ...MARSH_CREATURE, description: 'Other' })).toBe(false);
    const { lookups: _lookups, ...fewer } = MARSH_CREATURE;
    expect(sameTemplate(MARSH_CREATURE, fewer)).toBe(false);
  });
});
