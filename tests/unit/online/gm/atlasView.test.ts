import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ATLAS_VIEW_TYPE, followPlayerSight, sceneStoreOf } from '../../../../src/app/online/gm/atlasView.ts';

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

describe('followPlayerSight', () => {
  it('hears the renderer tell of each change of what players see, until stopped', () => {
    const listeners = new Set<() => void>();
    const audience = { onSightChange: (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener)) };
    const renderer = { getCanvasAudience: () => audience };
    let heard = 0;
    const stop = followPlayerSight(renderer, () => (heard += 1));
    listeners.forEach((listener) => listener());
    stop();
    listeners.forEach((listener) => listener());
    expect(heard).toBe(1);
  });

  it('hears nothing of a renderer that tells nothing, and stops without fault', () => {
    expect(() => followPlayerSight({}, () => undefined)()).not.toThrow();
    expect(() => followPlayerSight({ getCanvasAudience: () => null }, () => undefined)()).not.toThrow();
    expect(() => followPlayerSight(null, () => undefined)()).not.toThrow();
  });
});
