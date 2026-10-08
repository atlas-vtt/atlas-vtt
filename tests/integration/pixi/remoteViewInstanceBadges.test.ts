/**
 * Atlas #328 in a remote view. A remote view's store is a player view (`isPlayerView`, never the GM's), so its canvas
 * always shows the players' view, and its instance badges are counted and numbered among the tokens it shows: a
 * look-alike that is hidden or under the fog the view is fed neither counts nor takes a number, and the numbers an
 * extension hands in `instanceNumber` (the GM's) never show. The scene goes in as an extension feeds it, through
 * `RemoteSceneApplier`, so `instanceNumber` is what the extension sent, or absent when it sends none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Text, Texture, type Application, type EventSystem, type Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { AssetService } from '../../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { RemoteSceneApplier } from '../../../src/app/remote-view/RemoteSceneApplier';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import type { TokenEntity } from '../../../src/app/types';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import { fogCoverage } from '../../../src/app/fog/fogCoverage';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { fogRectangle } from '../../helpers/fogOperations';
import { remoteScene, remoteToken } from '../../unit/remoteSceneFixtures';

vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: vi.fn(), closeContextMenuGlobal: vi.fn() }));
vi.mock('../../../src/app/ui/textInputDialog', () => ({ promptForText: vi.fn(async () => null) }));
// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({ createLucideIconTexture: vi.fn(async () => new Texture()) }));

const GRID = 70;
const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / GRID) * GRID + GRID / 2, y: Math.floor(y / GRID) * GRID + GRID / 2 });
const grid = { getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap, snapTokenCenter: snap } as unknown as GridSystem;

/** How the lighting wires a view's tokens while dynamic lighting is on: the remote store's lighting stays off. */
type Wiring = 'without lighting' | 'with the lighting wired';

