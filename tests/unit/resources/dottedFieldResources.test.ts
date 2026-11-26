import { describe, expect, it, vi } from 'vitest';
import type { PlayedSystem, RulesLookup } from '../../../src/app/gameSystems/mapRules';
import { mapResources } from '../../../src/app/resources/collectionResources';
import { draftResourceKey, HP_RESOURCE, savedResources } from '../../../src/app/resources/resourceDefinitions';
import { tokenFromFile, tokenToFile } from '../../../src/app/resources/resourceFileFormat';
import { fillMissingResources } from '../../../src/app/resources/statblockResourceSync';
import { startingResources } from '../../../src/app/resources/statblockResourceValues';
import type { ResourceDefinition, ResourceHolder } from '../../../src/app/resources/resourceTypes';
import { visibleResources } from '../../../src/app/resources/visibleResources';
import type { CollectionSettings } from '../../../src/app/types/collectionSettingsTypes';
import { dnd5eSystem } from '../../mocks/playedCampaignWorld';

/**
 * A custom 5e collection that tracks spell slots per level from a statblock list (`spell_slots.0`,
 * `spell_slots.1`, …) as wheels, as reported in #623, followed from the Resources tab to the token's file.
 */

const MAP = 'atlas-vtt/collections/heroes/scenes/keep.atlasmap';
const SHEET = { name: 'Acer', hp: 66, spell_slots: [4, 3, 2, 0, 0] };

/** The resources as the Resources tab saves them: added in the dialog, keyed from their names. */
function spellSlotResources(): ResourceDefinition[] {
  const wheel = (name: string, field: string, slot: number): ResourceDefinition => ({
    key: draftResourceKey(), name, field, direction: 'drains', color: '#a855f7', visibleToPlayers: false, slot,
  });
  return savedResources([
    { ...HP_RESOURCE, slot: 0 },
    wheel('Lvl 1', 'spell_slots.0', 2),
    wheel('Lvl 2', 'spell_slots.1', 4),
    wheel('Lvl 3', 'spell_slots.2', 5),
    wheel('spell_slots.3', 'spell_slots.3', 3),
  ]);
}

function lookup(settings: CollectionSettings, played: PlayedSystem | null = null): RulesLookup {
  return {
    getCollectionForMap: (path) => (path === MAP ? 'heroes' : null),
    getCollectionSettings: () => settings,
    playedSystem: () => played,
  };
}

describe('resources that read a dotted statblock field (#623)', () => {
  const resources = spellSlotResources();
  const collection: CollectionSettings = { conditions: [], systemPresetId: 'builtin:dnd5e', resources };

  it('keys each by its name, never by its field, so no key holds a dot', () => {
    expect(resources.map(({ key }) => key)).toEqual(['hp', 'lvl-1', 'lvl-2', 'lvl-3', 'spell-slots-3']);
    expect(resources.map(({ field }) => field)).toEqual(['hp', 'spell_slots.0', 'spell_slots.1', 'spell_slots.2', 'spell_slots.3']);
  });

  it('are the resources of the collection\'s maps while no campaign with a system of its own is played', () => {
    expect(mapResources(lookup(collection), MAP)).toEqual(resources);
  });

  it('give way to a played campaign\'s system: its resources are the map\'s, whatever the collection defines', () => {
    const campaign = { campaignId: 'saga', settings: dnd5eSystem() };
    expect(mapResources(lookup(collection, campaign), MAP).map(({ key }) => key)).toEqual(['hp']);
    const withSlots = { campaignId: 'saga', settings: { ...dnd5eSystem(), resources } };
    expect(mapResources(lookup(collection, withSlots), MAP)).toEqual(resources);
  });

  it('start from the list entry the field names; an empty level starts nothing', () => {
    expect(startingResources(SHEET, resources)).toEqual({
      hp: { current: 66, max: 66 },
      'lvl-1': { current: 4, max: 4 },
      'lvl-2': { current: 3, max: 3 },
      'lvl-3': { current: 2, max: 2 },
    });
  });

  it('are started on a linked token placed before they were defined, when its map loads', async () => {
    const tokens: Record<string, ResourceHolder & { statblockPath: string }> = {
      acer: { statblockPath: 'Acer.md', resources: { hp: { current: 40, max: 66 } } },
    };
    const apply = vi.fn();
    await fillMissingResources({ tokens: () => tokens, apply }, resources, async () => ({ fields: SHEET }));
    expect(apply).toHaveBeenCalledWith([{ id: 'acer', changes: { resources: {
      hp: { current: 40, max: 66 },
      'lvl-1': { current: 4, max: 4 },
      'lvl-2': { current: 3, max: 3 },
      'lvl-3': { current: 2, max: 2 },
    } } }]);
  });

  it('show as wheels in their sockets to the GM, and to players only where they are shown to players', () => {
    const token: ResourceHolder = { resources: startingResources(SHEET, resources) };
    expect(visibleResources(token, resources, 'dm').map(({ definition, slot }) => [definition.key, slot])).toEqual([
      ['hp', 0], ['lvl-1', 2], ['lvl-2', 4], ['lvl-3', 5],
    ]);
    expect(visibleResources(token, resources, 'player')).toEqual([]);
  });

  it('keep their values through the scene file, dotted keys of statblock quantities too', () => {
    const token = {
      id: 'acer',
      resources: { ...startingResources(SHEET, resources), 'spell_slots.4': { current: 1, max: 2 } },
      overriddenMax: ['lvl-2', 'spell_slots.4'],
    };
    const file = JSON.parse(JSON.stringify(tokenToFile(token))) as object;
    expect(file).toMatchObject({ statblockResources: { 'lvl-1': { current: 4, max: 4 }, 'spell_slots.4': { current: 1, max: 2 } } });
    expect(tokenFromFile(file)).toEqual(token);
  });
});
