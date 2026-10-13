import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AssetService } from '../../src/app/services/AssetService';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';
import { runUntracked } from '../../src/app/stores/history';
import {
  pickLibraryWidgets,
  withCollectionEdit,
  withCollectionWidgets,
  withoutCollectionWidgets,
  type WidgetRecord,
} from '../../src/app/utils/collectionWidgets';
import type { CounterWidget, TimerWidget } from '../../src/app/types/widgetTypes';

const fear: CounterWidget = {
  id: 'fear', type: 'counter', label: 'Fear', icon: 'skull', scope: 'collection',
  visible: true, visibleToPlayers: true, value: 2, order: 0,
};
const torches: CounterWidget = { ...fear, id: 'torches', label: 'Torches', scope: 'scene', order: 1 };
const clock: TimerWidget = {
  id: 'clock', type: 'timer', label: 'Clock', icon: 'hourglass', scope: 'collection',
  visible: true, visibleToPlayers: true, value: 42, duration: 60, direction: 'down', order: 2,
};

describe('collection widget helpers', () => {
  it('picks every widget for the library, shared ones with their current value', () => {
    const library = pickLibraryWidgets({
      widgets: { fear, torches, clock },
      widgetValues: { fear: 5, torches: 3, clock: 1 },
    });
    expect(Object.keys(library)).toEqual(['fear', 'torches', 'clock']);
    expect(library.fear?.value).toBe(5);
    // Timers keep their running value on the definition
    expect(library.clock?.value).toBe(42);
    // Each scene counts its own widgets, so the library keeps their start value
    expect(library.torches?.value).toBe(0);
  });

  it('gives the scene\'s own widgets the library definition and keeps their value', () => {
    const merged = withCollectionWidgets(
      { widgets: { torches }, widgetValues: { torches: 3 } },
      { torches: { ...torches, label: 'Lanterns', value: 0 } },
    );
    expect(merged.widgets.torches?.label).toBe('Lanterns');
    expect(merged.widgets.torches?.value).toBe(torches.value);
    expect(merged.widgetValues.torches).toBe(3);
  });

  it('replaces only the collection widgets of a scene', () => {
    const stale = { ...fear, id: 'old' };
    const merged = withCollectionWidgets(
      { widgets: { torches, old: stale }, widgetValues: { torches: 3, old: 9 } },
      { fear: { ...fear, value: 6 }, clock },
    );
    expect(Object.keys(merged.widgets).sort()).toEqual(['clock', 'fear', 'torches']);
    expect(merged.widgetValues).toEqual({ torches: 3, fear: 6 });
  });

  it('applies only what a scene changed to the collection', () => {
    const collection = { fear: { ...fear, value: 5 }, clock };
    // Unchanged widgets keep the collection's newer value; the unseen clock stays.
    expect(withCollectionEdit(collection, { fear }, { fear })).toEqual(collection);
    expect(withCollectionEdit(collection, { fear }, { fear: { ...fear, value: 3 } }).fear?.value).toBe(3);
    // Removing a widget from a scene only switches it off there
    expect(withCollectionEdit(collection, { fear }, {})).toEqual(collection);
    expect(withCollectionEdit({}, {}, { fear })).toEqual({ fear });
  });

  it('keeps a scene timer\'s run in its scene and shares a collection timer\'s', () => {
    const running = { since: 1000, remaining: 42 };
    const lantern: TimerWidget = { ...clock, id: 'lantern', scope: 'scene', running };
    const library = pickLibraryWidgets({ widgets: { clock: { ...clock, running }, lantern }, widgetValues: {} });
    expect(library.clock?.type === 'timer' && library.clock.running).toBe(running);
    expect(library.lantern).toEqual({ ...clock, id: 'lantern', scope: 'scene', value: 60 });

    const merged = withCollectionWidgets(
      { widgets: { lantern }, widgetValues: {} },
      { lantern: { ...lantern, label: 'Lamp', value: 60, running: { since: 5, remaining: 60 } } },
    );
    expect(merged.widgets.lantern).toEqual({ ...lantern, label: 'Lamp' });
    const paused = withCollectionWidgets({ widgets: { lantern: { ...lantern, running: undefined } }, widgetValues: {} }, library);
    expect(paused.widgets.lantern && 'running' in paused.widgets.lantern).toBe(false);
  });

  it('leaves scenes without collection widgets untouched', () => {
    const scene = { widgets: { torches }, widgetValues: { torches: 3 } };
    expect(withoutCollectionWidgets(scene)).toBe(scene);
    expect(withoutCollectionWidgets({ widgets: { fear, torches }, widgetValues: { fear: 1, torches: 3 } }))
      .toEqual({ widgets: { torches }, widgetValues: { torches: 3 } });
  });
});

