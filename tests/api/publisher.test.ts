import { beforeEach, describe, expect, it, vi } from 'vitest';

const initialize = vi.hoisted(() => vi.fn<() => Promise<void>>());
const sceneListeners = vi.hoisted(() => new Set<() => void>());
const collectionListeners = vi.hoisted(() => new Set<() => void>());
vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: {
    getInstance: (): { initialize: () => Promise<void>; onScenesChanged: (listener: () => void) => () => void; onCollectionsChanged: (listener: () => void) => () => void } => ({
      initialize,
      onScenesChanged: (listener: () => void): (() => void) => { sceneListeners.add(listener); return () => { sceneListeners.delete(listener); }; },
      onCollectionsChanged: (listener: () => void): (() => void) => { collectionListeners.add(listener); return () => { collectionListeners.delete(listener); }; },
    }),
  },
}));

// The facades load the present path, which loads the view code; none of it runs here.
vi.mock('../../src/app/services/presentToPlayers', () => ({ presentTabToPlayers: vi.fn(), stopPresenting: vi.fn() }));

vi.mock('../../src/api/atlasViewHooks', () => ({
  ATLAS_VIEW_HOOKS: { viewTypes: ['atlas-vtt'], isMapView: (): boolean => false, activeView: (): null => null },
}));

import type AtlasVTTPlugin from '../../main';
import { ExtensionApiPublisher } from '../../src/api/ExtensionApiPublisher';
import { bundleNoteKeys } from '../../src/app/extensions/bundleNoteKeys';
import { SightFramesByView } from '../../src/api/sightFramesByView';
import { fakeApp, fakePlugin } from './apiFakes';

function atlas(): { plugin: AtlasVTTPlugin; triggered: ReturnType<typeof fakeApp>['triggered'] } {
  const { app, triggered } = fakeApp();
  const stored: Record<string, unknown> = {};
  const settingsService = { getSetting: (key: string): unknown => stored[key] ?? {}, setSetting: (key: string, value: unknown): void => { stored[key] = value; }, onChange: (): (() => void) => () => undefined, getLaserPointerSettings: () => ({ color: '#ff0059', size: 16 }), getDiceLook: () => ({ colour: 'card', font: 'default' }), getDiceDisplay: () => 'full', getLocalPlayerViewSettings: () => ({}) };
  return { plugin: { app, api: undefined, settingsService } as unknown as AtlasVTTPlugin, triggered };
}

describe('ExtensionApiPublisher', () => {
  beforeEach(() => {
    initialize.mockReset();
    sceneListeners.clear();
    collectionListeners.clear();
  });

  it('sets plugin.api only once the asset index is ready, then announces it', async () => {
    let finish: () => void = () => undefined;
    initialize.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { plugin, triggered } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    const started = publisher.start();
    expect(plugin.api).toBeUndefined();
    expect(triggered).toEqual([]);
    finish();
    await started;
    expect(plugin.api).toBeDefined();
    expect(triggered).toEqual([{ name: 'atlas-vtt:api-ready', data: [plugin.api] }]);
  });

  it('publishes nothing when Atlas unloads before the index is ready', async () => {
    let finish: () => void = () => undefined;
    initialize.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { plugin, triggered } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    const started = publisher.start();
    publisher.stop();
    finish();
    await started;
    expect(plugin.api).toBeUndefined();
    expect(triggered).toEqual([]);
  });

  it('on stop tells connected extensions, clears plugin.api and triggers api-unload', async () => {
    initialize.mockResolvedValue(undefined);
    const { plugin, triggered } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    await publisher.start();
    const listener = vi.fn();
    plugin.api?.connect(fakePlugin('ext')).on('unload', listener);
    publisher.stop();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(plugin.api).toBeUndefined();
    expect(triggered.at(-1)).toEqual({ name: 'atlas-vtt:api-unload', data: [] });
  });

  it('publishes even when the asset index fails to load', async () => {
    initialize.mockRejectedValue(new Error('index unreadable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { plugin, triggered } = atlas();
    await new ExtensionApiPublisher(plugin).start();
    expect(plugin.api).toBeDefined();
    expect(triggered).toEqual([{ name: 'atlas-vtt:api-ready', data: [plugin.api] }]);
  });

  it('does no work for extensions until the first one connects: no tracker, no watches', async () => {
    initialize.mockResolvedValue(undefined);
    const { plugin } = atlas();
    const on = vi.spyOn(plugin.app.workspace, 'on');
    const onChange = vi.spyOn(plugin.settingsService, 'onChange');
    const publisher = new ExtensionApiPublisher(plugin);
    await publisher.start();
    expect(plugin.api).toBeDefined();
    expect(on).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(sceneListeners.size).toBe(0);
    expect(collectionListeners.size).toBe(0);
    plugin.api?.connect(fakePlugin('ext'));
    expect(on.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['layout-change', 'atlas-vtt:collection-settings-changed']));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(sceneListeners.size).toBe(1);
    expect(collectionListeners.size).toBe(1);
    // A second extension, or a reconnect, starts nothing more.
    plugin.api?.connect(fakePlugin('other'));
    plugin.api?.connect(fakePlugin('ext'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(sceneListeners.size).toBe(1);
    publisher.stop();
    expect(sceneListeners.size).toBe(0);
  });

  it('C-scenes-4: tells extensions when the index reports a scene change, until stopped', async () => {
    initialize.mockResolvedValue(undefined);
    const { plugin } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    await publisher.start();
    const listener = vi.fn();
    plugin.api?.connect(fakePlugin('ext')).on('scenes-changed', listener);
    for (const notify of sceneListeners) notify();
    expect(listener).toHaveBeenCalledTimes(1);
    publisher.stop();
    expect(sceneListeners.size).toBe(0);
  });

  it('tells extensions collections-changed when the index reports a collection change, until stopped', async () => {
    initialize.mockResolvedValue(undefined);
    const { plugin } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    await publisher.start();
    const listener = vi.fn();
    plugin.api?.connect(fakePlugin('ext')).on('collections-changed', listener);
    for (const notify of collectionListeners) notify();
    expect(listener).toHaveBeenCalledTimes(1);
    publisher.stop();
    expect(collectionListeners.size).toBe(0);
  });

  it('keeps the note properties extensions ask to strip in the settings, and takes them back from there', async () => {
    initialize.mockResolvedValue(undefined);
    const { plugin } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    await publisher.start();
    const stop = plugin.api?.connect(fakePlugin('ext')).bundles.stripNoteProperties(['ext-share']);
    expect(plugin.settingsService.getSetting('extensionNoteKeys')).toEqual({ ext: ['ext-share'] });
    publisher.stop();
    // Atlas starts again with the extension not loaded
    await new ExtensionApiPublisher(plugin).start();
    expect(bundleNoteKeys.keys().has('ext-share')).toBe(true);
    stop?.();
    expect(plugin.settingsService.getSetting('extensionNoteKeys')).toEqual({});
    expect(bundleNoteKeys.keys().has('ext-share')).toBe(false);
  });

  it('disposes the sight frames of every view on stop', async () => {
    initialize.mockResolvedValue(undefined);
    const dispose = vi.spyOn(SightFramesByView.prototype, 'dispose');
    const publisher = new ExtensionApiPublisher(atlas().plugin);
    await publisher.start();
    publisher.stop();
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
  });
});
