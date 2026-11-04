// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AssetService } from '../../src/app/services/AssetService';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { dropWidgetsFromJson } from '../../src/app/services/sceneWidgetFiles';
import { sceneAdoption } from '../../src/app/services/assetTransfer/sceneAdoption';
import type { WidgetRecord } from '../../src/app/utils/collectionWidgets';
import { isWidgetOn } from '../../src/app/utils/widgetActivation';
import { widgetRows } from '../../src/app/react/components/command-palette/widgetRows';
import type { CounterWidget } from '../../src/app/types/widgetTypes';

const torches: CounterWidget = {
  id: 'torches', type: 'counter', label: 'Torches', icon: 'flame', scope: 'scene',
  visible: true, visibleToPlayers: true, value: 0, order: 0,
};
const scenePath = (scene: string): string => `atlas-vtt/collections/campaign/scenes/${scene}.atlasmap`;

function setup(saved: WidgetRecord = {}): { sync: WidgetSyncService; open: (viewId: string, scene: string, widgets?: WidgetRecord) => ViewAtlasStore } {
  const { app } = createInMemoryApp();
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    initialize: () => Promise.resolve(),
    getCollectionForMap: (path: string) => path.match(/collections\/([^/]+)\//)?.[1] ?? null,
    getCollectionSettings: () => ({ conditions: [], widgets: saved }),
    updateCollectionSettings: vi.fn(() => Promise.resolve()),
  } as never);
  const sync = new WidgetSyncService({ app } as never);

  /** Opens a scene whose file holds `widgets`. */
  const open = (viewId: string, scene: string, widgets: WidgetRecord = {}): ViewAtlasStore => {
    const store = createViewAtlasStore(app, viewId);
    store.getState().setPersistenceEnabled(false);
    sync.registerStore(viewId, store);
    store.getState().setMapLoading(true);
    store.getState().setMapPath(scenePath(scene));
    store.setState({ widgetSettings: { ...store.getState().widgetSettings, widgets } });
    store.getState().setMapLoading(false);
    return store;
  };
  return { sync, open };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collection widget library', () => {
  it('lists a widget created in one scene for the whole collection, switched off elsewhere', async () => {
    const { sync, open } = setup();
    const cave = open('cave', 'cave');
    const keep = open('keep', 'keep');
    await Promise.resolve();

    cave.getState().addWidget(torches);

    expect(sync.collectionLibrary('campaign').torches?.label).toBe('Torches');
    expect(keep.getState().widgetSettings.widgets.torches).toBeUndefined();
  });

  it('counts a widget switched on in several scenes separately in each', async () => {
    const { sync, open } = setup();
    const cave = open('cave', 'cave');
    const keep = open('keep', 'keep');
    await Promise.resolve();
    cave.getState().addWidget(torches);
    cave.getState().setWidgetValue('torches', 3);

    keep.getState().addWidget(sync.collectionLibrary('campaign').torches!);
    keep.getState().setWidgetValue('torches', 1);

    expect(cave.getState().widgetValues.torches).toBe(3);
    expect(keep.getState().widgetValues.torches).toBe(1);
  });

  it('shows a renamed widget under its new name in every scene, keeping each value', async () => {
    const { open } = setup();
    const cave = open('cave', 'cave');
    const keep = open('keep', 'keep');
    await Promise.resolve();
    cave.getState().addWidget(torches);
    keep.getState().addWidget(torches);
    keep.getState().setWidgetValue('torches', 4);

    cave.getState().updateWidget('torches', { label: 'Lanterns' });

    expect(keep.getState().widgetSettings.widgets.torches?.label).toBe('Lanterns');
    expect(keep.getState().widgetValues.torches).toBe(4);
  });

  it('switches a widget on in every scene from a scene where it was off', async () => {
    const { sync, open } = setup();
    const cave = open('cave', 'cave');
    const keep = open('keep', 'keep');
    await Promise.resolve();
    cave.getState().addWidget(torches);

    keep.getState().addWidget({ ...sync.collectionLibrary('campaign').torches!, scope: 'collection' });

    expect(cave.getState().widgetSettings.widgets.torches?.scope).toBe('collection');
  });

  it('adds the widgets of a scene that the library lacks once it loads', async () => {
    const { sync, open } = setup();
    open('old', 'old', { torches: { ...torches, value: 5 } });

    await waitFor(() => expect(sync.collectionLibrary('campaign').torches).toEqual(torches));
  });

  it('removes a deleted widget from map files, also where it was switched off', () => {
    const file = JSON.stringify({
      version: 4,
      state: { widgetSettings: { widgets: { torches }, offWidgets: ['torches', 'fear'] }, widgetValues: { torches: 2 } },
    });
    const only = (widgetId: string) => (id: string): boolean => id === widgetId;
    const rewritten = JSON.parse(dropWidgetsFromJson(file, only('torches'))!);
    expect(rewritten.state.widgetSettings.widgets).toEqual({});
    expect(rewritten.state.widgetSettings.offWidgets).toEqual(['fear']);
    expect(rewritten.state.widgetValues).toEqual({});
    expect(JSON.parse(dropWidgetsFromJson(file, only('fear'))!).state.widgetSettings.offWidgets).toEqual(['torches']);
    expect(dropWidgetsFromJson(file, only('clock'))).toBeNull();
  });

  it('takes the old collection\'s widgets off a scene copied or moved into another collection', () => {
    const lanterns = { ...torches, id: 'lanterns' };
    const file = JSON.stringify({
      version: 4,
      state: {
        widgetSettings: { widgets: { torches, lanterns }, offWidgets: ['old-fear', 'lanterns'] },
        widgetValues: { torches: 2, lanterns: 1 },
      },
    });
    const adopted = sceneAdoption('target', { conditions: [], widgets: { lanterns } });

    const state = JSON.parse(adopted.map(file)!).state;
    expect(Object.keys(state.widgetSettings.widgets)).toEqual(['lanterns']);
    expect(state.widgetSettings.offWidgets).toEqual(['lanterns']);
    expect(state.widgetValues).toEqual({ lanterns: 1 });
    expect(JSON.parse(adopted.snapshot(file)!).state.widgetSettings.widgets).toEqual({ lanterns });
  });

  it('keeps the widgets of a scene moved in while open out of the new collection\'s library', async () => {
    const { sync, open } = setup();
    const inn = open('inn', 'inn');
    await Promise.resolve();
    inn.getState().setMapPath('atlas-vtt/collections/side-quest/scenes/inn.atlasmap');
    inn.setState({ widgetSettings: { ...inn.getState().widgetSettings, widgets: { torches } } });
    inn.getState().setMapPath(scenePath('inn'));
    await Promise.resolve();

    expect(sync.collectionLibrary('campaign').torches).toBeUndefined();
  });
});

