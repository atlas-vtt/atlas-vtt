// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { spawnAndClose, spawnEncounterTokens, spawnTokenAsset, type SpawnContext } from '../../src/app/packages/components/asset-manager/utils/tokenSpawnService';
import type { EncounterAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AtlasView } from '../../src/app/atlas-view';
import type { PlacementRequest } from '../../src/app/pixi/tokenPlacement/TokenPlacer';
import type { TokenInput } from '../../src/app/types/viewState';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ loadAtlasView: vi.fn(async () => null) }));

const goblin: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://goblin.png', imagePath: 'tokens/goblin.png', modifiedAt: 0 };

/** A hand that hands each request to `play`, which puts its tokens down in batches or puts them away. */
function scene(play: (request: PlacementRequest) => string[]) {
  const { app } = createInMemoryApp({ files: { 'tokens/goblin.png': '' } });
  app.workspace.setActiveLeaf = vi.fn();
  const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (p: { x: number; y: number }) => p, scale: { x: 1 } };
  const added: TokenInput[][] = [];
  const addTokens = vi.fn((tokens: TokenInput[]) => {
    added.push(tokens);
    return tokens.map((_, i) => `tok_${added.length}_${i}`);
  });
  const setSelection = vi.fn();
  const requests: PlacementRequest[] = [];
  const placer = { place: vi.fn(async (request: PlacementRequest) => { requests.push(request); return play(request); }) };
  const leaf = {};
  const view = {
    leaf,
    serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => null, getRenderer: () => ({ getTokenPlacer: () => placer }) }) },
    getStore: () => ({ getState: () => ({ mapPath: 'maps/cave.atlasmap', isMapLoading: false, addTokens, setSelection }) }),
  } as unknown as AtlasView;
  const onPlacing = vi.fn();
  const ctx: SpawnContext = { app, view, assetService: null, random: Math.random, onPlacing };
  return { ctx, app, leaf, added, addTokens, setSelection, requests, onPlacing };
}

describe('spawned tokens are placed by hand', () => {
  it('adds nothing until the GM puts the tokens down, and selects none of them', async () => {
    const { ctx, app, leaf, added, setSelection, requests, onPlacing } = scene((request) => {
      expect(added).toHaveLength(0);
      return request.commit([...request.tokens]);
    });
    const ids = await spawnTokenAsset(ctx, goblin, 3);
    expect(requests[0]?.tokens).toHaveLength(3);
    expect(new Set(requests[0]?.tokens.map((token) => `${token.x},${token.y}`)).size).toBe(3);
    expect(onPlacing).toHaveBeenCalledTimes(1);
    expect(app.workspace.setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: true });
    expect(added).toHaveLength(1);
    expect(ids).toEqual(['tok_1_0', 'tok_1_1', 'tok_1_2']);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('adds each token put down from the queue on its own, and selects none of them', async () => {
    const { ctx, added, setSelection } = scene((request) => request.tokens.flatMap((token) => request.commit([{ ...token, x: 5, y: 5 }])));
    const ids = await spawnTokenAsset(ctx, goblin, 2);
    expect(added.map((batch) => batch.length)).toEqual([1, 1]);
    expect(added.flat().map(({ x, y }) => [x, y])).toEqual([[5, 5], [5, 5]]);
    expect(setSelection).not.toHaveBeenCalled();
    expect(ids).toHaveLength(2);
  });

  it('adds and announces nothing when the GM puts every token away', async () => {
    const { ctx, addTokens, setSelection } = scene(() => []);
    vi.mocked(Notice).mockClear();
    const encounter: EncounterAsset = {
      id: 'ambush', name: 'Ambush', type: 'encounters', tags: [], tokenPreviews: [], modifiedAt: 0,
      tokens: [{ id: 'goblin', name: 'Goblin', imagePath: 'tokens/goblin.png', size: 1 }],
    };
    expect(await spawnEncounterTokens(ctx, encounter)).toEqual([]);
    expect(addTokens).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
  });
});

describe('the asset manager gets out of the way', () => {
  it('closes once, as soon as the tokens are in the hand', async () => {
    const { ctx } = scene((request) => request.commit([...request.tokens]));
    const onClose = vi.fn();
    const ids = await spawnAndClose(ctx, onClose, (spawnCtx) => spawnTokenAsset(spawnCtx, goblin, 1));
    expect(ids).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when nothing could be spawned', async () => {
    const { ctx } = scene(() => []);
    const onClose = vi.fn();
    await spawnAndClose(ctx, onClose, async () => []);
    expect(onClose).not.toHaveBeenCalled();
  });
});
