import { describe, expect, it, vi } from 'vitest';
import { builtInPresetId } from '../../src/app/gameSystems/presets/presetHelpers';
import { DEFAULT_CONE_ANGLE } from '../../src/app/grid/measurementFormat';
import { mapConeAngle, mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';

const assets = {
  getCollectionForMap: vi.fn(() => 'c'),
  getCollectionSettings: vi.fn(() => ({ gridDefaults: { unitType: 'meters', unitDistance: 2, measurementMode: 'metric' } })),
};

describe('mapMeasurementSettings', () => {
  it("reads a map's collection, as before", () => {
    expect(mapMeasurementSettings(assets as never, { mapPath: 'a.atlasmap', grid: null })).toMatchObject({ unitType: 'meters', unitDistance: 2 });
  });

  // Every other view gets `mapConeAngle`, the GM `mapMeasurementSettings`: one function.
  function collection(settings: object) {
    return { getCollectionForMap: vi.fn(() => 'c'), getCollectionSettings: vi.fn(() => settings) };
  }
  const gmCone = (assets: object): number => mapMeasurementSettings(assets as never, { mapPath: 'a.atlasmap', grid: null }).coneAngle;

  it("gives every view the GM's cone, a D&D collection without grid defaults or a stored angle included", () => {
    const dnd = builtInPresetId('dnd5e');
    for (const settings of [
      { systemPresetId: dnd },
      { systemPresetId: dnd, gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' } },
    ]) {
      const assets = collection(settings);
      expect(mapConeAngle(assets as never, 'a.atlasmap')).toBe(53.13);
      expect(gmCone(assets)).toBe(53.13);
    }
  });

  it('opens a quarter circle for a stored angle no cone opens with, for the GM and every view alike', () => {
    for (const coneAngle of [0, 500, Number.NaN]) {
      const assets = collection({ gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', coneAngle } });
      expect(mapConeAngle(assets as never, 'a.atlasmap')).toBe(DEFAULT_CONE_ANGLE);
      expect(gmCone(assets)).toBe(DEFAULT_CONE_ANGLE);
    }
    const stored = collection({ gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', coneAngle: 60 } });
    expect([mapConeAngle(stored as never, 'a.atlasmap'), gmCone(stored)]).toEqual([60, 60]);
  });

  it('opens a quarter circle for a map outside a collection', () => {
    const outside = { getCollectionForMap: vi.fn(() => null), getCollectionSettings: vi.fn() };
    expect(mapConeAngle(outside as never, 'a.atlasmap')).toBe(DEFAULT_CONE_ANGLE);
    expect(gmCone(outside)).toBe(DEFAULT_CONE_ANGLE);
  });
});
