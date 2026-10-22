// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { spawnEncounterTokens, spawnSelectedTokens, spawnTokenAsset, type SpawnContext } from '../../src/app/packages/components/asset-manager/utils/tokenSpawnService';
import type { EncounterAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AssetService } from '../../src/app/services/AssetService';
import { loadAtlasView } from '../../src/app/plugin/atlasLeaves';
import type { TokenVisionDefaults } from '../../src/app/types/lightingTypes';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ loadAtlasView: vi.fn(async () => null) }));
beforeEach(() => {
  vi.mocked(Notice).mockClear();
  vi.mocked(loadAtlasView).mockResolvedValue(null);
});

const unframed: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://goblin.png', imagePath: 'tokens/goblin.png', showRing: false, size: 2, modifiedAt: 0 };
const framed: TokenAsset = { id: 'knight', name: 'Knight', type: 'tokens', imageUrl: 'app://knight.png', imagePath: 'tokens/knight.png', showRing: true, modifiedAt: 0 };

/** An Atlas view showing `mapPath` whose store records the tokens added to it. */
function mapView(mapPath: string | null = 'maps/cave.atlasmap', isMapLoading = false) {
  const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (p: { x: number; y: number }) => p, scale: { x: 1 } };
  const spawned: Array<Record<string, unknown>> = [];
  const addTokens = vi.fn((tokens: unknown[]) => tokens.map((data) => { spawned.push(data as Record<string, unknown>); return `tok_${spawned.length}`; }));
  const setSelection = vi.fn();
  const view = {
    leaf: {},
    serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => null, getRenderer: () => null }) },
    getStore: () => ({ getState: () => ({ mapPath, isMapLoading, addTokens, setSelection }) }),
  } as unknown as AtlasView;
  return { view, spawned, addTokens, setSelection };
}

function setup(records: Record<string, Partial<TokenAsset>> = {}, defaultTokenVision?: TokenVisionDefaults, mapPath = 'maps/cave.atlasmap') {
  const { app } = createInMemoryApp({ files: { 'tokens/goblin.png': '', 'tokens/knight.png': '' } });
  app.workspace.revealLeaf = vi.fn(async () => undefined);
  const { view, spawned, addTokens, setSelection } = mapView(mapPath);
  const ctx: SpawnContext = {
    app,
    view,
    random: Math.random,
    assetService: {
      getAssetById: vi.fn(async (id: string) => (id in records ? { id, type: 'token', name: id, imagePath: `tokens/${id}.png`, ...records[id] } : null)),
      getCollectionForMap: vi.fn((path: string) => (path === 'maps/cave.atlasmap' ? 'dungeon' : null)),
      getCollectionSettings: vi.fn(() => ({ conditions: [], ...(defaultTokenVision && { defaultTokenVision }) })),
    } as unknown as AssetService,
  };
  return { ctx, spawned, addTokens, setSelection };
}

describe('token spawning keeps asset defaults', () => {
  it('spawns several selected assets with each one\'s ring setting and size', async () => {
    const { ctx, spawned, setSelection } = setup();
    const ids = await spawnSelectedTokens(ctx, [unframed, framed]);
    expect(ids).toHaveLength(2);
    expect(spawned.map(t => [t.name, t.showRing, t.size])).toEqual([['Goblin', false, 2], ['Knight', true, undefined]]);
    expect(setSelection).toHaveBeenCalledWith(ids);
  });

  it('prefers the service record over the asset manager view model', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: true, size: 3, imagePath: 'tokens/goblin-v2.png' } });
    await spawnSelectedTokens(ctx, [unframed]);
    expect(spawned[0]).toMatchObject({ imagePath: 'tokens/goblin-v2.png', showRing: true, size: 3 });
  });

  it('spawns copies of a single asset without the ring when it is disabled', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: false } });
    await spawnTokenAsset(ctx, unframed, 2);
    expect(spawned.map(t => t.showRing)).toEqual([false, false]);
  });

  it('spawns several copies of one asset in a single batch, each on its own spot', async () => {
    const { ctx, spawned, addTokens, setSelection } = setup();
    const ids = await spawnTokenAsset(ctx, unframed, 4);
    expect(ids).toHaveLength(4);
    expect(addTokens).toHaveBeenCalledTimes(1);
    expect(new Set(spawned.map(t => `${t.x},${t.y}`)).size).toBe(4);
    expect(setSelection).toHaveBeenCalledWith(ids);
  });

  it('spawns a token without a statblock with no resources, so it shows no resource bar', async () => {
    const { ctx, spawned } = setup();
    await spawnTokenAsset(ctx, unframed, 1);
    expect(spawned[0]).not.toHaveProperty('resources');
    expect(spawned[0]).not.toHaveProperty('hp');
  });

  it('skips assets that have no image path', async () => {
    const { ctx, spawned } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ids = await spawnSelectedTokens(ctx, [{ ...framed, imagePath: undefined, imageUrl: '' }, unframed]);
    expect(ids).toHaveLength(1);
    expect(spawned[0]?.name).toBe('Goblin');
  });
});

