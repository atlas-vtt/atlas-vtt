import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { ATLAS_VIEW_TYPE, LOCAL_PLAYER_VIEW_TYPE } from '../../../../src/app/online/gm/atlasView.ts';
import { mapViewOf, sceneStoreOf } from '../../../../src/app/online/gm/mapViewOf.ts';

function leafWith(atlasStore: unknown, viewType = ATLAS_VIEW_TYPE): WorkspaceLeaf {
  return { view: { getViewType: () => viewType, atlasStore } } as unknown as WorkspaceLeaf;
}

describe('an Atlas map view found in a leaf', () => {
  it('is the leaf\'s view itself, with its store, for an Atlas map tab', () => {
    const store = create(() => ({ mapPath: 'scene.atlasmap' }));
    const leaf = leafWith(store);
    expect(mapViewOf(leaf)).toBe(leaf.view);
    expect(sceneStoreOf(leaf)).toBe(store);
  });

  it('is nothing in another view, Atlas\'s own player window included', () => {
    for (const type of ['markdown', LOCAL_PLAYER_VIEW_TYPE]) {
      const leaf = leafWith(create(() => ({})), type);
      expect(mapViewOf(leaf)).toBeNull();
      expect(sceneStoreOf(leaf)).toBeNull();
    }
  });
});
