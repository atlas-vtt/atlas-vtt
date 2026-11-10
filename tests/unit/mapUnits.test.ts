import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapRules } from '../../src/app/gameSystems/mapRules';
import { unitChange, unitHolder } from '../../src/app/gameSystems/mapUnitChange';
import { DEFAULT_GRID_DEFAULTS, rulesOfPreset, sameSystemRules } from '../../src/app/gameSystems/systemRules';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { rulesLookup } from '../../src/app/services/mapRules';
import { setMapUnitType } from '../../src/app/services/mapUnits';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { GridState } from '../../src/app/types/gridTypes';
import { DND5E, DUNGEON_MAP as MAP, playedCampaignWorld, releasePlayedCampaignWorlds } from '../mocks/playedCampaignWorld';

const UNKNOWN = 'atlas-vtt/collections/new/scenes/hall.atlasmap';
const LOOSE = 'maps/loose.atlasmap';
const GRID: GridState = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1, measurementType: 'units', unitType: 'feet', unitDistance: 5 };

/** A scene's store as the unit is read from and written to, with the grid it holds. */
interface Scene {
  getState(): Pick<ViewAtlasState, 'mapPath' | 'grid' | 'setGrid'>;
  grid(): GridState | null;
}

function scene(mapPath: string | null): Scene {
  let grid: GridState | null = { ...GRID };
  const state = { mapPath, get grid() { return grid; }, setGrid: (next: GridState) => { grid = next; } };
  return { getState: () => state, grid: () => grid };
}

/** The 5e collection `dungeon`, measuring in feet, beside the 5e campaign `saga`. */
const world = (): ReturnType<typeof playedCampaignWorld> => playedCampaignWorld({ ...rulesOfPreset(DND5E), systemPresetId: DND5E.id });

afterEach(() => {
  releasePlayedCampaignWorlds();
  vi.restoreAllMocks();
});

describe('who keeps a map\'s unit', () => {
  const settings: CollectionSettings = { conditions: [], gridDefaults: { ...DEFAULT_GRID_DEFAULTS, unitDistance: 1.5 } };
  const rules = {
    campaign: { source: { kind: 'campaign', id: 'saga' }, settings },
    collection: { source: { kind: 'collection', id: 'dungeon' }, settings },
    loose: { source: { kind: 'none', outsideCollections: true }, settings: null },
    unknown: { source: { kind: 'none', outsideCollections: false }, settings: null },
  } satisfies Record<string, MapRules>;

  it('is the rules the map plays by, its own grid outside every collection, and nobody in a collection not read yet', () => {
    expect(unitHolder(rules.campaign)).toBe('campaign');
    expect(unitHolder(rules.collection)).toBe('collection');
    expect(unitHolder(rules.loose)).toBe('grid');
    expect(unitHolder(rules.unknown)).toBeNull();
  });

  it('changes only the unit of the rules\' measurement', () => {
    expect(unitChange(rules.campaign, GRID, 'meters')).toEqual({
      kind: 'rules', source: rules.campaign.source, gridDefaults: { ...DEFAULT_GRID_DEFAULTS, unitDistance: 1.5, unitType: 'meters' },
    });
    // A collection that never set a measurement keeps the one its map reads by, its grid's.
    expect(unitChange({ ...rules.collection, settings: { conditions: [] } }, { ...GRID, unitDistance: 10 }, 'meters')).toEqual({
      kind: 'rules', source: rules.collection.source,
      gridDefaults: { unitType: 'meters', unitDistance: 10, measurementMode: 'metric', abstractRangeBands: [], diagonalRule: 'equidistant' },
    });
  });

  it('changes the grid outside every collection, which holds no custom unit, and nothing where no one keeps it', () => {
    expect(unitChange(rules.loose, GRID, 'meters')).toEqual({ kind: 'grid', grid: { ...GRID, unitType: 'meters' } });
    expect(unitChange(rules.loose, GRID, 'custom')).toBeNull();
    expect(unitChange(rules.loose, null, 'meters')).toBeNull();
    expect(unitChange(rules.unknown, GRID, 'meters')).toBeNull();
  });
});

describe('measuring a map in another unit', () => {
  it('sets the played campaign\'s system, not the collection, and the map measures in it at once', async () => {
    const { app, play, collectionWrites, storedSystem } = world();
    const map = scene(MAP);
    play.play('saga');

    await setMapUnitType(app, map, 'meters');
    expect(collectionWrites).toEqual([]);
    expect(storedSystem()?.gridDefaults).toEqual({ ...DND5E.rules.gridDefaults, unitType: 'meters' });
    expect(mapMeasurementSettings(rulesLookup(app), map.getState()).unitType).toBe('meters');
    expect(map.grid()).toEqual(GRID);
  });

  it('leaves a campaign system that is back at its preset\'s measurement unedited', async () => {
    const { app, play, storedSystem } = world();
    const map = scene(MAP);
    play.play('saga');
    const preset = rulesOfPreset(DND5E);
    const rulesOf = (): CollectionSettings => ({ ...storedSystem()!, defaultWidgets: preset.defaultWidgets });

    await setMapUnitType(app, map, 'meters');
    expect(sameSystemRules(DND5E.rules, rulesOf())).toBe(false);
    await setMapUnitType(app, map, 'feet');
    expect(sameSystemRules(DND5E.rules, rulesOf())).toBe(true);
  });

  it('sets the map\'s collection while no campaign with a system is played', async () => {
    const { app, collectionWrites, storedSystem } = world();
    const map = scene(MAP);

    await setMapUnitType(app, map, 'meters');
    expect(collectionWrites).toEqual([{ gridDefaults: { ...DND5E.rules.gridDefaults, unitType: 'meters' } }]);
    expect(storedSystem()?.gridDefaults.unitType).toBe('feet');
    expect(mapMeasurementSettings(rulesLookup(app), map.getState()).unitType).toBe('meters');
  });

  it('sets the grid of a map outside every collection, and nothing of a map in a collection not read yet', async () => {
    const { app, collectionWrites } = world();
    const loose = scene(LOOSE);
    await setMapUnitType(app, loose, 'yards');
    expect(loose.grid()).toEqual({ ...GRID, unitType: 'yards' });

    const unknown = scene(UNKNOWN);
    await setMapUnitType(app, unknown, 'yards');
    expect(unknown.grid()).toEqual(GRID);
    expect(collectionWrites).toEqual([]);
  });
});