describe('encounter spawning', () => {
  const encounter = (tokens: EncounterAsset['tokens']): EncounterAsset => ({
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokens, tokenPreviews: [], modifiedAt: 0,
  });

  it('frames tokens added from the asset manager like their token asset', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: false }, knight: { showRing: true } });
    await spawnEncounterTokens(ctx, encounter([
      { id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 },
      { id: 'knight', name: 'Knight', imagePath: 'tokens/knight.png', size: 1 },
    ]));
    expect(spawned.map(t => [t.name, t.showRing])).toEqual([['Goblin', false], ['Knight', true]]);
  });

  it('restores the ring saved with a token captured from a map', async () => {
    const { ctx, spawned } = setup({ goblin: { showRing: true } });
    await spawnEncounterTokens(ctx, encounter([
      { id: 'map-token', name: 'Goblin', imagePath: 'tokens/goblin.png', state: { kind: 'token', imagePath: 'tokens/goblin.png', showRing: false } },
    ]));
    expect(spawned[0]).toMatchObject({ imagePath: 'tokens/goblin.png', showRing: false });
  });

  it('migrates the saved state of an encounter token written before resources', async () => {
    const { ctx, spawned } = setup();
    await spawnEncounterTokens(ctx, encounter([
      { id: 'map-token', name: 'Goblin', imagePath: 'tokens/goblin.png', state: { kind: 'character', name: 'Goblin', imagePath: 'tokens/goblin.png', hp: { current: 4, max: 9 }, stress: 1, maxStress: 6 } },
    ]));
    expect(spawned[0]!.resources).toEqual({ hp: { current: 4, max: 9 }, stress: { current: 1, max: 6 } });
    expect(spawned[0]).not.toHaveProperty('stress');
    expect(spawned[0]).not.toHaveProperty('hp');
  });
});

