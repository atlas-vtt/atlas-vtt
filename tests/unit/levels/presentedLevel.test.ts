import { describe, expect, it } from 'vitest';
import { PresentedSceneStore, readPresentedScene } from '../../../src/app/services/presentedScene';

describe('the presented level', () => {
  it('is read with the scene, and a scene saved before levels has none', () => {
    expect(readPresentedScene({ tabId: 't', filePath: 'a.atlasmap', levelId: 'upper' })).toEqual({ tabId: 't', filePath: 'a.atlasmap', levelId: 'upper' });
    expect(readPresentedScene({ tabId: 't', filePath: 'a.atlasmap' })).toEqual({ tabId: 't', filePath: 'a.atlasmap' });
    expect(readPresentedScene({ tabId: 't', filePath: 'a.atlasmap', levelId: 3 })).toEqual({ tabId: 't', filePath: 'a.atlasmap' });
  });

  it('tells its listeners when only the level changes', () => {
    const saved = new Map<string, unknown>();
    const store = new PresentedSceneStore({ loadLocalStorage: (key: string) => saved.get(key), saveLocalStorage: (key: string, value: unknown) => { saved.set(key, value); } });
    const heard: unknown[] = [];
    store.onChange((scene) => heard.push(scene));

    store.set({ tabId: 't', filePath: 'a.atlasmap', levelId: 'ground' });
    store.set({ tabId: 't', filePath: 'a.atlasmap', levelId: 'ground' });
    store.set({ tabId: 't', filePath: 'a.atlasmap', levelId: 'upper' });

    expect(heard).toEqual([{ tabId: 't', filePath: 'a.atlasmap', levelId: 'ground' }, { tabId: 't', filePath: 'a.atlasmap', levelId: 'upper' }]);
    expect(store.get()?.levelId).toBe('upper');
  });
});
