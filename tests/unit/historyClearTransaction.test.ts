import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { beginHistoryTransaction, getHistoryStore } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';

describe('history clear', () => {
  it('ends a transaction left open, so the next scene records its edits', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `history-clear-${Math.random()}`);
    store.setState({ persistenceEnabled: false });
    const history = getHistoryStore(store)!;
    beginHistoryTransaction(store);
    history.getState().clear();
    store.getState().addObject('walls', { type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } });
    expect(history.getState().pastStates).toHaveLength(1);
  });
});
