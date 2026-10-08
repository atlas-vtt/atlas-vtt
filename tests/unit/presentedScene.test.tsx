import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { PresentedSceneStore, PRESENTED_SCENE_KEY, readPresentedScene } from '../../src/app/services/presentedScene';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function deviceStorage(initial?: unknown): { loadLocalStorage: (key: string) => unknown; saveLocalStorage: (key: string, value: unknown) => void; stored: Map<string, unknown> } {
  const stored = new Map<string, unknown>(initial === undefined ? [] : [[PRESENTED_SCENE_KEY, initial]]);
  return { stored, loadLocalStorage: (key) => stored.get(key) ?? null, saveLocalStorage: (key, value) => void stored.set(key, value) };
}

it('keeps the presented scene on this device and tells listeners of each change', () => {
  const storage = deviceStorage();
  const presented = new PresentedSceneStore(storage);
  const listener = vi.fn();
  const stop = presented.onChange(listener);
  expect(presented.get()).toBeNull();

  presented.set({ tabId: 'tab-1', filePath: 'Cave.atlasmap' });
  presented.set({ tabId: 'tab-1', filePath: 'Cave.atlasmap' });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(storage.stored.get(PRESENTED_SCENE_KEY)).toEqual({ tabId: 'tab-1', filePath: 'Cave.atlasmap' });
  // A reload reads it back
  expect(new PresentedSceneStore(storage).get()).toEqual({ tabId: 'tab-1', filePath: 'Cave.atlasmap' });

  stop();
  presented.set(null);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(storage.stored.get(PRESENTED_SCENE_KEY)).toBeNull();
});

it('reads anything stored that is no scene as nothing presented, and survives storage that fails', () => {
  for (const value of [null, 'Cave', { tabId: 'tab-1' }, { tabId: '', filePath: 'Cave.atlasmap' }, { tabId: 3, filePath: 'Cave.atlasmap' }]) {
    expect(readPresentedScene(value)).toBeNull();
    expect(new PresentedSceneStore(deviceStorage(value)).get()).toBeNull();
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const broken = { loadLocalStorage: (): unknown => { throw new Error('no storage'); }, saveLocalStorage: (): void => { throw new Error('no storage'); } };
  const presented = new PresentedSceneStore(broken);
  presented.set({ tabId: 'tab-1', filePath: 'Cave.atlasmap' });
  expect(presented.get()).toEqual({ tabId: 'tab-1', filePath: 'Cave.atlasmap' });
});

it('marks the presented tab\'s eye whether or not the player window is open', () => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
  Element.prototype.scrollIntoView = vi.fn();
  const tabMetaStore = createTabMetaStore();
  const [, cave] = ['Tavern', 'Cave'].map((name) => tabMetaStore.getState().addTab(`${name}.atlasmap`, name));
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={vi.fn()} presentedTabId={cave!} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  const eyes = screen.getAllByRole('button', { pressed: true });
  expect(eyes).toHaveLength(1);
  expect(screen.getByRole('tab', { name: /Cave/ }).contains(eyes[0]!)).toBe(true);
});
