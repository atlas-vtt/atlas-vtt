import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AssetService } from '../../src/app/services/AssetService';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { createAtlasStorage } from '../../src/app/services/MapPersistence';
import type { WidgetRecord } from '../../src/app/utils/collectionWidgets';
import { pausedTimers, startedTimer, timerShownSeconds } from '../../src/app/utils/timerWidget';
import type { TimerWidget } from '../../src/app/types/widgetTypes';

const torch: TimerWidget = {
  id: 'torch', type: 'timer', label: 'Torch', icon: 'hourglass', scope: 'scene',
  visible: true, visibleToPlayers: true, value: 3600, duration: 3600, direction: 'down', order: 0,
};
const sharedTorch: TimerWidget = { ...torch, id: 'shared', scope: 'collection' };
const scenePath = (collection: string, scene: string): string => `atlas-vtt/collections/${collection}/scenes/${scene}.atlasmap`;
const MINUTE = 60_000;

interface Table {
  app: ReturnType<typeof createInMemoryApp>['app'];
  sync: WidgetSyncService;
  /** Opens a scene in a new view; `file` is what the scene file holds. */
  open: (viewId: string, path: string, file?: WidgetRecord) => Promise<ViewAtlasStore>;
  /** Moves a view to another scene, as MapService does; the load takes `loadMs`. */
  switchTo: (viewId: string, store: ViewAtlasStore, path: string, loadMs?: number) => Promise<void>;
  /** Closes a view, as AtlasView does; returns what its scene file then holds. */
  close: (viewId: string, store: ViewAtlasStore) => WidgetRecord;
}

function setup(libraries: Record<string, WidgetRecord> = {}): Table {
  const { app } = createInMemoryApp();
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    initialize: () => Promise.resolve(),
    getCollectionForMap: (path: string) => path.match(/collections\/([^/]+)\//)?.[1] ?? null,
    getCollectionSettings: (collectionId: string) => ({ conditions: [], widgets: libraries[collectionId] ?? {} }),
    updateCollectionSettings: vi.fn(() => Promise.resolve()),
  } as never);
  const sync = new WidgetSyncService({ app } as never);

  const load = async (store: ViewAtlasStore, path: string, file: WidgetRecord): Promise<void> => {
    const state = store.getState();
    state.setMapLoading(true);
    state.setMapLoaded(false);
    state.setMapPath(path);
    // What reading the file gives (`createAtlasStorage().getItem`)
    store.setState({ widgetSettings: { ...state.widgetSettings, widgets: pausedTimers(file) } });
    store.getState().setMapLoaded(true);
    store.getState().setMapLoading(false);
    await Promise.resolve();
    await Promise.resolve();
  };
  const open = async (viewId: string, path: string, file: WidgetRecord = {}): Promise<ViewAtlasStore> => {
    const store = createViewAtlasStore(app, viewId);
    store.getState().setPersistenceEnabled(false);
    sync.registerStore(viewId, store);
    await load(store, path, file);
    return store;
  };
  const switchTo = async (viewId: string, store: ViewAtlasStore, path: string, loadMs = 0): Promise<void> => {
    sync.leaveScene(viewId);
    pass(loadMs);
    await load(store, path, {});
  };
  const close = (viewId: string, store: ViewAtlasStore): WidgetRecord => {
    sync.closeView(viewId);
    sync.unregisterStore(viewId);
    return { ...store.getState().widgetSettings.widgets };
  };
  return { app, sync, open, switchTo, close };
}