describe('spawning from the global asset manager', () => {
  const ambush: EncounterAsset = {
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], modifiedAt: 0, tokenPreviews: [],
    tokens: [{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png' }],
  };
  const spawns: Array<[string, (ctx: SpawnContext) => Promise<string[]>]> = [
    ['a token', (ctx) => spawnTokenAsset(ctx, unframed, 1)],
    ['selected tokens', (ctx) => spawnSelectedTokens(ctx, [unframed])],
    ['an encounter', (ctx) => spawnEncounterTokens(ctx, ambush)],
  ];

  it.each(spawns)('adds %s to the open scene and brings it to the front', async (_label, spawn) => {
    const { ctx } = setup();
    const open = mapView();
    vi.mocked(loadAtlasView).mockResolvedValue(open.view);
    const ids = await spawn({ ...ctx, view: null });
    expect(ids).toEqual(['tok_1']);
    expect(open.spawned.map(t => t.name)).toEqual(['Goblin']);
    expect(open.setSelection).toHaveBeenCalledWith(ids);
    expect(ctx.app.workspace.revealLeaf).toHaveBeenCalledWith(open.view.leaf);
  });

  it.each(spawns)('tells the user no scene is open when adding %s without one', async (_label, spawn) => {
    const { ctx } = setup();
    const ids = await spawn({ ...ctx, view: null });
    expect(ids).toEqual([]);
    expect(vi.mocked(Notice).mock.calls).toEqual([[expect.stringContaining('No scene is open')]]);
  });

  it.each([
    ['has no scene yet', mapView(null)],
    ['is still loading its scene', mapView('maps/cave.atlasmap', true)],
  ])('shows the Atlas view that %s and says the scene is loading', async (_label, loading) => {
    const { ctx } = setup();
    vi.mocked(loadAtlasView).mockResolvedValue(loading.view);
    expect(await spawnTokenAsset({ ...ctx, view: null }, unframed, 1)).toEqual([]);
    expect(loading.addTokens).not.toHaveBeenCalled();
    expect(ctx.app.workspace.revealLeaf).toHaveBeenCalledWith(loading.view.leaf);
    expect(vi.mocked(Notice).mock.calls).toEqual([[expect.stringContaining('still loading')]]);
  });
});

describe('default token vision of the placing map\'s collection', () => {
  const encounter = (tokens: EncounterAsset['tokens']): EncounterAsset => ({
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokens, tokenPreviews: [], modifiedAt: 0,
  });
  const defaults: TokenVisionDefaults = { darkvision: 60, range: 120, angle: 90 };

  it('stamps every token spawned from the library with the default, vision off', async () => {
    const { ctx, spawned } = setup({}, defaults);
    await spawnTokenAsset(ctx, unframed, 2);
    await spawnSelectedTokens(ctx, [unframed, framed]);
    expect(spawned).toHaveLength(4);
    for (const token of spawned) expect(token.vision).toEqual({ enabled: false, darkvision: 60, range: 120, angle: 90 });
    expect(spawned[0]!.vision).not.toBe(spawned[1]!.vision);
  });

  it('stamps tokens an encounter builds from assets', async () => {
    const { ctx, spawned } = setup({ goblin: {} }, defaults);
    await spawnEncounterTokens(ctx, encounter([{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 }]));
    expect(spawned[0]!.vision).toEqual({ enabled: false, ...defaults });
  });

  it('ignores anything but the defaults in the stored settings, so vision stays off', async () => {
    const { ctx, spawned } = setup({}, { enabled: true, darkvision: 60, unknown: 1 } as TokenVisionDefaults);
    await spawnTokenAsset(ctx, unframed, 1);
    expect(spawned[0]!.vision).toEqual({ enabled: false, darkvision: 60 });
  });

  it('keeps the vision of a token restored from a saved snapshot, or none', async () => {
    const { ctx, spawned } = setup({}, defaults);
    await spawnEncounterTokens(ctx, encounter([
      { id: 'a', name: 'A', imagePath: 'tokens/goblin.png', state: { kind: 'token', imagePath: 'tokens/goblin.png', vision: { enabled: true, range: 15 } } },
      { id: 'b', name: 'B', imagePath: 'tokens/knight.png', state: { kind: 'token', imagePath: 'tokens/knight.png' } },
    ]));
    expect(spawned[0]!.vision).toEqual({ enabled: true, range: 15 });
    expect(spawned[1]).not.toHaveProperty('vision');
  });

  it('adds no vision field when the collection sets no default, sets an empty one or the map has no collection', async () => {
    for (const [vision, mapPath] of [[undefined, 'maps/cave.atlasmap'], [{}, 'maps/cave.atlasmap'], [defaults, 'maps/other.atlasmap']] as const) {
      const { ctx, spawned } = setup({}, vision, mapPath);
      await spawnTokenAsset(ctx, unframed, 1);
      expect(spawned[0]).not.toHaveProperty('vision');
    }
  });

  it('takes the default of the scene the global asset manager spawns into', async () => {
    const { ctx } = setup({}, defaults);
    const open = mapView();
    vi.mocked(loadAtlasView).mockResolvedValue(open.view);
    await spawnTokenAsset({ ...ctx, view: null }, unframed, 1);
    expect(open.spawned[0]!.vision).toEqual({ enabled: false, ...defaults });
  });
});

describe('a player character placed from the library', () => {
  const defaults: TokenVisionDefaults = { range: 120, angle: 90 };

  it('sees with the collection\'s default vision, in the one store write that places it', async () => {
    const { ctx, spawned, addTokens } = setup({ goblin: { playerCharacter: true }, knight: {} }, defaults);
    await spawnSelectedTokens(ctx, [unframed, framed]);
    expect(addTokens).toHaveBeenCalledTimes(1);
    expect(spawned.map((token) => token.vision)).toEqual([{ enabled: true, ...defaults }, { enabled: false, ...defaults }]);
  });

  it('sees without a default vision, from an encounter too, and never stamps vision off', async () => {
    const { ctx, spawned } = setup({ goblin: { playerCharacter: true } });
    await spawnTokenAsset(ctx, unframed, 2);
    await spawnEncounterTokens(ctx, { id: 'e', name: 'E', type: 'encounters', tags: [], tokens: [{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 }], tokenPreviews: [], modifiedAt: 0 });
    expect(spawned.map((token) => token.vision)).toEqual([{ enabled: true }, { enabled: true }, { enabled: true }]);
  });
});

describe('default token vision of a token with a linked statblock', () => {
  const darkvision = GENERIC_SENSES.find((sense) => sense.role === 'darkvision')!;
  const defaults: TokenVisionDefaults = { range: 120, senses: [{ id: darkvision.id, range: 30 }] };
  const bestiary = [
    { name: 'Goblin', path: 'Bestiary/Goblin.md', senses: 'darkvision 60 ft., passive Perception 9' },
    { name: 'Commoner', path: 'Bestiary/Commoner.md', senses: 'passive Perception 10' },
  ];

  beforeEach(() => { Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => bestiary } }); });
  afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

  it('leaves the default senses out, with or without senses in the statblock today, and stamps none of the statblock\'s', async () => {
    for (const statblockPath of ['Bestiary/Goblin.md', 'Bestiary/Commoner.md', 'Bestiary/Not read.md']) {
      const { ctx, spawned } = setup({ goblin: { statblockPath } }, defaults);
      await spawnTokenAsset(ctx, unframed, 2);
      await spawnSelectedTokens(ctx, [unframed]);
      expect(spawned).toHaveLength(3);
      for (const token of spawned) {
        expect(token.statblockPath).toBe(statblockPath);
        expect(token.vision).toEqual({ enabled: false, range: 120 });
      }
    }
  });

  it('stamps the whole default on a token without a statblock', async () => {
    const { ctx, spawned } = setup({ goblin: { statblockPath: 'Bestiary/Goblin.md' } }, defaults);
    await spawnSelectedTokens(ctx, [unframed, framed]);
    expect(spawned.map((token) => token.vision)).toEqual([{ enabled: false, range: 120 }, { enabled: false, ...defaults }]);
    expect(spawned[1]!.vision).not.toBe(defaults);
  });

  it('adds no vision field to a linked token when the collection sets no default, or only senses', async () => {
    for (const vision of [undefined, { senses: [{ id: darkvision.id }] }, { darkvision: 60 }]) {
      const { ctx, spawned } = setup({ goblin: { statblockPath: 'Bestiary/Goblin.md' } }, vision);
      await spawnTokenAsset(ctx, unframed, 1);
      expect(spawned[0]).toMatchObject({ statblockPath: 'Bestiary/Goblin.md', name: 'Goblin' });
      expect(spawned[0]).not.toHaveProperty('vision');
    }
  });

  it('applies the rule to tokens an encounter builds from assets', async () => {
    const { ctx, spawned } = setup({ goblin: { statblockPath: 'Bestiary/Goblin.md' } }, defaults);
    await spawnEncounterTokens(ctx, {
      id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokenPreviews: [], modifiedAt: 0,
      tokens: [{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 }],
    });
    expect(spawned[0]!.vision).toEqual({ enabled: false, range: 120 });
  });
});

