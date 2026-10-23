import { describe, expect, it, vi } from 'vitest';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

function setup() {
  const store = createTabMetaStore();
  const ids = ['A', 'B', 'C', 'D'].map((name) => store.getState().addTab(`${name}.atlasmap`, name));
  store.getState().setActiveTab(ids[1]!);
  return { store, ids, names: () => store.getState().tabs.map((tab) => tab.displayName) };
}

describe('moving open scene tabs', () => {
  it('inserts in either direction and appends while preserving scene identities and active state', () => {
    const { store, ids, names } = setup();
    store.getState().markTabDirty(ids[0]!, true);
    store.getState().markTabLoaded(ids[0]!);
    const originals = [...store.getState().tabs];
    expect(store.getState().moveTab(ids[0]!, ids[3]!)).toBe(true);
    expect(names()).toEqual(['B', 'C', 'A', 'D']);
    expect(store.getState().moveTab(ids[1]!, null)).toBe(true);
    expect(names()).toEqual(['C', 'A', 'D', 'B']);
    expect(store.getState().moveTab(ids[3]!, ids[2]!)).toBe(true);
    expect(names()).toEqual(['D', 'C', 'A', 'B']);
    expect(store.getState().activeTabId).toBe(ids[1]);
    for (const original of originals) expect(store.getState().tabs.find((tab) => tab.id === original.id)).toBe(original);
    expect(store.getState().getTabByFilePath('A.atlasmap')).toMatchObject({ isDirty: true, isLoaded: true });
  });

  it('keeps invalid or already satisfied moves silent, including empty and single-tab stores', () => {
    const { store, ids } = setup();
    const before = store.getState();
    const changed = vi.fn();
    store.subscribe(changed);
    for (const [source, target] of [['missing', ids[0]], [ids[0], 'missing'], [ids[0], ids[0]], [ids[0], ids[1]], [ids[3], null]] as const) {
      expect(store.getState().moveTab(source!, target!)).toBe(false);
    }
    expect(store.getState()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    const empty = createTabMetaStore();
    expect(empty.getState().moveTab('missing', null)).toBe(false);
    const only = empty.getState().addTab('only.atlasmap', 'Only');
    expect(empty.getState().moveTab(only, null)).toBe(false);
  });

  it('moves current metadata without reviving closed scenes or affecting another view', () => {
    const { store, ids, names } = setup();
    const other = setup();
    store.getState().updateTabFilePath('A.atlasmap', 'Renamed.atlasmap', 'Renamed');
    store.getState().markTabDirty(ids[0]!, true);
    store.getState().removeTab(ids[2]!);
    const current = store.getState().tabs[0];
    expect(store.getState().moveTab(ids[0]!, null)).toBe(true);
    expect(names()).toEqual(['B', 'D', 'Renamed']);
    expect(store.getState().tabs.at(-1)).toBe(current);
    expect(store.getState().moveTab(ids[2]!, null)).toBe(false);
    expect(other.names()).toEqual(['A', 'B', 'C', 'D']);
    store.getState().addTab('New.atlasmap', 'New');
    expect(names()).toEqual(['B', 'D', 'Renamed', 'New']);
  });
});