describe('scene files', () => {
  it('do not store collection widgets', async () => {
    const { app, files } = createInMemoryApp();
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    const path = 'atlas-vtt/collections/campaign/scenes/cave.atlasmap';
    const store = createViewAtlasStore(app, 'scene-file-test');
    store.setState({ mapPath: path, mapLoaded: true });
    store.getState().addWidget(fear);
    store.getState().addWidget(torches);
    store.getState().setWidgetValue('fear', 4);
    store.getState().setWidgetValue('torches', 1);
    await store.flushStorage();

    await waitFor(() => expect(files.has(getDataFilePath(path))).toBe(true));
    const saved = JSON.parse(files.get(getDataFilePath(path))!);
    expect(Object.keys(saved.state.widgetSettings.widgets)).toEqual(['torches']);
    expect(saved.state.widgetValues).toEqual({ torches: 1 });
  });
});

describe('WidgetSyncService', () => {
  const scenePath = (collection: string, scene: string): string =>
    `atlas-vtt/collections/${collection}/scenes/${scene}.atlasmap`;

  function setup(saved: WidgetRecord = {}): {
    sync: WidgetSyncService;
    open: (viewId: string, mapPath: string) => ViewAtlasStore;
    updateCollectionSettings: ReturnType<typeof vi.fn>;
  } {
    const { app } = createInMemoryApp();
    const updateCollectionSettings = vi.fn(() => Promise.resolve());
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      initialize: () => Promise.resolve(),
      getCollectionForMap: (path: string) => path.match(/collections\/([^/]+)\//)?.[1] ?? null,
      getCollectionSettings: (id: string) => ({ conditions: [], ...(id === 'campaign' ? { widgets: saved } : {}) }),
      updateCollectionSettings,
    } as never);
    const sync = new WidgetSyncService({ app } as never);

    const open = (viewId: string, mapPath: string): ViewAtlasStore => {
      const store = createViewAtlasStore(app, viewId);
      store.getState().setPersistenceEnabled(false);
      sync.registerStore(viewId, store);
      store.getState().setMapLoading(true);
      store.getState().setMapPath(mapPath);
      store.getState().setMapLoading(false);
      return store;
    };
    return { sync, open, updateCollectionSettings };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the collection widgets to a scene when it loads', async () => {
    const { open } = setup({ fear: { ...fear, value: 7 } });
    const cave = open('cave', scenePath('campaign', 'cave'));
    await waitFor(() => expect(cave.getState().widgetValues.fear).toBe(7));
  });

  it('keeps collection widgets on screen while another scene of the collection loads', async () => {
    const { open } = setup({ fear: { ...fear, value: 7 } });
    const view = open('view', scenePath('campaign', 'cave'));
    await waitFor(() => expect(view.getState().widgetValues.fear).toBe(7));
    const shown = view.getState().widgetSettings.widgets.fear;

    // What switching the view's scene tab does to the store
    const state = view.getState();
    state.setMapLoading(true);
    state.setMapPath(scenePath('campaign', 'keep'));
    state.clearMapState();
    expect(view.getState().widgetSettings.widgets.fear).toBe(shown);
    view.setState({
      widgetSettings: { ...view.getState().widgetSettings, widgets: { torches } },
      widgetValues: { torches: 1 },
    });
    expect(view.getState().widgetSettings.widgets.fear).toBe(shown);
    expect(view.getState().widgetValues).toEqual({ torches: 1, fear: 7 });
  });

  it('shares collection widgets with the collection and keeps scene widgets local', async () => {
    const { sync, open, updateCollectionSettings } = setup();
    const cave = open('cave', scenePath('campaign', 'cave'));
    const keep = open('keep', scenePath('campaign', 'keep'));
    const other = open('other', scenePath('side-quest', 'inn'));
    await Promise.resolve();

    cave.getState().addWidget(fear);
    cave.getState().addWidget(torches);
    cave.getState().setWidgetValue('fear', 3);

    expect(keep.getState().widgetSettings.widgets.fear?.scope).toBe('collection');
    expect(keep.getState().widgetValues.fear).toBe(3);
    expect(keep.getState().widgetSettings.widgets.torches).toBeUndefined();
    expect(other.getState().widgetSettings.widgets).toEqual({});

    sync.destroy();
    expect(updateCollectionSettings).toHaveBeenLastCalledWith('campaign', {
      widgets: { fear: { ...fear, value: 3 }, torches: { ...torches, value: 0 } },
    });
  });

  it('removes a widget from other scenes once it is no longer shared', async () => {
    const { open } = setup();
    const cave = open('cave', scenePath('campaign', 'cave'));
    const keep = open('keep', scenePath('campaign', 'keep'));
    await Promise.resolve();

    cave.getState().addWidget(fear);
    expect(keep.getState().widgetSettings.widgets.fear).toBeDefined();

    cave.getState().updateWidget('fear', { scope: 'scene' });
    expect(keep.getState().widgetSettings.widgets.fear).toBeUndefined();
    expect(cave.getState().widgetSettings.widgets.fear?.scope).toBe('scene');
  });

  it('never removes a collection widget through a scene that does not show it', async () => {
    const { sync, open, updateCollectionSettings } = setup({ fear });
    const cave = open('cave', scenePath('campaign', 'cave'));
    await waitFor(() => expect(cave.getState().widgetSettings.widgets.fear).toBeDefined());
    // A view that has not received the collection's widgets, e.g. still waiting for the asset index
    const keep = open('keep', scenePath('campaign', 'keep'));
    runUntracked(keep, () => keep.setState({ widgetSettings: { ...keep.getState().widgetSettings, widgets: {} } }));

    keep.getState().addWidget(torches);

    expect(cave.getState().widgetSettings.widgets.fear).toBeDefined();
    await waitFor(() => expect(keep.getState().widgetSettings.widgets.fear).toBeDefined());
    sync.destroy();
    expect(updateCollectionSettings).toHaveBeenLastCalledWith('campaign', {
      widgets: { fear, torches: { ...torches, value: 0 } },
    });
  });

  it('shows the collection widgets of a scene moved into the collection while it is open', async () => {
    const { sync, open, updateCollectionSettings } = setup({ fear: { ...fear, value: 7 } });
    const inn = open('inn', scenePath('side-quest', 'inn'));
    await Promise.resolve();
    expect(inn.getState().widgetSettings.widgets.fear).toBeUndefined();

    inn.getState().setMapPath(scenePath('campaign', 'inn'));
    expect(inn.getState().widgetValues.fear).toBe(7);

    inn.getState().addWidget(torches);
    sync.destroy();
    expect(updateCollectionSettings).toHaveBeenLastCalledWith('campaign', {
      widgets: { fear: { ...fear, value: 7 }, torches: { ...torches, value: 0 } },
    });
  });

  it('takes the collection widgets of a scene moved to another collection off it', async () => {
    const { sync, open, updateCollectionSettings } = setup({ fear });
    const cave = open('cave', scenePath('campaign', 'cave'));
    const inn = open('inn', scenePath('side-quest', 'inn'));
    await waitFor(() => expect(cave.getState().widgetSettings.widgets.fear).toBeDefined());

    cave.getState().setMapPath(scenePath('side-quest', 'cave'));
    expect(cave.getState().widgetSettings.widgets.fear).toBeUndefined();

    cave.getState().addWidget(torches);
    expect(inn.getState().widgetSettings.widgets.fear).toBeUndefined();
    sync.destroy();
    expect(updateCollectionSettings).toHaveBeenCalledTimes(1);
    expect(updateCollectionSettings).toHaveBeenCalledWith('side-quest', { widgets: { torches: { ...torches, value: 0 } } });
  });
});
