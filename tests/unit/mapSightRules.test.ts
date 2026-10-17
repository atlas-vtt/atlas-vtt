import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses';
import { AssetService } from '../../src/app/services/AssetService';
import { mapSenseRules } from '../../src/app/services/mapSenseRules';
import { mapSightRules } from '../../src/app/services/mapSightRules';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { DEAD_CONDITION } from '../../src/app/gameSystems/deadCondition';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const MAP = 'atlas-vtt/collections/dungeon/scenes/a.atlasmap';

function withCollection<T>(settings: CollectionSettings | null, read: (assets: AssetService) => T): T {
  const assets = {
    getCollectionForMap: () => (settings ? 'dungeon' : null),
    getCollectionSettings: () => settings ?? { conditions: [] },
  } as unknown as AssetService;
  const spy = vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets);
  try {
    return read(assets);
  } finally {
    spy.mockRestore();
  }
}

const rulesFor = (settings: CollectionSettings | null, mapPath: string | null = MAP): ReturnType<typeof mapSightRules> =>
  withCollection(settings, () => mapSightRules({} as App, { mapPath, grid: null }));

describe('mapSightRules', () => {
  it('are the generic senses and Dead for a map without a collection', () => {
    expect(rulesFor(null)).toEqual({ definitions: GENERIC_SENSES, conditions: [DEAD_CONDITION] });
    expect(rulesFor({ conditions: [] }, null).definitions).toBe(GENERIC_SENSES);
  });

  it('are the senses of the collection\'s game system and the collection\'s conditions', () => {
    const conditions = structuredClone(dnd5e.rules.conditions);
    const rules = rulesFor({ conditions, systemPresetId: dnd5e.id });
    expect(rules.definitions).toBe(dnd5e.rules.senses);
    expect(rules.conditions).toBe(conditions);
  });

  it('are the collection\'s own senses once it has any, and the generic ones without a system', () => {
    const own = [GENERIC_SENSES[0]!];
    expect(rulesFor({ conditions: [], senses: own, systemPresetId: dnd5e.id }).definitions).toBe(own);
    expect(rulesFor({ conditions: [] }).definitions).toBe(GENERIC_SENSES);
  });

  it('are the very senses statblock senses are read with, so their ids resolve', () => {
    const settings = { conditions: [], systemPresetId: dnd5e.id };
    withCollection(settings, (assets) => {
      const state = { mapPath: MAP, grid: null };
      expect(mapSightRules({} as App, state).definitions).toBe(mapSenseRules({} as App, assets, state).definitions);
    });
  });

  it('carry how each token perceives where that is given', () => {
    const visionOf = (): { senses: never[] } => ({ senses: [] });
    expect(withCollection(null, () => mapSightRules({} as App, { mapPath: null, grid: null }, visionOf)).visionOf).toBe(visionOf);
    expect(rulesFor(null)).not.toHaveProperty('visionOf');
  });
});
