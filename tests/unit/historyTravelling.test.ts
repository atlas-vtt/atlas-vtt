import { describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore, isHistoryTravelling } from '../../src/app/stores/history';

describe('telling an undo from an edit', () => {
  it('says the store is travelling only while undo and redo write it', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'travelling');
    const history = getHistoryStore(store)!.getState();
    const heard: boolean[] = [];
    store.subscribe(() => heard.push(isHistoryTravelling(store)));
    store.getState().setGridVisible(false);
    history.undo();
    history.redo();
    expect(heard).toEqual([false, true, true]);
    expect(isHistoryTravelling(store)).toBe(false);
  });
});
