import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';
import { newSense } from '../senseEditing';
import { senseWithRole } from '../senseRules';
import { GENERIC_SENSES } from '../senses/generic';
import { mapVisionDefaults } from '../visionDefaults';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const darkvision = senseWithRole(dnd5e.rules.senses!, 'darkvision');
const genericDarkvision = senseWithRole(GENERIC_SENSES, 'darkvision');

function assets(settings: Partial<CollectionSettings>): Parameters<typeof mapVisionDefaults>[0] {
  return {
    getCollectionForMap: (path: string) => (path === 'maps/cave.atlasmap' ? 'dungeon' : null),
    getCollectionSettings: () => ({ conditions: [], ...settings }),
    playedSystem: () => null,
  };
}

describe('mapVisionDefaults', () => {
  it('stamps the default senses the collection\'s game system knows', () => {
    const settings = { systemPresetId: dnd5e.id, defaultTokenVision: { range: 60, senses: [{ id: darkvision.id, range: 60 }, { id: 'other-system-echo', range: 30 }] } };
    expect(mapVisionDefaults(assets(settings), 'maps/cave.atlasmap', BUILT_IN_SYSTEM_PRESETS)).toEqual({ range: 60, senses: [{ id: darkvision.id, range: 60 }] });
  });

  it('knows the senses the collection defines itself', () => {
    const witchSight = { ...newSense('home-1'), name: 'Witch sight' };
    const settings = { systemPresetId: dnd5e.id, senses: [witchSight], defaultTokenVision: { senses: [{ id: 'home-1' }, { id: darkvision.id }] } };
    expect(mapVisionDefaults(assets(settings), 'maps/cave.atlasmap', BUILT_IN_SYSTEM_PRESETS)).toEqual({ senses: [{ id: 'home-1' }] });
  });

  it('knows the generic senses in a collection without a game system', () => {
    const settings = { defaultTokenVision: { angle: 90, senses: [{ id: genericDarkvision.id }] } };
    expect(mapVisionDefaults(assets(settings), 'maps/cave.atlasmap', BUILT_IN_SYSTEM_PRESETS)).toEqual({ angle: 90, senses: [{ id: genericDarkvision.id }] });
  });

  it('keeps the old distances of a default saved before senses, for the token to read as senses', () => {
    const settings = { systemPresetId: dnd5e.id, defaultTokenVision: { darkvision: 30, tremorsense: 10 } };
    expect(mapVisionDefaults(assets(settings), 'maps/cave.atlasmap', BUILT_IN_SYSTEM_PRESETS)).toEqual({ darkvision: 30, tremorsense: 10 });
  });

  it('is nothing for a map outside every collection, or when only unknown senses are left', () => {
    const settings = { systemPresetId: dnd5e.id, defaultTokenVision: { senses: [{ id: 'other-system-echo' }] } };
    expect(mapVisionDefaults(assets(settings), 'maps/cave.atlasmap', BUILT_IN_SYSTEM_PRESETS)).toBeUndefined();
    expect(mapVisionDefaults(assets({ defaultTokenVision: { range: 60 } }), 'maps/other.atlasmap', BUILT_IN_SYSTEM_PRESETS)).toBeUndefined();
  });
});
