import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { collectionDifficultTerrain } from '../../../src/app/gameSystems/difficultTerrain';
import { parseSystemRules } from '../../../src/app/gameSystems/presetValidation';
import { sameSystemRules } from '../../../src/app/gameSystems/systemRules';
import { mapMeasurementSettings } from '../../../src/app/services/mapMeasurementSettings';
import { comparableSettings } from '../../../src/app/services/collectionBundle/bundleSettings';
import type { RulesLookup } from '../../../src/app/gameSystems/mapRules';
import type { CollectionGridDefaults, CollectionSettings } from '../../../src/app/types/collectionSettingsTypes';

const preset = (key: string) => BUILT_IN_SYSTEM_PRESETS.find((candidate) => candidate.id === `builtin:${key}`)!;
const grid: CollectionGridDefaults = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', diagonalRule: 'equidistant' };

describe('the difficult terrain rule', () => {
  it('is set by the built-in systems that move on squares with difficult terrain, and by no other', () => {
    const doubling = BUILT_IN_SYSTEM_PRESETS.filter((system) => system.rules.gridDefaults.difficultTerrain === 'double').map((system) => system.id).sort();
    expect(doubling).toEqual(['builtin:dnd5e', 'builtin:drawsteel', 'builtin:pathfinder2e'].sort());
  });

  it('reads a collection\'s own rule, else its built-in system\'s, else none', () => {
    expect(collectionDifficultTerrain({ ...grid, difficultTerrain: 'none' }, preset('dnd5e').id)).toBe('none');
    expect(collectionDifficultTerrain(grid, preset('dnd5e').id)).toBe('double');
    expect(collectionDifficultTerrain(grid, preset('cairn').id)).toBe('none');
    expect(collectionDifficultTerrain(undefined, undefined)).toBe('none');
    expect(collectionDifficultTerrain({ ...grid, difficultTerrain: 'double' }, undefined)).toBe('double');
  });

  it('is what the map\'s measurement goes by', () => {
    const settings = { gridDefaults: grid, conditions: [], systemPresetId: preset('dnd5e').id } as CollectionSettings;
    const lookup: RulesLookup = { getCollectionForMap: () => 'c', getCollectionSettings: () => settings, playedSystem: () => null };
    expect(mapMeasurementSettings(lookup, { mapPath: 'atlas-vtt/collections/c/scenes/a.atlasmap', grid: null }).difficultTerrain).toBe('double');
    const outside: RulesLookup = { ...lookup, getCollectionForMap: () => null };
    expect(mapMeasurementSettings(outside, { mapPath: 'a.atlasmap', grid: null }).difficultTerrain).toBe('none');
  });

  it('tells rules apart from their system\'s, unset reading as the system\'s', () => {
    const system = preset('dnd5e').rules;
    expect(sameSystemRules(system, { ...system, gridDefaults: { ...system.gridDefaults, difficultTerrain: undefined } })).toBe(true);
    expect(sameSystemRules(system, { ...system, gridDefaults: { ...system.gridDefaults, difficultTerrain: 'none' } })).toBe(false);
    expect(sameSystemRules(system, structuredClone(system))).toBe(true);
  });

  it('is kept by a saved preset and by bundle comparisons, and dropped where it is no rule', () => {
    const rules = structuredClone(preset('dnd5e').rules);
    expect(parseSystemRules(rules)?.gridDefaults.difficultTerrain).toBe('double');
    expect(parseSystemRules({ ...rules, gridDefaults: { ...rules.gridDefaults, difficultTerrain: 'triple' } })?.gridDefaults.difficultTerrain).toBeUndefined();
    const settings = { gridDefaults: { ...grid, difficultTerrain: 'double' }, conditions: [] } as CollectionSettings;
    expect(comparableSettings(settings)).not.toEqual(comparableSettings({ ...settings, gridDefaults: grid }));
  });
});
