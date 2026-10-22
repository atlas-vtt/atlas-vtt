import { describe, expect, it } from 'vitest';
import { getHistoryStore } from '../../../../src/app/stores/history';

interface ViewStore {
  getState(): { isDiceLogOpen: boolean; setDiceLogOpen(open: boolean): void; setPersistenceEnabled(enabled: boolean): void };
}

/** Atlas's real view store, loaded by a path the type checker does not follow (see playerMovesStore). */
const STORE_FACTORY = '../../../../src/app/storeFactory';
const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: (app: unknown, viewId: string) => ViewStore };

describe('opening the control over the dice log', () => {
  it('closes the log without an undo step', () => {
    const store = createViewAtlasStore({}, 'online-dock-test');
    store.getState().setPersistenceEnabled(false);
    store.getState().setDiceLogOpen(true);
    const history = getHistoryStore(store);
    if (history === null) throw new Error('the store has no history');
    history.getState().clear();
    store.getState().setDiceLogOpen(false);
    expect(store.getState().isDiceLogOpen).toBe(false);
    expect(history.getState().pastStates).toHaveLength(0);
  });
});
