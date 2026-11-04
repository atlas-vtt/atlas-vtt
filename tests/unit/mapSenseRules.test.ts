import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../src/app/gameSystems/senses';
import type { AssetService } from '../../src/app/services/AssetService';
import { mapSenseRules, mapSenseRulesSource } from '../../src/app/services/mapSenseRules';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { parseSenses } from '../../src/app/creatures/parseSenses';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { gameUnitsToWorld, unitScaleOf } from '../../src/app/lighting/lightingUnits';
import * as validation from '../../src/app/gameSystems/presetValidation';
import { memoryPresets } from '../mocks/memoryPresets';
import type { GridState } from '../../src/app/types/gridTypes';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';

const app = {} as App;
const MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';

function assets(settings: Partial<CollectionSettings>): Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'> {
  return {
    getCollectionForMap: vi.fn((path: string) => (path === MAP ? 'dungeon' : null)),
    getCollectionSettings: vi.fn(() => ({ conditions: [], ...settings })),
  };
}

describe('mapSenseRules', () => {
  it('gives the collection\'s own senses and its measurement', () => {
    const senses = BUILT_IN_SENSES['builtin:pathfinder2e']!;
    const rules = mapSenseRules(app, assets({
      senses,
      systemPresetId: 'builtin:dnd5e',
      gridDefaults: { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' },
    }), { mapPath: MAP, grid: null });
    expect(rules.definitions).toBe(senses);
    expect(rules.unit).toMatchObject({ unitType: 'meters', unitDistance: 1.5 });
  });

  it('takes the senses of the collection\'s built-in preset where it has none of its own', () => {
    expect(mapSenseRules(app, assets({ systemPresetId: 'builtin:dnd5e' }), { mapPath: MAP, grid: null }).definitions).toBe(BUILT_IN_SENSES['builtin:dnd5e']);
    expect(mapSenseRules(app, assets({ systemPresetId: 'builtin:cairn' }), { mapPath: MAP, grid: null }).definitions).toBe(GENERIC_SENSES);
    expect(mapSenseRules(app, assets({ systemPresetId: 'a-user-preset' }), { mapPath: MAP, grid: null }).definitions).toBe(GENERIC_SENSES);
    expect(mapSenseRules(app, assets({}), { mapPath: MAP, grid: null }).definitions).toBe(GENERIC_SENSES);
  });

  it('gives a map outside a collection the generic senses and its own grid units', () => {
    const grid = { unitType: 'yards', unitDistance: 2, measurementType: 'units' } as GridState;
    const rules = mapSenseRules(app, assets({ senses: [] }), { mapPath: 'maps/loose.atlasmap', grid });
    expect(rules.definitions).toBe(GENERIC_SENSES);
    expect(rules.unit).toMatchObject({ unitType: 'yards', unitDistance: 2 });
    expect(mapSenseRules(app, assets({}), { mapPath: null, grid: null }).unit).toMatchObject({ unitType: 'feet', unitDistance: 5 });
  });

  // #84: a scene's own distance per cell changes the map's scale, never what a rules square spans.
  it("reads statblock senses with the collection's rules square on a scene with its own distance per cell", () => {
    const drawSteel = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Draw Steel')!;
    const grid = { size: 70, unitDistanceOverride: 5 } as GridState;
    const { gridDefaults } = drawSteel.rules;
    const rules = mapSenseRules(app, assets({ systemPresetId: drawSteel.id, gridDefaults }), { mapPath: MAP, grid });
    const darkvision = (text: string): number | undefined => parseSenses(text, rules.definitions, rules.unit).senses[0]?.range;
    expect(darkvision('darkvision 60 ft.')).toBe(12);
    expect(darkvision('darkvision 10 squares')).toBe(10);
    // 12 squares on a map whose cells span 5 squares each: 2.4 cells, not 12
    expect(gameUnitsToWorld(12, unitScaleOf(resolveMeasurementSettings(gridDefaults, grid), grid)) / 70).toBeCloseTo(2.4);
  });
});

/** User presets made from the Pathfinder rules, as `SystemPresetFiles.forApp` gives them. */
function userPresets(count: number): { settings: ReturnType<typeof memoryPresets>; ids: string[] } {
  const settings = memoryPresets();
  const service = new SystemPresetService(settings);
  const rules = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:pathfinder2e')!.rules;
  const ids = Array.from({ length: count }, (_, i) => service.create(`Homebrew ${i}`, rules).id);
  vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(settings as unknown as SystemPresetFiles);
  return { settings, ids };
}

afterEach(() => vi.restoreAllMocks());

describe('mapSenseRules for a collection on a user preset', () => {
  it('takes the preset\'s senses', () => {
    const { ids } = userPresets(2);
    const { definitions } = mapSenseRules(app, assets({ systemPresetId: ids[1]! }), { mapPath: MAP, grid: null });
    expect(definitions.map((sense) => sense.name)).toEqual(BUILT_IN_SENSES['builtin:pathfinder2e']!.map((sense) => sense.name));
  });

  it('validates the stored presets once, and hands out the same senses while they are unchanged', () => {
    const { ids } = userPresets(6);
    const parse = vi.spyOn(validation, 'parseUserPresets');
    const collection = assets({ systemPresetId: ids[3]! });
    const first = mapSenseRules(app, collection, { mapPath: MAP, grid: null }).definitions;
    for (let token = 0; token < 200; token++) {
      expect(mapSenseRules(app, collection, { mapPath: MAP, grid: null }).definitions).toBe(first);
    }
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('reads the presets again once they are stored anew', () => {
    const { settings, ids } = userPresets(1);
    const collection = assets({ systemPresetId: ids[0]! });
    const before = mapSenseRules(app, collection, { mapPath: MAP, grid: null }).definitions;
    new SystemPresetService(settings).update(ids[0]!, BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:dnd5e')!.rules);
    const after = mapSenseRules(app, collection, { mapPath: MAP, grid: null }).definitions;
    expect(after).not.toBe(before);
    expect(after.map((sense) => sense.name)).toEqual(BUILT_IN_SENSES['builtin:dnd5e']!.map((sense) => sense.name));
  });
});

describe('mapSenseRulesSource', () => {
  type Listener = (collectionId: string) => unknown;

  function workspaceApp(): { app: App; changed: (collectionId: string) => void; listening: () => number } {
    const listeners = new Set<Listener>();
    const workspace = {
      on: (_name: string, callback: Listener) => { listeners.add(callback); return callback; },
      offref: (ref: Listener) => { listeners.delete(ref); },
    };
    return {
      app: { workspace } as unknown as App,
      changed: (collectionId) => { for (const listener of [...listeners]) listener(collectionId); },
      listening: () => listeners.size,
    };
  }

  it('gives the rules of the map the view shows now', () => {
    const { app: obsidian } = workspaceApp();
    let mapPath: string | null = MAP;
    const source = mapSenseRulesSource(obsidian, assets({ systemPresetId: 'builtin:dnd5e' }), () => ({ mapPath, grid: null }));
    expect(source.get().definitions).toBe(BUILT_IN_SENSES['builtin:dnd5e']);
    mapPath = 'maps/loose.atlasmap';
    expect(source.get().definitions).toBe(GENERIC_SENSES);
  });

  it('tells its listener when the settings of the map\'s collection change, and of no other', () => {
    const { app: obsidian, changed } = workspaceApp();
    const source = mapSenseRulesSource(obsidian, assets({}), () => ({ mapPath: MAP, grid: null }));
    const listener = vi.fn();
    source.subscribe(listener);
    changed('elsewhere');
    expect(listener).not.toHaveBeenCalled();
    changed('dungeon');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tells its listener when a user preset changes', () => {
    const { app: obsidian } = workspaceApp();
    const { settings, ids } = userPresets(1);
    const source = mapSenseRulesSource(obsidian, assets({ systemPresetId: ids[0]! }), () => ({ mapPath: MAP, grid: null }));
    const listener = vi.fn();
    source.subscribe(listener);
    new SystemPresetService(settings).rename(ids[0]!, 'Renamed');
    expect(listener).toHaveBeenCalled();
  });

  it('stops listening when unsubscribed', () => {
    const { app: obsidian, changed, listening } = workspaceApp();
    const { settings, ids } = userPresets(1);
    const source = mapSenseRulesSource(obsidian, assets({ systemPresetId: ids[0]! }), () => ({ mapPath: MAP, grid: null }));
    const listener = vi.fn();
    const stop = source.subscribe(listener);
    expect(listening()).toBe(1);
    stop();
    expect(listening()).toBe(0);
    changed('dungeon');
    new SystemPresetService(settings).rename(ids[0]!, 'Renamed');
    expect(listener).not.toHaveBeenCalled();
  });
});
