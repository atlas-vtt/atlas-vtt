import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ATLAS_VIEW_TYPE, sceneStoreOf } from '../../../../src/app/online/gm/atlasView.ts';

function leafWith(atlasStore: unknown, viewType = ATLAS_VIEW_TYPE): WorkspaceLeaf {
  return { view: { getViewType: () => viewType, atlasStore } } as unknown as WorkspaceLeaf;
}

describe('sceneStoreOf', () => {
  it('finds the store of an Atlas tab, which is a function with the store methods on it', () => {
    const store = create(() => ({ mapPath: 'scene.atlasmap' }));
    expect(typeof store).toBe('function');
    expect(sceneStoreOf(leafWith(store))).toBe(store);
  });

  it('finds a plain store object too', () => {
    const store = createStore(() => ({ mapPath: 'scene.atlasmap' }));
    expect(sceneStoreOf(leafWith(store))).toBe(store);
  });

  it('finds nothing in another view type or without the store methods', () => {
    expect(sceneStoreOf(leafWith(create(() => ({})), 'markdown'))).toBeNull();
    expect(sceneStoreOf(leafWith(() => undefined))).toBeNull();
    expect(sceneStoreOf(leafWith(null))).toBeNull();
  });
});
