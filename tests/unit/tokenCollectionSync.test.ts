import type { EventRef } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenCollectionSync } from '../../src/app/plugin/TokenCollectionSync';
import { AssetService } from '../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { HP, STRESS } from '../mocks/resourceFixtures';

function setup() {
  AssetService.resetInstance();
  const vault = createInMemoryApp({ files: { 'goblin.png': 'image' } });
  const { app } = vault;
  const assets = AssetService.getInstance(app);
  let resolveReady: () => void = () => {};
  let rejectReady: (reason: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  vi.spyOn(assets, 'initialize').mockReturnValue(ready);
  let settings: CollectionSettings = {
    conditions: [{ id: 'poisoned', name: 'Poisoned', color: '#ff4444' }],
    resources: [HP],
    gridDefaults: { unitType: 'meters', unitDistance: 2, measurementMode: 'metric', coneAngle: 60 },
  };
  vi.spyOn(assets, 'getCollectionForMap').mockImplementation((path) => path === 'a.atlasmap' ? 'a' : path === 'b.atlasmap' ? 'b' : null);
  vi.spyOn(assets, 'getCollectionSettings').mockImplementation(() => settings);
  const listeners = new Set<(collection: string) => void>();
  const collectionEvents: { on: (name: 'atlas-vtt:collection-settings-changed', callback: (id: string) => unknown) => EventRef } = app.workspace;
  vi.spyOn(collectionEvents, 'on').mockImplementation((_name, callback) => {
    const listener = (collection: string): void => { callback(collection); };
    listeners.add(listener);
    return { listener };
  });
  vi.spyOn(app.workspace, 'offref').mockImplementation((ref) => {
    if ('listener' in ref && typeof ref.listener === 'function') {
      for (const listener of listeners) if (listener === ref.listener) listeners.delete(listener);
    }
  });
  const store = createViewAtlasStore(app, 'collection-sync-test');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('a.atlasmap');
  const refreshRules = vi.fn();
  const refreshArt = vi.fn(async (_path: string): Promise<void> => {});
  const sync = new TokenCollectionSync(app, store.getState, { refreshRules, refreshArt });
  return {
    ...vault, assets, store, sync, refreshRules, refreshArt, resolveReady, rejectReady,
    changeCollection: (id: string): void => { for (const listener of listeners) listener(id); },
    setSettings: (next: CollectionSettings): void => { settings = next; },
  };
}

afterEach(() => { vi.restoreAllMocks(); AssetService.resetInstance(); });

describe('TokenCollectionSync', () => {
  it('reads the current map and current collection definitions on every call', () => {
    const f = setup();
    const conditions = f.sync.conditions;
    const resources = f.sync.resources;
    expect(conditions()).toEqual([{ id: 'poisoned', name: 'Poisoned', color: '#ff4444' }]);
    expect(resources()).toEqual([HP]);
    f.store.getState().setMapPath('b.atlasmap');
    f.setSettings({ conditions: [], resources: [STRESS] });
    expect(conditions()).toEqual([]);
    expect(resources()).toEqual([STRESS]);
    expect(f.assets.getCollectionSettings).toHaveBeenLastCalledWith('b');
    f.sync.destroy();
  });

  it('preserves resource fallbacks for empty, outside and unindexed collection paths', () => {
    const f = setup();
    for (const path of ['', 'outside.atlasmap']) {
      f.store.getState().setMapPath(path);
      expect(f.sync.conditions()).toEqual([]);
      expect(f.sync.resources().map((resource) => resource.key)).toEqual(['hp', 'stress']);
    }
    f.store.getState().setMapPath('atlas-vtt/collections/missing/map.atlasmap');
    expect(f.sync.conditions()).toEqual([]);
    expect(f.sync.resources()).toEqual([HP]);
    f.sync.destroy();
  });

  it('reads current measurement rules and map grid overrides', () => {
    const f = setup();
    const measurement = f.sync.measurement;
    expect(measurement()).toMatchObject({ unitType: 'meters', unitDistance: 2, ruleDistance: 2, coneAngle: 60 });
    const grid = f.store.getState().grid;
    if (!grid) throw new Error('Missing fixture grid');
    f.store.setState({ grid: { ...grid, unitDistanceOverride: 7 } });
    expect(measurement()).toMatchObject({ unitDistance: 7, ruleDistance: 2 });
    f.store.getState().setMapPath('outside.atlasmap');
    f.store.setState({ grid: { ...grid, unitDistanceOverride: 7, measurementType: 'units', unitType: 'yards', unitDistance: 3 } });
    expect(measurement()).toMatchObject({ unitType: 'yards', unitDistance: 7, ruleDistance: 3 });
    f.sync.destroy();
  });

  it('refreshes only changes to the current map collection', () => {
    const f = setup();
    f.changeCollection('b');
    expect(f.refreshRules).not.toHaveBeenCalled();
    f.changeCollection('a');
    expect(f.refreshRules).toHaveBeenCalledTimes(1);
    f.store.getState().setMapPath('b.atlasmap');
    f.changeCollection('a');
    expect(f.refreshRules).toHaveBeenCalledTimes(1);
    f.changeCollection('b');
    expect(f.refreshRules).toHaveBeenCalledTimes(2);
    f.store.getState().setMapPath('');
    f.changeCollection('b');
    expect(f.refreshRules).toHaveBeenCalledTimes(2);
    f.sync.destroy();
  });

  it('refreshes rules once initialization has completed', async () => {
    const f = setup();
    expect(f.assets.initialize).toHaveBeenCalledOnce();
    expect(f.refreshRules).not.toHaveBeenCalled();
    f.resolveReady();
    await Promise.resolve();
    expect(f.refreshRules).toHaveBeenCalledOnce();
    f.sync.destroy();
  });

  it('reports initialization failure without refreshing rules', async () => {
    const f = setup();
    const error = new Error('index failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.rejectReady(error);
    await Promise.resolve();
    expect(log).toHaveBeenCalledWith('[TokenRenderer] Failed to initialize AssetService:', error);
    expect(f.refreshRules).not.toHaveBeenCalled();
    f.sync.destroy();
  });

  it('forwards vault paths and removes listeners before late initialization', async () => {
    const f = setup();
    const file = f.app.vault.getFileByPath('goblin.png');
    f.emit('modify', file);
    expect(f.refreshArt).toHaveBeenCalledExactlyOnceWith('goblin.png');
    f.sync.destroy();
    f.sync.destroy();
    f.emit('modify', file);
    f.changeCollection('a');
    f.resolveReady();
    await Promise.resolve();
    expect(f.refreshArt).toHaveBeenCalledTimes(1);
    expect(f.refreshRules).not.toHaveBeenCalled();
    expect(f.app.workspace.offref).toHaveBeenCalledOnce();
    expect(f.app.vault.offref).toHaveBeenCalledOnce();
  });
});
