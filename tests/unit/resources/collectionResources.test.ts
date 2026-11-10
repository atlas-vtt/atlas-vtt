import { describe, expect, it } from 'vitest';
import { collectionResources, legacyCollectionResources, mapResources } from '../../../src/app/resources/collectionResources';
import { parseResourceDefinitions } from '../../../src/app/resources/resourceDefinitions';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';

describe('legacyCollectionResources', () => {
  it('takes the recorded preset first', () => {
    const keys = legacyCollectionResources({ systemPresetId: 'builtin:cairn' }, BUILT_IN_SYSTEM_PRESETS).map((d) => d.key);
    expect(keys).toEqual(['hp', 'str']);
  });

  it('drops broken definitions when a collection index is loaded', () => {
    expect(parseResourceDefinitions([{ key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', visibleToPlayers: true }, { key: 'hp', name: 'Dup' }, null]).map((d) => d.key)).toEqual(['hp']);
  });

  it('adds the secondary bar the old default widgets switched on', () => {
    expect(legacyCollectionResources({ defaultWidgets: { hpBar: true, stressBar: true } }, []).map((d) => d.key)).toEqual(['hp', 'stress']);
    expect(legacyCollectionResources({ defaultWidgets: { initiativeTracker: true } }, []).map((d) => d.key)).toEqual(['hp']);
    expect(legacyCollectionResources({}, []).map((d) => d.key)).toEqual(['hp']);
  });

  it('keeps hit points where the old HP bar was switched off: Edit Token and the DM screen still showed them', () => {
    expect(legacyCollectionResources({ defaultWidgets: { hpBar: false, stressBar: true } }, []).map((d) => d.key)).toEqual(['hp', 'stress']);
    expect(legacyCollectionResources({ systemPresetId: 'builtin:dnd5e', defaultWidgets: { hpBar: false } }, BUILT_IN_SYSTEM_PRESETS).map((d) => d.key)).toEqual(['hp']);
  });

  it('keeps the bars the collection itself switched on or off, whatever its preset lists', () => {
    const keys = (systemPresetId: string, defaultWidgets: Record<string, boolean>): string[] =>
      legacyCollectionResources({ systemPresetId, defaultWidgets }, BUILT_IN_SYSTEM_PRESETS).map((d) => d.key);
    expect(keys('builtin:coc7e', { hpBar: true, stressBar: true })).toEqual(['hp', 'stress']);
    expect(keys('builtin:daggerheart', { hpBar: true, stressBar: false })).toEqual(['hp']);
    expect(keys('builtin:cairn', { hpBar: true })).toEqual(['hp', 'str']);
  });

  it('adds the secondary bar a scene shows, though the collection never switched it on', () => {
    const names = (settings: Parameters<typeof legacyCollectionResources>[0]): string[] =>
      legacyCollectionResources(settings, BUILT_IN_SYSTEM_PRESETS, true).map((d) => d.name);
    expect(names({ systemPresetId: 'builtin:dnd5e', defaultWidgets: { hpBar: true } })).toEqual(['HP', 'Secondary resource']);
    expect(names({ defaultWidgets: { hpBar: true, stressBar: false } })).toEqual(['HP', 'Secondary resource']);
    // The preset names it
    expect(names({ systemPresetId: 'builtin:daggerheart', defaultWidgets: { hpBar: true, stressBar: false } })).toEqual(['HP', 'Stress']);
  });

  it('calls the secondary bar what the old settings called it, and keeps its key', () => {
    const [, secondary] = legacyCollectionResources({ defaultWidgets: { stressBar: true } }, []);
    expect(secondary).toMatchObject({ key: 'stress', name: 'Secondary resource', field: 'stress', direction: 'fills' });
  });

  it('reads a collection that never stored resources the same way', () => {
    expect(collectionResources({ conditions: [], systemPresetId: 'builtin:daggerheart' }).map((d) => d.key)).toEqual(['hp', 'stress']);
    expect(collectionResources({ conditions: [] }).map((d) => d.key)).toEqual(['hp']);
    expect(collectionResources({ conditions: [], resources: [] })).toEqual([]);
  });

  it('never reads more resources than a token shows, wherever the settings came from', () => {
    const seven = ['hp', 'str', 'ammo', 'luck', 'mana', 'grit', 'fuel'].map((key) => ({ key, name: key, field: key, direction: 'drains' as const, color: '#22c55e', visibleToPlayers: false }));
    expect(collectionResources({ conditions: [], resources: seven }).map((d) => d.key)).toEqual(['hp', 'str', 'ammo', 'luck', 'mana', 'grit']);
  });

  it('gives a map outside every collection the two bars every map had', () => {
    const assets = { getCollectionForMap: () => null, getCollectionSettings: () => ({ conditions: [] }), playedSystem: () => null };
    expect(mapResources(assets, 'maps/old cave.atlasmap').map((d) => d.name)).toEqual(['HP', 'Secondary resource']);
    expect(mapResources(assets, null).map((d) => d.name)).toEqual(['HP', 'Secondary resource']);
  });

  it('reads a collection\'s map as HP alone while the index does not know the collection yet', () => {
    const assets = { getCollectionForMap: () => null, getCollectionSettings: () => ({ conditions: [] }), playedSystem: () => null };
    expect(mapResources(assets, 'atlas-vtt/collections/Own/scenes/Cave.atlasmap').map((d) => d.name)).toEqual(['HP']);
  });
});
