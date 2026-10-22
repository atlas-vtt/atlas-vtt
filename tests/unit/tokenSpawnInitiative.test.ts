// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnEncounterTokens, spawnTokenAsset, spawnTokenGroups, type SpawnContext } from '../../src/app/packages/components/asset-manager/utils/tokenSpawnService';
import type { EncounterAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AssetService } from '../../src/app/services/AssetService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { isOffMap } from '../../src/app/tokens/offMap';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import type { TokenEntity } from '../../src/app/types';
import { loadStatblockOverrides } from '../../src/app/packages/components/asset-manager/utils/statblockLoader';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ loadAtlasView: vi.fn(async () => null) }));
// A goblin's statblock: 7 hit points, written as "7 (2d6)"
vi.mock('../../src/app/packages/components/asset-manager/utils/statblockLoader', () => ({
  loadStatblockOverrides: vi.fn(async () => ({ name: 'Goblin', resources: { hp: { current: 7, max: 7 } }, hitDice: '2d6' })),
}));

const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#cc3333', defeatedWhenSpent: true, visibleToPlayers: true };
const goblin: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://goblin.png', imagePath: 'tokens/goblin.png', statblockPath: 'Bestiary/Goblin.md', modifiedAt: 0 };
const hero: TokenAsset = { id: 'hero', name: 'Hero', type: 'tokens', imageUrl: 'app://hero.png', imagePath: 'tokens/hero.png', statblockPath: 'Party/Hero.md', modifiedAt: 0 };

interface Scene {
  ctx: SpawnContext;
  store: ViewAtlasStore;
}

/** An open scene whose collection tracks hit points and rolls them as creatures join when `rolls` says so. */
function openScene(rolls: boolean, random: () => number = Math.random): Scene {
  const { app } = createInMemoryApp({ files: { 'tokens/goblin.png': '', 'tokens/hero.png': '' } });
  const store = createViewAtlasStore(app, `spawn-initiative-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapPath: 'maps/cave.atlasmap', isMapLoading: false });
  getHistoryStore(store)?.getState().clear();
  const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (p: { x: number; y: number }) => p, scale: { x: 1 } };
  const view = {
    leaf: {},
    serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => null, getRenderer: () => null }) },
    getStore: () => store,
  } as unknown as AtlasView;
  const initiative = { mode: 'turn-order', roll: '1d20', firstSide: 'players', ...(rolls && { rollHitPoints: true }) };
  const assetService = {
    getAssetById: vi.fn(async (id: string) => (id === 'hero' ? { id, type: 'token', name: 'Hero', imagePath: 'tokens/hero.png', statblockPath: 'Party/Hero.md', playerCharacter: true } : id === 'goblin' ? { id, type: 'token', name: 'Goblin', imagePath: 'tokens/goblin.png', statblockPath: 'Bestiary/Goblin.md' } : null)),
    getCollectionForMap: vi.fn(() => 'dungeon'),
    getCollectionSettings: vi.fn(() => ({ conditions: [], resources: [HP], initiative })),
  } as unknown as AssetService;
  return { ctx: { app, view, assetService, random }, store };
}

const tokensOf = (store: ViewAtlasStore): TokenEntity[] => Object.values(store.getState().objects.tokens);

beforeEach(() => vi.mocked(loadStatblockOverrides).mockClear());

describe('adding tokens to initiative from the library', () => {
  it('adds each copy beside the map with its own entry and look-alike number, in one undo step', async () => {
    const { ctx, store } = openScene(false);
    const ids = await spawnTokenAsset(ctx, goblin, 3, 'beside');
    expect(ids).toHaveLength(3);
    expect(tokensOf(store).every(isOffMap)).toBe(true);
    expect(tokensOf(store).map((token) => token.instanceNumber)).toEqual([1, 2, 3]);
    expect(store.getState().initiative.entries.map((entry) => entry.tokenId)).toEqual(ids);
    // Spawned as placed tokens are: the statblock's values, read once
    expect(tokensOf(store)[0]).toMatchObject({ name: 'Goblin', statblockPath: 'Bestiary/Goblin.md', resources: { hp: { current: 7, max: 7 } } });
    expect(loadStatblockOverrides).toHaveBeenCalledTimes(1);
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(1);
    // Nothing on the map is selected for them
    expect(store.getState().selectedIds).toEqual([]);
  });

  it('starts a fight from an encounter: placed on the map and every creature in the tracker', async () => {
    const { ctx, store } = openScene(false);
    const encounter = { id: 'ambush', name: 'Ambush', type: 'encounters', tokens: [{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png' }, { id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png' }] } as unknown as EncounterAsset;
    const ids = await spawnEncounterTokens(ctx, encounter, 'fight');
    expect(tokensOf(store).some(isOffMap)).toBe(false);
    expect(store.getState().initiative.entries.map((entry) => entry.tokenId)).toEqual(ids);
    expect(store.getState().selectedIds).toEqual(ids);
    expect(store.getState().initiativeTrackerOpen).toBe(true);
  });

  it('brings a builder\'s picks in at once', async () => {
    const { ctx, store } = openScene(false);
    const ids = await spawnTokenGroups(ctx, [{ asset: goblin, count: 2 }, { asset: hero, count: 1 }], 'beside');
    expect(ids).toHaveLength(3);
    expect(store.getState().initiative.entries).toHaveLength(3);
  });
});

describe('hit points rolled as creatures join', () => {
  it('roll each copy\'s statblock hit dice as current and maximum, kept by later statblock syncs', async () => {
    const faces = [0, 0.99, 0.5, 0.5];
    const { ctx, store } = openScene(true, () => faces.shift() ?? 0);
    await spawnTokenAsset(ctx, goblin, 2, 'beside');
    const [first, second] = tokensOf(store);
    // 2d6: 1 + 6, then 4 + 4
    expect(first).toMatchObject({ resources: { hp: { current: 7, max: 7 } }, overriddenMax: ['hp'] });
    expect(second).toMatchObject({ resources: { hp: { current: 8, max: 8 } }, overriddenMax: ['hp'] });
  });

  it('never roll a player character\'s', async () => {
    const { ctx, store } = openScene(true, () => 0);
    await spawnTokenAsset(ctx, hero, 1);
    expect(tokensOf(store)[0]).toMatchObject({ resources: { hp: { current: 7, max: 7 } } });
    expect(tokensOf(store)[0]?.overriddenMax).toBeUndefined();
  });

  it('keep the statblock\'s average while the collection does not roll them', async () => {
    const { ctx, store } = openScene(false, () => 0);
    await spawnTokenAsset(ctx, goblin, 1);
    expect(tokensOf(store)[0]).toMatchObject({ resources: { hp: { current: 7, max: 7 } } });
    expect(tokensOf(store)[0]?.overriddenMax).toBeUndefined();
  });

  it('roll for a creature an encounter saved with its whole state', async () => {
    const { ctx, store } = openScene(true, () => 0);
    const state = { kind: 'character', name: 'Goblin', statblockPath: 'Bestiary/Goblin.md', hp: 7 };
    const encounter = { id: 'ambush', name: 'Ambush', type: 'encounters', tokens: [{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', state }] } as unknown as EncounterAsset;
    await spawnEncounterTokens(ctx, encounter);
    expect(tokensOf(store)[0]).toMatchObject({ resources: { hp: { current: 2, max: 2 } } });
  });
});
