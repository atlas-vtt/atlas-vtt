import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiEvents } from '../../src/api/events';
import { rulesApi, watchRules } from '../../src/api/rules';
import { DEFAULT_CONE_ANGLE } from '../../src/app/grid/measurementFormat';
import { SettingsService } from '../../src/app/services/SettingsService';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { AssetService } from '../../src/app/services/AssetService';
import { mapDiceRules } from '../../src/app/services/mapDiceRules';
import { mapConeAngle } from '../../src/app/services/mapMeasurementSettings';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP = 'atlas-vtt/collections/c1/maps/a.atlasmap';

interface Bus { app: App; trigger(name: string, ...data: unknown[]): void; listeners(): number }

/** The in-memory app's workspace has no event bus, so this gives it a tiny one. */
function appWithBus(): Bus {
  const { app } = createInMemoryApp();
  const handlers = new Set<(...data: unknown[]) => void>();
  app.workspace = {
    on: (_name: string, handler: (...data: unknown[]) => void) => { handlers.add(handler); return handler; },
    offref: (ref: (...data: unknown[]) => void) => { handlers.delete(ref); },
    trigger: (_name: string, ...data: unknown[]) => { for (const handler of [...handlers]) handler(...data); },
  } as never;
  return { app, trigger: (name, ...data) => app.workspace.trigger(name, ...data), listeners: () => handlers.size };
}

function seedCollection(initialize: () => Promise<void> = () => Promise.resolve()): AssetService {
  const settings = {
    gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', coneAngle: 60 },
    dice: { defaultRoll: '1d6', crit: 'none', explode: { dice: 'default', repeats: true, highFaces: 1, lowFaces: 0 } },
    conditions: [{ id: 'k', name: 'Stunned', color: '#ff0000' }],
  };
  const assets = {
    getCollectionForMap: (path: string) => (path === MAP ? 'c1' : null),
    getCollectionSettings: () => settings,
    initialize,
  } as unknown as AssetService;
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets);
  return assets;
}

afterEach(() => vi.restoreAllMocks());

describe('rules', () => {
  it('C-rules-1: outside a collection forMap gives Atlas defaults; inside, the collection rules with the GM cone angle', () => {
    const { app } = appWithBus();
    const assets = seedCollection();
    const rules = rulesApi(app);
    const outside = rules.forMap(null);
    expect(outside.collectionId).toBeNull();
    expect(outside.gridDefaults).toBeNull();
    expect(outside.measurement.coneAngle).toBe(DEFAULT_CONE_ANGLE);
    expect(rules.forMap('maps/loose.atlasmap').collectionId).toBeNull();
    const inside = rules.forMap(MAP);
    expect(inside.collectionId).toBe('c1');
    expect(inside.measurement.coneAngle).toBe(60);
    expect(inside.measurement.coneAngle).toBe(mapConeAngle(assets, MAP));
    expect(inside.dice).toEqual(mapDiceRules(app, MAP));
    expect(inside.dice.explode).toEqual({ dice: 'default', repeats: true, highFaces: 1, lowFaces: 0 });
    expect(inside.conditions.map((condition) => condition.name)).toEqual(['Stunned']);
    expect(Object.isFrozen(inside)).toBe(true);
  });

  it('C-rules-4: the result is a deep-frozen copy; mutating it throws and leaves the collection settings alone', () => {
    const { app } = appWithBus();
    const assets = seedCollection();
    const inside = rulesApi(app).forMap(MAP);
    expect(() => (inside.conditions as unknown[]).push({})).toThrow(TypeError);
    expect(() => { (inside.gridDefaults as { coneAngle: number }).coneAngle = 1; }).toThrow(TypeError);
    expect(() => { (inside.dice as { defaultRoll: string }).defaultRoll = 'x'; }).toThrow(TypeError);
    expect(() => { (inside.measurement as { coneAngle: number }).coneAngle = 1; }).toThrow(TypeError);
    const stored = assets.getCollectionSettings('c1');
    expect(stored.conditions).toHaveLength(1);
    expect(Object.isFrozen(stored.conditions)).toBe(false);
    expect(stored.gridDefaults?.coneAngle).toBe(60);
  });

  it('C-rules-5: a collection without grid defaults gives null defaults and the default cone', () => {
    const { app } = appWithBus();
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      getCollectionForMap: () => 'bare', getCollectionSettings: () => ({ conditions: [] }),
    } as unknown as AssetService);
    const rules = rulesApi(app).forMap(MAP);
    expect(rules.collectionId).toBe('bare');
    expect(rules.gridDefaults).toBeNull();
    expect(rules.measurement.coneAngle).toBe(DEFAULT_CONE_ANGLE);
  });

  it('C-rules-2: rules-changed fires with the collection id when its settings are saved', () => {
    const { app, trigger } = appWithBus();
    seedCollection(() => new Promise<void>(() => undefined));
    const events = new ApiEvents();
    const listener = vi.fn();
    events.on('rules-changed', listener);
    const stop = watchRules(app, events);
    trigger('atlas-vtt:collection-settings-changed', 'c1');
    expect(listener).toHaveBeenCalledWith('c1');
    stop();
    trigger('atlas-vtt:collection-settings-changed', 'c1');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('C-rules-6: rules-changed fires with null when a user system preset is edited, not for other settings', async () => {
    const { app } = appWithBus();
    seedCollection();
    const settings = new SettingsService(app, Promise.resolve());
    await settings.initialize();
    // The user's presets are vault files; any change to them, here or synced from another device, is one notice.
    const presetListeners = new Set<() => void>();
    const presets = { onChange: (listener: () => void) => { presetListeners.add(listener); return () => { presetListeners.delete(listener); }; } };
    vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(presets as unknown as SystemPresetFiles);
    const changePreset = (): void => { for (const listener of [...presetListeners]) listener(); };
    const events = new ApiEvents();
    const listener = vi.fn();
    events.on('rules-changed', listener);
    const stop = watchRules(app, events, true);
    settings.setDiceDisplay('card');
    expect(listener).not.toHaveBeenCalled();
    changePreset();
    expect(listener.mock.calls).toEqual([[null]]);
    stop();
    expect(presetListeners.size).toBe(0);
    changePreset();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('C-rules-7: a settled index is not loaded again; an unsettled one that fails is logged', async () => {
    const { app } = appWithBus();
    const initialize = vi.fn(() => Promise.reject(new Error('unreadable')));
    seedCollection(initialize);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    watchRules(app, new ApiEvents(), true)();
    expect(initialize).not.toHaveBeenCalled();
    watchRules(app, new ApiEvents())();
    await Promise.resolve();
    await Promise.resolve();
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('C-rules-3: rules-changed fires with null once the asset index has loaded, and the watch leaves no handler after stop', async () => {
    const { app, listeners } = appWithBus();
    let finish: () => void = () => undefined;
    seedCollection(() => new Promise<void>((resolve) => { finish = resolve; }));
    const events = new ApiEvents();
    const listener = vi.fn();
    events.on('rules-changed', listener);
    const stop = watchRules(app, events);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledWith(null);
    stop();
    expect(listeners()).toBe(0);
  });
});
