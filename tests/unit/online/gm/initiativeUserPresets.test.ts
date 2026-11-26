import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GmMessage, SharedInitiative } from '../../../../src/app/online/protocol/index.ts';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import type { CollectionLookup } from '../../../../src/app/gameSystems/mapRules';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { AssetService } from '../../../../src/app/services/AssetService';
import { systemPresetsOf } from '../../../../src/app/services/mapCollectionRules';
import { rulesLookup } from '../../../../src/app/services/mapRules';
import { playerInitiativeList } from '../../../../src/app/services/playerInitiativeList';
import { SystemPresetService } from '../../../../src/app/services/SystemPresetService';
import { SystemPresetFiles } from '../../../../src/app/services/systemPresets/SystemPresetFiles';
import type { InitiativeRules } from '../../../../src/app/types/initiativeRulesTypes';
import type { InitiativeEntry, InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { memoryPresets } from '../../../mocks/memoryPresets';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sceneState, shareHarness, token, type Sent } from './shareHarness.ts';

const BY_SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players', sides: [{ id: 'players' }, { id: 'side-allies', name: 'Allies' }, { id: 'opponents' }], sideRoll: '1d6' };

const entry = (tokenId: string, order: number): InitiativeEntry => ({
  id: `e_${tokenId}`, tokenId, name: tokenId, initiative: 20 - order, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order,
});

const last = (sent: readonly Sent[]): SharedInitiative | null | undefined =>
  sent.flatMap(({ body }) => (body.t === 'initiative' ? [(body as Extract<GmMessage, { t: 'initiative' }>).list] : [])).at(-1);

afterEach(() => { vi.restoreAllMocks(); });

describe("the online players' list on a map whose collection plays by a user preset", () => {
  it('groups by the sides of that preset, as the player window\'s list does', async () => {
    const app = {} as App;
    const presets = memoryPresets();
    vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(presets as unknown as SystemPresetFiles);
    const homebrew = new SystemPresetService(presets).create('Homebrew', { ...BUILT_IN_SYSTEM_PRESETS[0]!.rules, initiative: BY_SIDES });
    const collections: CollectionLookup = { getCollectionForMap: () => 'dungeon', getCollectionSettings: () => ({ conditions: [], systemPresetId: homebrew.id }) };
    vi.spyOn(AssetService, 'getInstance').mockReturnValue(collections as unknown as AssetService);

    // The GM's tracker is open before the fight: the lists read their sides from the map's rules
    const tokens = { hero: token('hero', { side: 'players' }), hireling: token('hireling', { side: 'side-allies' }), ogre: token('ogre', { side: 'opponents' }) };
    const initiative: InitiativeState = { entries: [entry('hero', 0), entry('hireling', 1), entry('ogre', 2)], currentIndex: 0, round: 0, isActive: false, config: { autoSort: true } };
    const state = { ...sceneState({ objects: { ...sceneState().objects, tokens } }), initiative, initiativeTrackerOpen: true };

    const harness = shareHarness(state, new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])]]));
    harness.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, collections, app });
    harness.share.start();
    await harness.advance(TOKEN_INTERVAL_MS);
    await harness.advance(MAP_LAYER_INTERVAL_MS);
    const online = last(harness.sent);

    // The player window reads the list with the vault's lookup
    const window = playerInitiativeList({ initiative, mapPath: state.mapPath, objects: { tokens } }, { lookup: rulesLookup(app), presets: systemPresetsOf(app) });

    expect(window.bySides).toBe(true);
    expect(online?.bySides).toBe(window.bySides);
    expect(online?.sides?.map((side) => [side.id, side.name])).toEqual(window.sides.map((side) => [side.id, side.name]));
    expect(online?.combatants.map((combatant) => [combatant.name, combatant.sideId ?? combatant.side])).toEqual(window.combatants.map(({ entry: shown, token: listed }) => [shown.name, listed.side]));
  });
});