describe('switching widgets on and off in a scene', () => {
  const fear: CounterWidget = { ...torches, id: 'fear', label: 'Fear', scope: 'collection', value: 2 };

  it('keeps a scene widget and its value while it is off', () => {
    const { open } = setup();
    const cave = open('cave', 'cave', { torches });
    cave.getState().setWidgetValue('torches', 3);

    cave.getState().setWidgetOn('torches', false);
    expect(isWidgetOn(cave.getState().widgetSettings, torches)).toBe(false);
    expect(cave.getState().widgetValues.torches).toBe(3);

    cave.getState().setWidgetOn('torches', true);
    expect(cave.getState().widgetSettings.offWidgets).toBeUndefined();
  });

  it('switches a widget of every scene off in one scene only', async () => {
    const { open } = setup({ fear });
    const cave = open('cave', 'cave');
    const keep = open('keep', 'keep');
    await waitFor(() => expect(keep.getState().widgetSettings.widgets.fear).toBeDefined());

    cave.getState().setWidgetOn('fear', false);
    keep.getState().setWidgetValue('fear', 5);

    expect(isWidgetOn(cave.getState().widgetSettings, fear)).toBe(false);
    expect(isWidgetOn(keep.getState().widgetSettings, fear)).toBe(true);
    // The shared value carries on in the scene where it is off
    expect(cave.getState().widgetValues.fear).toBe(5);
  });

  it('treats widgets hidden by older Atlas versions as off until switched on', () => {
    const { open } = setup();
    const hidden = { ...torches, visible: false };
    const cave = open('cave', 'cave', { torches: hidden });
    expect(isWidgetOn(cave.getState().widgetSettings, hidden)).toBe(false);

    cave.getState().setWidgetOn('torches', true);
    expect(isWidgetOn(cave.getState().widgetSettings, cave.getState().widgetSettings.widgets.torches!)).toBe(true);
  });

  it('lists the scene\'s widgets, on or off, before the collection\'s others in their order', () => {
    const lanterns = { ...torches, id: 'lanterns', order: 1 };
    const rows = widgetRows([{ ...torches, order: 2 }], () => false, { lanterns, torches });
    expect(rows.map(({ widget, inScene, active }) => [widget.id, inScene, active])).toEqual([
      ['lanterns', false, false],
      ['torches', true, false],
    ]);
  });
});
