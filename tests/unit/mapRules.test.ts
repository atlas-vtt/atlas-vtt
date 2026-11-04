import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rulesForMap, type PlayedSystem, type RulesLookup } from '../../src/app/gameSystems/mapRules';
import { AssetService } from '../../src/app/services/AssetService';
import { mapRules, onMapRulesChange, rulesLookup } from '../../src/app/services/mapRules';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { memoryPresets } from '../mocks/memoryPresets';

const MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';
const UNKNOWN = 'atlas-vtt/collections/new/scenes/hall.atlasmap';
const LOOSE = 'maps/loose.atlasmap';
const DUNGEON: CollectionSettings = { conditions: [{ id: 'prone', name: 'Prone', color: '#888888' }], systemPresetId: 'builtin:dnd5e' };
const CAMPAIGN: PlayedSystem = { campaignId: 'saga', settings: { conditions: [], systemPresetId: 'builtin:cairn' } };

function lookup(played: PlayedSystem | null = null): RulesLookup {
  return {
    getCollectionForMap: (path) => (path === MAP ? 'dungeon' : null),
    getCollectionSettings: () => DUNGEON,
    playedSystem: () => played,
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the rules a map plays by', () => {
  it('are its collection\'s while no campaign system applies', () => {
    expect(rulesForMap(lookup(), MAP)).toEqual({ source: { kind: 'collection', id: 'dungeon' }, settings: DUNGEON });
  });

  it('are none outside every collection, without a map, or in a collection the index does not know yet', () => {
    expect(rulesForMap(lookup(), LOOSE)).toEqual({ source: { kind: 'none', outsideCollections: true }, settings: null });
    expect(rulesForMap(lookup(), null)).toEqual({ source: { kind: 'none', outsideCollections: true }, settings: null });
    expect(rulesForMap(lookup(), undefined)).toEqual({ source: { kind: 'none', outsideCollections: true }, settings: null });
    expect(rulesForMap(lookup(), UNKNOWN)).toEqual({ source: { kind: 'none', outsideCollections: false }, settings: null });
  });

  it('are the played campaign\'s system for every map, wherever it lies', () => {
    for (const path of [MAP, LOOSE, UNKNOWN, null]) {
      expect(rulesForMap(lookup(CAMPAIGN), path)).toEqual({ source: { kind: 'campaign', id: 'saga' }, settings: CAMPAIGN.settings });
    }
  });

  it('are read from the asset index, unless other collections are given, with no campaign before campaigns are open', () => {
    const app = {} as App;
    vi.spyOn(AssetService, 'getInstance').mockReturnValue(lookup() as unknown as AssetService);
    expect(mapRules(app, MAP).source).toEqual({ kind: 'collection', id: 'dungeon' });
    expect(rulesLookup(app)).toBe(rulesLookup(app));
    const other = { getCollectionForMap: () => 'other', getCollectionSettings: () => ({ conditions: [] }) };
    expect(rulesForMap(rulesLookup(app, other), MAP).source).toEqual({ kind: 'collection', id: 'other' });
  });
});

describe('a change of the rules a map plays by', () => {
  type Listener = (collectionId: string) => unknown;

  function world(played: PlayedSystem | null = null): { app: App; saved: (collectionId: string) => void; listening: () => number; indexLoaded: () => Promise<void>; rules: RulesLookup } {
    const listeners = new Set<Listener>();
    const app = { workspace: { on: (_name: string, callback: Listener) => { listeners.add(callback); return callback; }, offref: (ref: Listener) => { listeners.delete(ref); } } } as unknown as App;
    let loaded: () => void = () => undefined;
    const index = new Promise<void>((resolve) => { loaded = resolve; });
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({ initialize: () => index } as unknown as AssetService);
    return {
      app,
      saved: (collectionId) => { for (const listener of [...listeners]) listener(collectionId); },
      listening: () => listeners.size,
      indexLoaded: async () => { loaded(); await index; await Promise.resolve(); },
      rules: lookup(played),
    };
  }

  it('is told for a save of the map\'s collection and of no other', () => {
    const { app, saved, rules } = world();
    const heard = vi.fn();
    let path: string | null = MAP;
    onMapRulesChange(app, () => path, heard, rules);
    saved('elsewhere');
    expect(heard).not.toHaveBeenCalled();
    saved('dungeon');
    expect(heard).toHaveBeenCalledTimes(1);
    path = LOOSE;
    saved('dungeon');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('is told for a save of any collection when asked for any map', () => {
    const { app, saved, rules } = world();
    const heard = vi.fn();
    onMapRulesChange(app, 'any', heard, rules);
    saved('elsewhere');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('is not told for a collection\'s save while a campaign system applies', () => {
    const { app, saved, rules } = world(CAMPAIGN);
    const heard = vi.fn();
    onMapRulesChange(app, () => MAP, heard, rules);
    onMapRulesChange(app, 'any', heard, rules);
    saved('dungeon');
    expect(heard).not.toHaveBeenCalled();
  });

  it('is told when a user preset changes and once the asset index has loaded', async () => {
    const { app, rules, indexLoaded } = world();
    const presets = memoryPresets();
    vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(presets as unknown as SystemPresetFiles);
    const heard = vi.fn();
    onMapRulesChange(app, () => MAP, heard, rules);
    new SystemPresetService(presets).create('Homebrew', BUILT_IN_SYSTEM_PRESETS[0]!.rules);
    expect(heard).toHaveBeenCalledTimes(1);
    await indexLoaded();
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('is told nothing once stopped', async () => {
    const { app, saved, listening, rules, indexLoaded } = world();
    const presets = memoryPresets();
    vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(presets as unknown as SystemPresetFiles);
    const heard = vi.fn();
    const stop = onMapRulesChange(app, () => MAP, heard, rules);
    expect(listening()).toBe(1);
    stop();
    expect(listening()).toBe(0);
    saved('dungeon');
    new SystemPresetService(presets).create('Homebrew', BUILT_IN_SYSTEM_PRESETS[0]!.rules);
    await indexLoaded();
    expect(heard).not.toHaveBeenCalled();
  });
});
