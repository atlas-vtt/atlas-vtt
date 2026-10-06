import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { forgetExploredEdits } from '../../src/app/stores/exploredEditHistory';
import {
  abandonHistoryTransaction, beginHistoryTransaction, discardHistoryTransaction, endHistoryTransaction,
  getHistoryStore, runHistoryTransaction, runUntracked, type HistoryState,
} from '../../src/app/stores/history';
import { AssetService } from '../../src/app/services/AssetService';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import type { CounterWidget } from '../../src/app/types/widgetTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => vi.restoreAllMocks());

function openStore(): { store: ViewAtlasStore; history: () => HistoryState } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `notifications-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  const history = getHistoryStore(store)!;
  return { store, history: () => history.getState() };
}

const x = (store: ViewAtlasStore, id: string): number | undefined => store.getState().objects.tokens[id]?.x;
const stacks = (history: () => HistoryState): string => `${history().pastStates.length}/${history().futureStates.length}`;
const wallCount = (store: ViewAtlasStore): number => Object.keys(store.getState().objects.walls).length;
const addWall = (store: ViewAtlasStore, at: number): string => store.getState().addWall({ type: 'solid', p1: { x: at, y: 0 }, p2: { x: at, y: 70 } });

/** Runs `effect` inside the next notification of the store, once. */
function onNextWrite(store: ViewAtlasStore, effect: () => void): void {
  let done = false;
  const stop = store.subscribe(() => {
    if (done) return;
    done = true;
    stop();
    effect();
  });
}

describe('what the history does around store notifications', () => {
  it('still takes back a change Atlas made to the very entity the undone step changed', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    runUntracked(store, () => store.getState().retargetRenamedFile('art/a.png', 'art/a2.png'));
    history().undo();
    expect(store.getState().objects.tokens[a]).toMatchObject({ x: 0, imagePath: 'art/a.png' });
  });

  it('saves nothing for an undo alone; the next write saves the undone state', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    const setItem = vi.spyOn(store.persist.getOptions().storage!, 'setItem').mockImplementation(() => undefined);
    store.setState({ persistenceEnabled: true });
    setItem.mockClear();
    history().undo();
    expect(setItem).not.toHaveBeenCalled();
    store.getState().setActiveTool('select');
    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem.mock.calls[0]![1].state.objects?.tokens?.[a]?.x).toBe(0);
  });

  it('leaves no step for a gesture cancelled inside a notification once its close waits for the write', async () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    beginHistoryTransaction(store);
    store.getState().moveToken(a, 50, 0);
    onNextWrite(store, () => {
      store.getState().moveToken(a, 0, 0);
      queueMicrotask(() => abandonHistoryTransaction(store));
    });
    store.getState().setActiveTool('select');
    await Promise.resolve();
    expect(stacks(history)).toBe('1/0');
    store.getState().moveToken(a, 10, 0);
    expect(stacks(history)).toBe('2/0');
  });

  it('leaves the step to the write in whose notification a gesture was cancelled at once', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    beginHistoryTransaction(store);
    store.getState().moveToken(a, 50, 0);
    onNextWrite(store, () => {
      store.getState().moveToken(a, 0, 0);
      abandonHistoryTransaction(store);
    });
    store.getState().setActiveTool('select');
    expect(stacks(history)).toBe('2/0');
    history().undo();
    expect(x(store, a)).toBe(50);
    history().undo();
    expect(x(store, a)).toBeUndefined();
  });

  it('takes the drawn walls away with the step below once a cancelled chain left them to the write', () => {
    const { store, history } = openStore();
    addWall(store, 0);
    const placed: string[] = [];
    beginHistoryTransaction(store);
    placed.push(addWall(store, 10), addWall(store, 20));
    onNextWrite(store, () => {
      store.getState().deleteWalls(placed);
      discardHistoryTransaction(store);
    });
    store.getState().setActiveTool('select');
    expect(stacks(history)).toBe('2/0');
    history().undo();
    expect(wallCount(store)).toBe(3);
    history().undo();
    expect(wallCount(store)).toBe(0);
    history().redo();
    expect(wallCount(store)).toBe(3);
  });

  it('records a stroke finished inside a notification, and then the write it came with', () => {
    const { store, history } = openStore();
    addWall(store, 0);
    onNextWrite(store, () => runHistoryTransaction(store, () => {
      addWall(store, 10);
      addWall(store, 20);
    }));
    store.getState().setGMView(false);
    expect(stacks(history)).toBe('3/0');
    const shown: number[] = [];
    while (history().pastStates.length > 0) {
      history().undo();
      shown.push(wallCount(store));
    }
    while (history().futureStates.length > 0) {
      history().redo();
      shown.push(wallCount(store));
    }
    expect(shown).toEqual([1, 1, 0, 1, 1, 3]);
  });

  it('records no step for the write in whose notification a transaction begins', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    onNextWrite(store, () => beginHistoryTransaction(store));
    store.getState().moveToken(a, 70, 0);
    expect(stacks(history)).toBe('1/0');
    endHistoryTransaction(store);
    expect(stacks(history)).toBe('1/0');
    history().undo();
    expect(x(store, a)).toBeUndefined();
  });

  it('records a write a listener makes during an undo before the undone step goes onto the redo stack', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    onNextWrite(store, () => store.getState().moveToken(a, 30, 0));
    history().undo();
    expect(stacks(history)).toBe('2/1');
    expect(x(store, a)).toBe(30);
  });

  it('ends with the same stacks when the explored memory forgets its edits inside an undo', async () => {
    const { store, history } = openStore();
    addWall(store, 0);
    store.getState().setExploredEdits(1);
    addWall(store, 10);
    store.getState().setExploredEdits(2);
    onNextWrite(store, () => {
      forgetExploredEdits(store);
      queueMicrotask(() => forgetExploredEdits(store));
    });
    history().undo();
    expect(stacks(history)).toBe('2/1');
    await Promise.resolve();
    expect(stacks(history)).toBe('2/0');
    expect(`${wallCount(store)}w${store.getState().exploredEdits}e`).toBe('2w1e');
    history().undo();
    expect(`${wallCount(store)}w${store.getState().exploredEdits}e`).toBe('1w1e');
  });

  it('writes the store once per undo, also for a step that changed no entity', () => {
    const { store, history } = openStore();
    store.setState({ objects: { ...store.getState().objects } });
    expect(stacks(history)).toBe('1/0');
    const listener = vi.fn();
    store.subscribe(listener);
    history().undo();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('records a write on one view made while another view writes untracked, and the other way round', () => {
    const { store: one, history: oneHistory } = openStore();
    const { store: two, history: twoHistory } = openStore();
    runUntracked(two, () => one.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' }));
    runUntracked(one, () => two.getState().addToken({ x: 0, y: 0, imagePath: 'art/b.png' }));
    expect(stacks(oneHistory)).toBe('1/0');
    expect(stacks(twoHistory)).toBe('1/0');
  });

  it('makes the widget values Atlas fills in during an edit part of that edit\'s step', async () => {
    const fear: CounterWidget = { id: 'fear', type: 'counter', label: 'Fear', icon: 'skull', scope: 'collection', visible: true, visibleToPlayers: true, value: 2, order: 0 };
    const { app } = createInMemoryApp();
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      initialize: () => Promise.resolve(),
      getCollectionForMap: () => 'campaign',
      getCollectionSettings: () => ({ conditions: [] }),
      updateCollectionSettings: () => Promise.resolve(),
    } as never);
    const sync = new WidgetSyncService({ app } as never);
    const views = ['a', 'b'].map((viewId) => {
      const store = createViewAtlasStore(app, `${viewId}-${Math.random()}`);
      store.getState().setPersistenceEnabled(false);
      sync.registerStore(viewId, store);
      store.getState().setMapLoading(true);
      store.getState().setMapPath('atlas-vtt/collections/campaign/scenes/cave.atlasmap');
      store.getState().setMapLoading(false);
      return store;
    });
    await Promise.resolve();
    const [source, mirror] = views as [ViewAtlasStore, ViewAtlasStore];
    const history = getHistoryStore(source)!;
    history.getState().clear();
    source.getState().addWidget(fear);
    expect(source.getState().widgetValues.fear).toBe(2);
    expect(mirror.getState().widgetValues.fear).toBe(2);
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(history.getState().futureStates).toHaveLength(1);
    expect(source.getState().widgetValues).toEqual({ fear: 2 });
    sync.destroy();
  });
});