describe.each<Wiring>(['without lighting', 'with the lighting wired'])("A remote view's instance badges number only what its player sees (#328), %s", (wiring) => {
  let restoreGraphics: () => void;
  let viewport: Viewport;
  let store: ReturnType<typeof createViewAtlasStore>;
  let tokens: TokenRenderer;
  let applier: RemoteSceneApplier;

  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
    (AssetService as unknown as { instance: AssetService | null }).instance = null;
    const { app } = createInMemoryApp();
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: document.createElement('canvas') } as unknown as EventSystem });
    store = createViewAtlasStore(app, 'remote-badges', undefined, false, { remote: true });
    tokens = new TokenRenderer(app, viewport, grid, vi.fn(), store, new EventEmitter(), 'remote-badges');
    const ticker = { add: vi.fn(), remove: vi.fn() } as unknown as Ticker;
    tokens.setPixiApp({ ticker, canvas: document.createElement('canvas'), renderer: { generateTexture: vi.fn(() => new Texture()) } } as unknown as Application);
    // As the orchestrator wires every view: the fed fog hides the tokens under it in a player view.
    tokens.setFogCoverageProvider(() => fogCoverage(store.getState().objects.fog));
    if (wiring === 'with the lighting wired') {
      // `LightingController`'s wiring: the session lighting is active in a store that is not the GM's, and with
      // the scene's lighting off there is no perception and the sight is the scene's.
      const active = (): boolean => !store.getState().isGMView;
      tokens.setPlayerSightProvider(() => undefined, active, () => true);
    }
    applier = new RemoteSceneApplier(store, 'remote:remote-badges');
  });

  afterEach(() => {
    tokens.destroy();
    viewport.destroy();
    restoreGraphics();
  });

  /** What a token's badge shows on the canvas now: nothing, the GM's number or the players'. */
  const badgeLook = (id: string): string => {
    const group = tokens.getTokenSprites()[id];
    const badge = group?.getChildByLabel('instanceBadge');
    const disc = badge?.getChildByLabel('badgeBg');
    const gm = badge?.getChildByLabel('badgeText');
    const players = badge?.getChildByLabel('playerBadgeText');
    if (!group?.visible || !badge?.visible || !disc?.visible) return 'none';
    const gmShown = gm instanceof Text && gm.visible;
    const playersShown = players instanceof Text && players.visible;
    if (gmShown && !playersShown) return `gm ${gm.text}`;
    if (playersShown && !gmShown) return `players ${players.text}`;
    return gmShown ? 'both texts' : 'disc without text';
  };
  /** The number each token's badge shows, whichever text holds it; `none` for no badge. */
  const shownNumbers = (...ids: string[]): string[] => ids.map((id) => badgeLook(id).replace(/^(gm|players) /, ''));

  /** Look-alikes (no image URL: all one art) in a row, one cell apart, as the extension sends them. */
  const feed = async (goblins: Array<Partial<TokenEntity> & { id: string }>, fog: Record<string, FogOperation> = {}): Promise<void> => {
    const records = Object.fromEntries(goblins.map(({ id, ...fields }, index) => [id, remoteToken(id, { x: 105 + 140 * index, y: 105, ...fields })]));
    applier.apply(remoteScene({ objects: { tokens: records, texts: {}, drawings: {}, fog } }));
    await vi.waitFor(() => {
      for (const { id } of goblins) expect(tokens.getTokenSprites()[id]).toBeInstanceOf(Container);
    });
  };

  it('is a player view', () => {
    expect(store.getState().isPlayerView).toBe(true);
    expect(store.getState().isGMView).toBe(false);
  });

  it('numbers look-alikes sent without instance numbers (as an extension may send them) 1, 2, 3 instead of all 1', async () => {
    await feed([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(store.getState().objects.tokens.a?.instanceNumber).toBeUndefined();
    await vi.waitFor(() => expect(shownNumbers('a', 'b', 'c')).toEqual(['1', '2', '3']));
  });

  it("never shows the GM's numbers an extension sends: a gap left by a token the player does not have closes", async () => {
    await feed([{ id: 'a', instanceNumber: 2 }, { id: 'b', instanceNumber: 5 }]);
    await vi.waitFor(() => expect(shownNumbers('a', 'b')).toEqual(['1', '2']));
  });

  it('leaves a hidden look-alike out of the count and the numbers', async () => {
    await feed([{ id: 'a', instanceNumber: 1, isHidden: true }, { id: 'b', instanceNumber: 2 }, { id: 'c', instanceNumber: 3 }]);
    await vi.waitFor(() => expect(shownNumbers('a', 'b', 'c')).toEqual(['none', '1', '2']));
  });

  it('shows no badge on a token whose only look-alike is under the fed fog', async () => {
    await feed([{ id: 'a', instanceNumber: 1 }, { id: 'b', instanceNumber: 2 }], { paint: fogRectangle({ x: 200, y: 50, width: 100, height: 100 }) });
    expect(tokens.playersSeeOnCanvas()?.('b')).toBe(false);
    await vi.waitFor(() => expect(shownNumbers('a', 'b')).toEqual(['none', 'none']));
  });

  it('keeps the number of a token that stays in view when a look-alike before it leaves, and gives a newcomer the smallest free one', async () => {
    await feed([{ id: 'a', instanceNumber: 1 }, { id: 'b', instanceNumber: 2 }, { id: 'c', instanceNumber: 3 }]);
    await vi.waitFor(() => expect(shownNumbers('a', 'b', 'c')).toEqual(['1', '2', '3']));
    await feed([{ id: 'a', instanceNumber: 1, isHidden: true }, { id: 'b', instanceNumber: 2 }, { id: 'c', instanceNumber: 3 }]);
    await vi.waitFor(() => expect(shownNumbers('a', 'b', 'c')).toEqual(['none', '2', '3']));
    await feed([{ id: 'a', instanceNumber: 1, isHidden: true }, { id: 'b', instanceNumber: 2 }, { id: 'c', instanceNumber: 3 }, { id: 'd', instanceNumber: 4 }]);
    await vi.waitFor(() => expect(shownNumbers('a', 'b', 'c', 'd')).toEqual(['none', '2', '3', '1']));
  });
});
