import { describe, expect, it } from 'vitest';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { openThroughAtlas, takeOverDiceLog } from '../../../../src/app/online/gm/log/diceLogTakeover.ts';

interface FakeState {
  isDiceLogOpen: boolean;
  setDiceLogOpen: (open: boolean) => void;
}

/** A store that notifies as zustand does: every listener, in the order they subscribed, with the state as it is now. */
function fakeStore(open = false): { store: SceneStore; isOpen: () => boolean; seen: boolean[]; writes: () => number } {
  const listeners = new Set<(state: SceneState) => void>();
  const seen: boolean[] = [];
  let writes = 0;
  let state: FakeState = {
    isDiceLogOpen: open,
    setDiceLogOpen: (next) => {
      writes += 1;
      state = { ...state, isDiceLogOpen: next };
      for (const listener of listeners) listener(state as unknown as SceneState);
    },
  };
  const store: SceneStore = {
    getState: () => state as unknown as SceneState,
    setState: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  // What Atlas's own interface would draw: the flag as each notification leaves it.
  store.subscribe(() => seen.push(state.isDiceLogOpen));
  return { store, isOpen: () => state.isDiceLogOpen, seen, writes: () => writes };
}

const press = (store: SceneStore): void => {
  const state = store.getState() as unknown as FakeState;
  state.setDiceLogOpen(!state.isDiceLogOpen);
};

describe('the takeover of Atlas\'s dice log', () => {
  it('turns every opening into a toggle of the table\'s log and leaves Atlas\'s closed', () => {
    const { store, isOpen } = fakeStore();
    let toggles = 0;
    takeOverDiceLog(store, () => (toggles += 1));
    press(store);
    expect(isOpen()).toBe(false);
    expect(toggles).toBe(1);
    // The same key again: Atlas's flag is false, so it "opens" again, which closes the table's log.
    press(store);
    expect(isOpen()).toBe(false);
    expect(toggles).toBe(2);
  });

  it('closes Atlas\'s log within the notification that opened it, so what follows the store draws it closed', () => {
    const { store, seen } = fakeStore();
    takeOverDiceLog(store, () => undefined);
    const later: boolean[] = [];
    store.subscribe((state) => later.push((state as unknown as FakeState).isDiceLogOpen));
    press(store);
    // A listener from before the takeover hears of the opening once, then of the closing; one after it only ever sees it closed.
    expect(seen[seen.length - 1]).toBe(false);
    expect(later.every((open) => !open)).toBe(true);
  });

  it('takes a log Atlas already shows when it begins', () => {
    const { store, isOpen } = fakeStore(true);
    let toggles = 0;
    takeOverDiceLog(store, () => (toggles += 1));
    expect(isOpen()).toBe(false);
    expect(toggles).toBe(1);
  });

  it('ends when stopped: Atlas\'s log opens as before', () => {
    const { store, isOpen } = fakeStore();
    let toggles = 0;
    const stop = takeOverDiceLog(store, () => (toggles += 1));
    stop();
    press(store);
    expect(isOpen()).toBe(true);
    expect(toggles).toBe(0);
  });

  it('does not write when Atlas closes its log', () => {
    const { store, writes } = fakeStore();
    takeOverDiceLog(store, () => undefined);
    (store.getState() as unknown as FakeState).setDiceLogOpen(false);
    expect(writes()).toBe(1);
  });

  it('opens the table\'s log through Atlas\'s switch', () => {
    const { store, isOpen } = fakeStore();
    let toggles = 0;
    takeOverDiceLog(store, () => (toggles += 1));
    expect(openThroughAtlas(store)).toBe(true);
    expect(toggles).toBe(1);
    expect(isOpen()).toBe(false);
    const bare: SceneStore = { getState: () => ({}) as SceneState, setState: () => undefined, subscribe: () => () => undefined };
    expect(openThroughAtlas(bare)).toBe(false);
  });
});