const timer = (store: ViewAtlasStore, id = 'torch'): TimerWidget => store.getState().widgetSettings.widgets[id] as TimerWidget;
const shown = (store: ViewAtlasStore, id = 'torch'): number => timerShownSeconds(timer(store, id), Date.now());
const start = (store: ViewAtlasStore, id = 'torch'): void => store.getState().setTimerState(id, startedTimer(timer(store, id), Date.now()));
const pass = (ms: number): void => { vi.setSystemTime(Date.now() + ms); };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('timers stop when their scene closes', () => {
  it('reads a run left in a scene file as paused at the time last written, however long ago', async () => {
    const run = { since: Date.now() - 5 * 3_600_000, remaining: 1234.5 };
    const file = JSON.stringify({ version: 4, state: { mapPath: 'cave.atlasmap', objects: { tokens: {} }, widgetSettings: { widgets: { torch: { ...torch, value: 1234.5, running: run } } } } });
    const { app } = createInMemoryApp({ files: { 'cave.atlasmap': file } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    const storage = createAtlasStorage<{ mapPath: string }, { widgetSettings: { widgets: WidgetRecord } }>(app, { getState: () => ({ mapPath: 'cave.atlasmap' }) });

    const read = await storage.getItem('atlas');

    expect(read?.state.widgetSettings.widgets.torch).toEqual({ ...torch, value: 1234.5 });
  });

  it('closes a scene with its timer paused at the exact time left, and reopens it there later', async () => {
    const table = setup();
    const cave = await table.open('map', scenePath('campaign', 'cave'), { torch });
    start(cave);
    pass(90_500);

    const file = table.close('map', cave);
    expect(file.torch).toEqual({ ...torch, value: 3509.5 });

    pass(10 * 3_600_000);
    const reopened = await table.open('map', scenePath('campaign', 'cave'), file);
    expect(timer(reopened).running).toBeUndefined();
    expect(shown(reopened)).toBe(3510);
  });

  it('pauses the timer of a scene the view leaves for another before its last save', async () => {
    const table = setup();
    const cave = await table.open('map', scenePath('campaign', 'cave'), { torch });
    start(cave);
    pass(30_000);

    // 'map-unloading': the store still holds the scene and is flushed to its file next
    table.sync.leaveScene('map');

    expect(timer(cave)).toEqual({ ...torch, value: 3570 });
  });

  it('pauses every running timer when Atlas unloads', async () => {
    const table = setup();
    const cave = await table.open('map', scenePath('campaign', 'cave'), { torch });
    const flush = vi.spyOn(cave, 'flushStorage');
    start(cave);
    pass(MINUTE);

    table.sync.destroy();

    expect(timer(cave)).toEqual({ ...torch, value: 3540 });
    expect(flush).toHaveBeenCalled();
  });

  it('after a crash, loads the timer paused at its last minute checkpoint', async () => {
    const table = setup();
    const checkpoint = { ...torch, value: 3000, running: { since: Date.now() - 50_000, remaining: 3000 } };
    pass(3_600_000);

    const cave = await table.open('map', scenePath('campaign', 'cave'), { torch: checkpoint });

    expect(timer(cave)).toEqual({ ...torch, value: 3000 });
  });

  it('keeps a timer running in a view of the scene that stays open, and gives a view opened later its time', async () => {
    const table = setup();
    const path = scenePath('campaign', 'cave');
    const first = await table.open('first', path, { torch });
    const second = await table.open('second', path, { torch });
    start(first);
    pass(20_000);

    table.close('first', first);
    expect(timer(second).running).toBeDefined();
    expect(shown(second)).toBe(3580);

    // The file holds the last checkpoint; the open view knows the time
    const third = await table.open('third', path, { torch });
    expect(shown(third)).toBe(3580);
    pass(10_000);
    expect(shown(third)).toBe(3570);

    table.close('second', second);
    expect(timer(third).running).toBeDefined();
    table.close('third', third);
    expect(timer(third)).toEqual({ ...torch, value: 3570 });
  });
});

describe('collection-wide timers', () => {
  it('run on across the scenes of the collection and stop when the last one closes', async () => {
    const table = setup({ campaign: { shared: sharedTorch } });
    const cave = await table.open('cave', scenePath('campaign', 'cave'));
    const keep = await table.open('keep', scenePath('campaign', 'keep'));
    start(cave, 'shared');
    pass(MINUTE);
    expect(shown(keep, 'shared')).toBe(3540);

    table.close('cave', cave);
    expect(timer(keep, 'shared').running).toBeDefined();
    pass(MINUTE);
    expect(shown(keep, 'shared')).toBe(3480);

    table.close('keep', keep);
    expect(table.sync.collectionLibrary('campaign').shared).toEqual({ ...sharedTorch, value: 3480 });
  });

  it('run on when the view moves to another scene of the collection', async () => {
    const table = setup({ campaign: { shared: sharedTorch } });
    const view = await table.open('map', scenePath('campaign', 'cave'));
    start(view, 'shared');
    pass(MINUTE);

    await table.switchTo('map', view, scenePath('campaign', 'keep'), 5000);

    expect(timer(view, 'shared').running).toBeDefined();
    pass(MINUTE - 5000);
    expect(shown(view, 'shared')).toBe(3480);
  });

  it('stop at the moment the view left for a scene of another collection', async () => {
    const table = setup({ campaign: { shared: sharedTorch } });
    const view = await table.open('map', scenePath('campaign', 'cave'));
    start(view, 'shared');
    pass(MINUTE);

    await table.switchTo('map', view, scenePath('other', 'tower'), 5000);

    expect(table.sync.collectionLibrary('campaign').shared).toEqual({ ...sharedTorch, value: 3540 });
  });

  it('read a run left in the library by a crash as paused', async () => {
    const left = { ...sharedTorch, value: 3000, running: { since: Date.now() - 50_000, remaining: 3000 } };
    pass(3_600_000);
    const table = setup({ campaign: { shared: left } });

    const cave = await table.open('cave', scenePath('campaign', 'cave'));

    expect(timer(cave, 'shared')).toEqual({ ...sharedTorch, value: 3000 });
    expect(table.sync.collectionLibrary('campaign').shared).toEqual({ ...sharedTorch, value: 3000 });
  });

  it('keep running for a scene of the collection opened while another shows it', async () => {
    const table = setup({ campaign: { shared: sharedTorch } });
    const cave = await table.open('cave', scenePath('campaign', 'cave'));
    start(cave, 'shared');
    pass(MINUTE);

    const keep = await table.open('keep', scenePath('campaign', 'keep'));

    expect(timer(keep, 'shared').running).toBeDefined();
    expect(shown(keep, 'shared')).toBe(3540);
  });
});