describe('the library token a placed token came from', () => {
  const encounter = (tokens: EncounterAsset['tokens']): EncounterAsset => ({
    id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokens, tokenPreviews: [], modifiedAt: 0,
  });

  it('is named on every token placed from a library token record', async () => {
    const { ctx, spawned } = setup({ goblin: {}, knight: {} });
    await spawnSelectedTokens(ctx, [unframed, framed]);
    await spawnTokenAsset(ctx, unframed, 2);
    expect(spawned.map((token) => token.assetId)).toEqual(['goblin', 'knight', 'goblin', 'goblin']);
  });

  it('is left out where no record is found', async () => {
    const { ctx, spawned } = setup();
    await spawnTokenAsset(ctx, unframed, 1);
    expect(spawned[0]).not.toHaveProperty('assetId');
  });

  it('follows an encounter token that names a library token, and keeps the one a captured map token carried', async () => {
    const { ctx, spawned } = setup({ goblin: {} });
    await spawnEncounterTokens(ctx, encounter([
      { id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 },
      { id: 'map-token', name: 'Knight', imagePath: 'tokens/knight.png', state: { kind: 'token', imagePath: 'tokens/knight.png', assetId: 'knight' } },
      { id: 'map-token-2', name: 'Knight', imagePath: 'tokens/knight.png', size: 1 },
    ]));
    expect(spawned.map((token) => token.assetId)).toEqual(['goblin', 'knight', undefined]);
  });
});
