import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { PlayedRules } from '../../src/app/campaigns/playedRules';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { tokenSensesResolver, type TokenSensesResolver } from '../../src/app/creatures/tokenSensesResolver';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { sameSenses } from '../../src/app/gameSystems/senseRules';
import { SightRulesWatch } from '../../src/app/pixi/lighting/SightRulesWatch';
import { AssetService } from '../../src/app/services/AssetService';
import { mapSenseRules, mapSenseRulesSource } from '../../src/app/services/mapSenseRules';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { sightSources } from '../../src/app/vision/sight';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { memoryPresets } from '../mocks/memoryPresets';
import { DEAD_CONDITION } from '../../src/app/gameSystems/deadCondition';

const MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';
const BOUNDS = { width: 4000, height: 4000 };
const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
const dnd = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:dnd5e')!;

describe('the watch on a user preset\'s senses', () => {
  let current: CreatureVault;
  let settings: CollectionSettings;
  let resolver: TokenSensesResolver;
  let watch: SightRulesWatch;
  let rebuilt: ReturnType<typeof vi.fn>;
  let atlas: ReturnType<typeof memoryPresets>;
  let presetId: string;
  const state = { mapPath: MAP, grid: null };

  beforeEach(() => {
    current = creatureVault();
    atlas = memoryPresets();
    presetId = new SystemPresetService(atlas).create('Homebrew', dnd.rules).id;
    vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(atlas as unknown as SystemPresetFiles);
    settings = { systemPresetId: presetId, conditions: [] } as unknown as CollectionSettings;
    const assets = AssetService.getInstance(current.app);
    vi.spyOn(assets, 'getCollectionForMap').mockReturnValue('dungeon');
    vi.spyOn(assets, 'getCollectionSettings').mockImplementation(() => settings);
    resolver = tokenSensesResolver(CreatureIndex.forApp(current.app), mapSenseRulesSource(current.app, assets, () => state));
    rebuilt = vi.fn();
    watch = new SightRulesWatch({ obsApp: current.app, store: { getState: () => state } as unknown as ViewAtlasStore, senses: resolver, frames: () => window, onChange: rebuilt });
  });

  afterEach(() => {
    watch.destroy();
    CreatureIndex.release(current.app);
    vi.restoreAllMocks();
  });

  const editPreset = (): void => {
    // The GM makes the preset's darkvision see nothing in the dark.
    const senses = dnd.rules.senses!.map((sense) => (sense.id === 'dnd5e-darkvision' ? { ...sense, sees: { ...sense.sees, dark: 'none' as const } } : sense));
    new SystemPresetService(atlas).update(presetId, { ...dnd.rules, senses });
  };
  const live = (): ReturnType<typeof mapSenseRules>['definitions'] => mapSenseRules(current.app, AssetService.getInstance(current.app), state).definitions;
  const viewer = { id: 't', kind: 'token', imagePath: 'g.png', x: 2000, y: 2000, vision: { enabled: true, senses: [{ id: 'dnd5e-darkvision', range: 60 }] } } as TokenEntity;

  it('follows the edit once a vision token was asked about (the announced path)', async () => {
    const before = watch.current();
    sightSources({ t: viewer }, { unitDistance: 5, cellSize: 70 }, BOUNDS, before);
    editPreset();
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(1);
    expect(sameSenses(watch.current().definitions, live())).toBe(true);
  });

  it('follows the edit made while the map has no vision token yet', async () => {
    // The view's first update reads the rules; no vision token, so the resolver is never asked.
    watch.current();
    editPreset();
    await nextFrame();
    // Now a token gets vision: sight is built with the rules the watch holds.
    const rules = watch.current();
    const [source] = sightSources({ t: viewer }, { unitDistance: 5, cellSize: 70 }, BOUNDS, rules);
    expect(live().find((sense) => sense.id === 'dnd5e-darkvision')!.sees.dark).toBe('none');
    expect(source!.senses[0]!.definition.sees.dark).toBe('none');
    expect(sameSenses(rules.definitions, live())).toBe(true);
  });
});

describe('the watch and an asset index that loads after the map', () => {
  it('reads the collection\'s rules once the index is loaded', async () => {
    const current = creatureVault();
    const state = { mapPath: MAP, grid: null };
    const assets = AssetService.getInstance(current.app);
    let loaded = false;
    const conditions = structuredClone(dnd.rules.conditions);
    vi.spyOn(assets, 'getCollectionForMap').mockImplementation(() => (loaded ? 'dungeon' : null));
    vi.spyOn(assets, 'getCollectionSettings').mockImplementation(() => ({ systemPresetId: 'builtin:dnd5e', conditions }) as unknown as CollectionSettings);
    vi.spyOn(assets, 'initialize').mockImplementation(async () => { await Promise.resolve(); loaded = true; });
    const resolver = tokenSensesResolver(CreatureIndex.forApp(current.app), mapSenseRulesSource(current.app, assets, () => state));
    const rebuilt = vi.fn();
    const watch = new SightRulesWatch({ obsApp: current.app, store: { getState: () => state } as unknown as ViewAtlasStore, senses: resolver, frames: () => window, onChange: rebuilt });
    // The view's first build, before the index is there.
    expect(watch.current().conditions).toEqual([DEAD_CONDITION]);
    await assets.initialize();
    await nextFrame();
    await nextFrame();
    const rules = watch.current();
    watch.destroy();
    CreatureIndex.release(current.app);
    vi.restoreAllMocks();
    expect(rules.conditions.length).toBeGreaterThan(0);
    expect(rules.definitions.some((sense) => sense.id === 'dnd5e-darkvision')).toBe(true);
  });
});

describe('the watch and the campaign being played', () => {
  it('reads the campaign\'s rules when its system starts to apply, and the collection\'s again when play stops', async () => {
    const current = creatureVault();
    const state = { mapPath: MAP, grid: null };
    const assets = AssetService.getInstance(current.app);
    vi.spyOn(assets, 'getCollectionForMap').mockReturnValue('dungeon');
    vi.spyOn(assets, 'getCollectionSettings').mockReturnValue({ systemPresetId: 'builtin:dnd5e', conditions: structuredClone(dnd.rules.conditions) });
    const blinded = { id: 'blind', name: 'Blind', color: '#000000', effect: 'blinded' } as const;
    const system = { systemPresetId: 'builtin:cairn', gridDefaults: dnd.rules.gridDefaults, conditions: [blinded] };
    const play = CampaignPlay.forApp(current.app);
    PlayedRules.open(current.app, memoryCampaigns([{ id: 'saga', name: 'Saga', createdAt: 1, system }]), play);
    const resolver = tokenSensesResolver(CreatureIndex.forApp(current.app), mapSenseRulesSource(current.app, assets, () => state));
    const rebuilt = vi.fn();
    const watch = new SightRulesWatch({ obsApp: current.app, store: { getState: () => state } as unknown as ViewAtlasStore, senses: resolver, frames: () => window, onChange: rebuilt });
    expect(watch.current().conditions.length).toBe(dnd.rules.conditions.length);

    play.play('saga');
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(1);
    expect(watch.current().conditions).toEqual([blinded, { ...DEAD_CONDITION, id: 'cairn-dead' }]);

    play.stop();
    await nextFrame();
    const conditions = watch.current().conditions.length;
    watch.destroy();
    PlayedRules.release(current.app);
    CreatureIndex.release(current.app);
    vi.restoreAllMocks();
    expect(rebuilt).toHaveBeenCalledTimes(2);
    expect(conditions).toBe(dnd.rules.conditions.length);
  });
});
