import { describe, expect, it, vi } from 'vitest';
import { AtlasView } from '../../src/app/atlas-view';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { forgetExploredEdits, withoutExploredEdits } from '../../src/app/stores/exploredEditHistory';
import { getHistoryStore, runHistoryTransaction, type HistoryState } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));

function createStore(): { store: ViewAtlasStore; history: () => HistoryState } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `explored-edits-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  const history = getHistoryStore(store)!;
  return { store, history: () => history.getState() };
}

const addWall = (store: ViewAtlasStore, x: number): string => store.getState().addWall({ type: 'solid', p1: { x, y: 0 }, p2: { x, y: 100 }, closed: true });
const walls = (store: ViewAtlasStore): number => Object.keys(store.getState().objects.walls).length;
/** The store as undo and redo see it: how many walls, and how many memory edits. */
const at = (store: ViewAtlasStore): string => `${walls(store)} walls, ${store.getState().exploredEdits} edits`;

describe('edits of the explored memory in the undo history', () => {
  it('starts a scene without any, and counts each as one undo step', () => {
    const { store, history } = createStore();
    expect(store.getState().exploredEdits).toBe(0);
    store.getState().setExploredEdits(1);
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(store.getState().exploredEdits).toBe(0);
    history().redo();
    expect(store.getState().exploredEdits).toBe(1);
  });

  it('undoes and redoes memory edits and store edits in the order they were made', () => {
    const { store, history } = createStore();
    addWall(store, 10);
    store.getState().setExploredEdits(1);
    addWall(store, 20);
    store.getState().setExploredEdits(2);
    store.getState().setExploredEdits(3);
    addWall(store, 30);
    expect(at(store)).toBe('3 walls, 3 edits');

    const undone: string[] = [];
    while (history().pastStates.length > 0) {
      history().undo();
      undone.push(at(store));
    }
    expect(undone).toEqual(['2 walls, 3 edits', '2 walls, 2 edits', '2 walls, 1 edits', '1 walls, 1 edits', '1 walls, 0 edits', '0 walls, 0 edits']);

    const redone: string[] = [];
    while (history().futureStates.length > 0) {
      history().redo();
      redone.push(at(store));
    }
    expect(redone).toEqual(['1 walls, 0 edits', '1 walls, 1 edits', '2 walls, 1 edits', '2 walls, 2 edits', '2 walls, 3 edits', '3 walls, 3 edits']);
  });

  it('never saves the count, never reads one from a file, and starts over with each scene', () => {
    const { store } = createStore();
    store.getState().setExploredEdits(4);
    store.setState({ persistenceEnabled: true });
    expect(store.persist.getOptions().partialize?.(store.getState())).not.toHaveProperty('exploredEdits');
    expect(store.persist.getOptions().merge!({ exploredEdits: 9 }, store.getState()).exploredEdits).toBe(4);
    store.getState().clearMapState();
    expect(store.getState().exploredEdits).toBe(0);
  });
});

describe('withoutExploredEdits', () => {
  /** The history of `store`, as the states it would step through: past, then the current one in brackets, then redo's. */
  function timeline(store: ViewAtlasStore, { pastStates, futureStates }: Pick<HistoryState, 'pastStates' | 'futureStates'>): string {
    const name = (state: { objects?: unknown; exploredEdits?: unknown }): string => `${Object.keys((state.objects as { walls: object }).walls).length}w${String(state.exploredEdits)}e`;
    return [...pastStates.map((step) => name(step.before)), `[${name(store.getState())}]`, ...[...futureStates].reverse().map((step) => name(step.after))].join(' ');
  }

  it('leaves out the steps that only edited the memory, in what was done and in what was undone', () => {
    const { store, history } = createStore();
    addWall(store, 10);
    store.getState().setExploredEdits(1);
    store.getState().setExploredEdits(2);
    addWall(store, 20);
    store.getState().setExploredEdits(3);
    addWall(store, 30);
    store.getState().setExploredEdits(4);
    history().undo();
    history().undo();
    history().undo();
    expect(timeline(store, history())).toBe('0w0e 1w0e 1w1e 1w2e [2w2e] 2w3e 3w3e 3w4e');

    const kept = withoutExploredEdits(history());
    expect(timeline(store, kept).replace('[2w2e]', '[2w0e]')).toBe('0w0e 1w0e [2w0e] 3w0e');
    // The history itself is untouched.
    expect(history().pastStates).toHaveLength(4);
  });

  it('keeps a step that changed the map along with the memory', () => {
    const { store, history } = createStore();
    runHistoryTransaction(store, () => {
      addWall(store, 10);
      store.getState().setExploredEdits(1);
    });
    const kept = withoutExploredEdits(history());
    expect(kept.pastStates).toHaveLength(1);
    expect(kept.pastStates[0]!.before).toMatchObject({ exploredEdits: 0 });
  });

  it('leaves a history without memory edits as it is', () => {
    const { store, history } = createStore();
    addWall(store, 10);
    addWall(store, 20);
    history().undo();
    const kept = withoutExploredEdits(history());
    expect(kept.pastStates.map((step) => step.before.objects)).toEqual(history().pastStates.map((step) => step.before.objects));
    expect(kept.futureStates.map((step) => step.after.objects)).toEqual(history().futureStates.map((step) => step.after.objects));
  });
});

describe('forgetExploredEdits', () => {
  it('takes the memory\'s steps out of the live history, without a step of its own and without a write to the store', () => {
    const { store, history } = createStore();
    addWall(store, 10);
    store.getState().setExploredEdits(1);
    addWall(store, 20);
    store.getState().setExploredEdits(2);
    const listener = vi.fn();
    store.subscribe(listener);
    forgetExploredEdits(store);
    expect(listener).not.toHaveBeenCalled();
    expect(history().pastStates).toHaveLength(2);

    // Undo now steps through the walls alone, and the count stays where it was: no step does nothing.
    history().undo();
    expect(at(store)).toBe('1 walls, 2 edits');
    history().undo();
    expect(at(store)).toBe('0 walls, 2 edits');
    expect(history().pastStates).toHaveLength(0);
    history().redo();
    history().redo();
    expect(at(store)).toBe('2 walls, 2 edits');
  });

  it('records no step when it runs inside a store notification, as a restored context makes it', () => {
    const { store, history } = createStore();
    store.getState().setExploredEdits(1);
    addWall(store, 10);
    const stop = store.subscribe(() => forgetExploredEdits(store));
    // A write that is no undo step itself.
    store.getState().setSceneLighting({ ambient: 0.5 });
    stop();
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(at(store)).toBe('0 walls, 1 edits');
    expect(history().pastStates).toHaveLength(0);
  });
});

describe('a tab\'s cached history', () => {
  it('keeps the map\'s steps and none of the explored memory\'s: the memory holds them only while its scene stays loaded', () => {
    const { store, history } = createStore();
    addWall(store, 10);
    store.getState().setExploredEdits(1);
    addWall(store, 20);
    store.getState().setExploredEdits(2);
    const context = { store, temporalCache: new Map<string, Pick<HistoryState, 'pastStates' | 'futureStates'>>() };
    Object.setPrototypeOf(context, AtlasView.prototype);
    (context as unknown as { saveTemporalState: (tabId: string) => void }).saveTemporalState('tab');

    const cached = context.temporalCache.get('tab')!;
    expect(cached.pastStates).toHaveLength(2);
    expect(cached.pastStates.every((step) => step.before.exploredEdits === 0 && step.after.exploredEdits === 0)).toBe(true);
    // The scene's own history still holds them, until it is left.
    expect(history().pastStates).toHaveLength(4);
  });
});
