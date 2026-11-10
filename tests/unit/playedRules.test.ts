import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { readCampaignSystem, type CampaignSystem } from '../../src/app/campaigns/campaignSystem';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import { PlayedRules } from '../../src/app/campaigns/playedRules';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { rulesForMap } from '../../src/app/gameSystems/mapRules';
import { rulesOfPreset } from '../../src/app/gameSystems/systemRules';
import { mapResources } from '../../src/app/resources/collectionResources';
import { AssetService } from '../../src/app/services/AssetService';
import { mapDiceSet } from '../../src/app/services/diceSets/collectionDiceSets';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { mapInitiativeRules } from '../../src/app/services/mapInitiativeRules';
import { onMapRulesChange, rulesLookup } from '../../src/app/services/mapRules';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';

const MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';
const UNKNOWN = 'atlas-vtt/collections/new/scenes/hall.atlasmap';
const LOOSE = 'maps/loose.atlasmap';
const preset = (id: string): (typeof BUILT_IN_SYSTEM_PRESETS)[number] => BUILT_IN_SYSTEM_PRESETS.find((candidate) => candidate.id === id)!;

/** A campaign system set from a built-in preset, as the campaign's rules dialog saves it. */
function systemOf(presetId: string): CampaignSystem {
  const { defaultWidgets: _bars, ...rules } = rulesOfPreset(preset(presetId));
  return { ...rules, systemPresetId: presetId };
}

const campaign = (id: string, system?: CampaignSystem): StoredCampaign => ({ id, name: id, createdAt: 1, ...(system && { system }) });
const opened: App[] = [];

/** The plugin's campaigns and play, with a collection `dungeon` holding `MAP` that plays D&D 5e. */
function setup(entries: StoredCampaign[]): { app: App; play: CampaignPlay; campaigns: ReturnType<typeof memoryCampaigns>; rules: PlayedRules } {
  const { app } = createInMemoryApp();
  const dungeon: CollectionSettings = { ...rulesOfPreset(preset('builtin:dnd5e')), systemPresetId: 'builtin:dnd5e' };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollectionForMap: (path: string) => (path === MAP ? 'dungeon' : null),
    getCollectionSettings: () => dungeon,
    initialize: () => new Promise<void>(() => undefined),
  } as unknown as AssetService);
  const campaigns = memoryCampaigns(entries);
  const play = CampaignPlay.forApp(app);
  opened.push(app);
  return { app, play, campaigns, rules: PlayedRules.open(app, campaigns, play) };
}

afterEach(() => {
  for (const app of opened.splice(0)) PlayedRules.release(app);
  vi.restoreAllMocks();
});

describe('the rules of the campaign being played', () => {
  it('are none until a campaign with a system is played', () => {
    const { play, rules } = setup([campaign('bare'), campaign('saga', systemOf('builtin:cairn'))]);
    expect(rules.played()).toBeNull();
    play.play('bare');
    expect(rules.played()).toBeNull();
    play.play('saga');
    expect(rules.played()).toEqual({ campaignId: 'saga', settings: readCampaignSystem(systemOf('builtin:cairn')) });
    play.play('gone');
    expect(rules.played()).toBeNull();
  });

  it('are read once per stored campaign', () => {
    const { play, rules } = setup([campaign('saga', systemOf('builtin:cairn'))]);
    play.play('saga');
    expect(rules.played()!.settings).toBe(rules.played()!.settings);
  });

  it('are told when play starts, stops or the system changes, and not for a save that leaves it as it is', () => {
    const { play, campaigns, rules } = setup([campaign('saga', systemOf('builtin:cairn')), campaign('other'), campaign('bare')]);
    const heard = vi.fn();
    rules.onChange(heard);
    const service = new CampaignService(campaigns);

    play.play('bare');
    expect(heard).not.toHaveBeenCalled();
    play.play('saga');
    expect(heard).toHaveBeenCalledTimes(1);

    service.update('saga', { description: 'A long road' });
    service.recordScene('saga', 'scene-1', 5);
    service.update('other', { system: systemOf('builtin:dnd5e') });
    // Saved again exactly as it was: nothing the maps play by changed.
    service.update('saga', { system: systemOf('builtin:cairn') });
    expect(heard).toHaveBeenCalledTimes(1);

    service.update('saga', { system: { dice: { defaultRoll: '2d6', crit: 'none' } } });
    expect(heard).toHaveBeenCalledTimes(2);
    service.update('saga', { system: undefined });
    expect(heard).toHaveBeenCalledTimes(3);
    service.update('saga', { system: systemOf('builtin:cairn') });
    play.stop();
    expect(heard).toHaveBeenCalledTimes(5);
  });

  it('are told nothing once released', () => {
    const { app, play, rules } = setup([campaign('saga', systemOf('builtin:cairn'))]);
    const heard = vi.fn();
    rules.onChange(heard);
    PlayedRules.release(app);
    play.play('saga');
    expect(heard).not.toHaveBeenCalled();
    expect(PlayedRules.forApp(app)).toBeUndefined();
  });
});

describe('a map while a campaign with a system is played', () => {
  it('plays by the campaign\'s rules wherever it lies, and by its collection\'s again once play stops', () => {
    const { app, play } = setup([campaign('saga', systemOf('builtin:cairn'))]);
    const lookup = rulesLookup(app);
    play.play('saga');
    for (const path of [MAP, LOOSE, UNKNOWN]) expect(rulesForMap(lookup, path).source).toEqual({ kind: 'campaign', id: 'saga' });
    expect(mapResources(lookup, MAP).map((resource) => resource.key)).toEqual(preset('builtin:cairn').rules.resources!.map((resource) => resource.key));
    expect(mapDiceSet(app, LOOSE).id).toBe(preset('builtin:cairn').rules.diceSetId);
    expect(mapInitiativeRules(app, MAP)).toEqual(preset('builtin:cairn').rules.initiative);
    play.stop();
    expect(rulesForMap(lookup, MAP).source).toEqual({ kind: 'collection', id: 'dungeon' });
    expect(mapDiceSet(app, MAP).id).toBe(preset('builtin:dnd5e').rules.diceSetId);
  });

  it('measures as the campaign\'s system does', () => {
    const metres = { ...systemOf('builtin:dnd5e'), gridDefaults: { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric', coneAngle: 60 } } as const;
    const { app, play } = setup([campaign('saga', metres)]);
    play.play('saga');
    expect(mapMeasurementSettings(rulesLookup(app), { mapPath: MAP, grid: null })).toMatchObject({ unitType: 'meters', unitDistance: 1.5, coneAngle: 60 });
    play.stop();
    expect(mapMeasurementSettings(rulesLookup(app), { mapPath: MAP, grid: null })).toMatchObject({ unitType: 'feet', unitDistance: 5 });
  });

  it('tells the readers of every map when another system applies', () => {
    const { app, play } = setup([campaign('saga', systemOf('builtin:cairn'))]);
    const heard = vi.fn();
    onMapRulesChange(app, () => LOOSE, heard);
    play.play('saga');
    expect(heard).toHaveBeenCalledTimes(1);
    play.stop();
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
