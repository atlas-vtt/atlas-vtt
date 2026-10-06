import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { AssetService } from '../../src/app/services/AssetService';
import { mapLightPresets } from '../../src/app/services/mapCollectionRules';
import type { GridState } from '../../src/app/types/gridTypes';
import { gameUnitsToWorld, unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const at = (mapPath: string | null | undefined): { mapPath: string | null; grid: null } => ({ mapPath: mapPath ?? null, grid: null });

function appWith(settings: Partial<CollectionSettings>): ReturnType<typeof createInMemoryApp>['app'] {
  vi.spyOn(AssetService.prototype, 'getCollectionForMap').mockImplementation((path) => (path === 'maps/cave.atlasmap' ? 'dungeon' : null));
  vi.spyOn(AssetService.prototype, 'getCollectionSettings').mockReturnValue({ conditions: [], ...settings });
  return createInMemoryApp().app;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the rules of the collection that holds a map', () => {
  it('are its game system\'s light presets', () => {
    const app = appWith({ systemPresetId: dnd5e.id });
    expect(mapLightPresets(app, at('maps/cave.atlasmap')).map((light) => [light.name, light.bright, light.dim]).slice(0, 2)).toEqual([['Candle', 5, 10], ['Torch', 20, 40]]);
    expect(mapLightPresets(app, at('maps/cave.atlasmap')).map((light) => light.id)).toEqual(dnd5e.rules.lightPresets!.map((light) => light.id));
  });

  it('are its own once it has any, as far as they can be used', () => {
    const glowMoss = { id: 'home-1', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' } as const;
    const app = appWith({ systemPresetId: dnd5e.id, lightPresets: [glowMoss, { id: 'broken' }] as never });
    expect(mapLightPresets(app, at('maps/cave.atlasmap'))).toEqual([glowMoss]);
  });

  it('are the generic ones for a map outside every collection, or without a map', () => {
    const app = appWith({ systemPresetId: dnd5e.id });
    for (const path of ['maps/other.atlasmap', null, undefined]) {
      expect(mapLightPresets(app, at(path)).map((light) => [light.id, light.bright, light.dim])).toEqual([['candle', 5, 10], ['torch', 20, 40], ['lantern', 30, 60], ['magical', 20, 40], ['darkness', 0, 15]]);
    }
  });

  it('gives the lights in what the collection measures in', () => {
    const app = appWith({ systemPresetId: dnd5e.id, gridDefaults: { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' } });
    const torch = mapLightPresets(app, at('maps/cave.atlasmap')).find((light) => light.name === 'Torch')!;
    expect([torch.bright, torch.dim]).toEqual([6, 12]);
    expect(torch).not.toHaveProperty('unit');
  });

  it('gives the generic lights in the grid\'s own units to a map outside every collection', () => {
    const app = appWith({});
    const grid = { unitType: 'meters', unitDistance: 2, size: 70 } as GridState;
    const torch = mapLightPresets(app, { mapPath: 'maps/other.atlasmap', grid }).find((light) => light.id === 'torch')!;
    expect([torch.bright, torch.dim]).toEqual([8, 16]);
  });

  // #84: lights written in squares count the collection's rules square, not the scene's cells.
  it("gives a scene with its own distance per cell the lights its collection's rules square makes", () => {
    const gridDefaults = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' } as const;
    const app = appWith({ gridDefaults });
    const grid = { size: 70, unitDistanceOverride: 50 } as GridState;
    const torch = mapLightPresets(app, { mapPath: 'maps/cave.atlasmap', grid }).find((light) => light.id === 'torch')!;
    expect([torch.bright, torch.dim]).toEqual([20, 40]);
    // A torch placed before is 40 ft as well, and both reach 0.8 of a 50 ft cell
    const cells = (feet: number): number => gameUnitsToWorld(feet, unitScaleOf(resolveMeasurementSettings(gridDefaults, grid), grid)) / 70;
    expect(cells(torch.dim)).toBeCloseTo(0.8);
  });

  it('stops every light at the farthest one may reach on the map', () => {
    const app = appWith({ systemPresetId: dnd5e.id, lightPresets: [{ id: 'sun', name: 'Sun', bright: 1e9, dim: 1e12, color: '#ffffff', animation: 'none', kind: 'magical' }] });
    // 8,192 px on the 70 px, 5 ft grid
    expect(mapLightPresets(app, at('maps/cave.atlasmap'))[0]).toMatchObject({ bright: 585, dim: 585 });
  });
});
