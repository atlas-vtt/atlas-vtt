import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Container,
  Point,
  Sprite,
  Text,
  Texture,
  type Application,
  type EventSystem,
  type FederatedPointerEvent,
  type Ticker,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { captureSceneFrame } from '../../../src/app/pixi/sceneFrameCapture';
import { DrawingRenderer } from '../../../src/app/pixi/DrawingRenderer';
import { MeasureRenderer } from '../../../src/app/pixi/MeasureRenderer';
import { PinRenderer } from '../../../src/app/pixi/PinRenderer';
import { FogOfWarRenderer } from '../../../src/app/pixi/fog/FogOfWarRenderer';
import { TextTool } from '../../../src/app/tools/TextTool';
import { TokenStatblockLinkService } from '../../../src/app/services/TokenStatblockLinkService';
import { AssetService } from '../../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { computeTokenPixelSize } from '../../../src/app/pixi/token-renderer/tokenSizing';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { DEFAULT_SETTINGS } from '../../../src/app/services/atlasSettings';
import { fogCoverage } from '../../../src/app/fog/fogCoverage';
import { fogRectangle } from '../../helpers/fogOperations';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { wirePlayerMeasurements } from '../../helpers/playerMeasureWiring';
import { captureWithLayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
import type { TokenEntity } from '../../../src/app/types';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal,
  closeContextMenuGlobal: vi.fn(),
}));

const promptForText = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../../src/app/ui/textInputDialog', () => ({ promptForText }));

// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({
  createLucideIconTexture: vi.fn(async () => new Texture()),
}));

const GOBLIN_IMAGE = 'atlas-vtt/collections/default/tokens/goblin.png';
const ORC_IMAGE = 'atlas-vtt/collections/default/tokens/orc.png';

type ViewStore = ReturnType<typeof createViewAtlasStore>;
type TickerCallback = (ticker: Pick<Ticker, 'deltaMS'>) => void;
type TokenInput = Parameters<ReturnType<ViewStore['getState']>['addToken']>[0];

/** Records ticker callbacks so a test can advance animations frame by frame. */
class FakeTicker {
  private callbacks = new Set<TickerCallback>();
  add(callback: TickerCallback): void {
    this.callbacks.add(callback);
  }
  remove(callback: TickerCallback): void {
    this.callbacks.delete(callback);
  }
  advance(deltaMS: number): void {
    for (const callback of Array.from(this.callbacks)) callback({ deltaMS });
  }
  get size(): number {
    return this.callbacks.size;
  }
}

/** A left-button pointer event at screen position (x, y); the viewport is unzoomed, so screen = world. */
const pointerEvent = (x: number, y: number): FederatedPointerEvent =>
  ({
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    global: new Point(x, y),
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  }) as unknown as FederatedPointerEvent;

const token = (overrides: Partial<TokenInput> & { id: string }): TokenInput => ({
  x: 100,
  y: 100,
  size: 1,
  imagePath: GOBLIN_IMAGE,
  layer: 0,
  isHidden: false,
  rotation: 0,
  ...overrides,
});

describe('TokenRenderer Integration Tests', () => {
  let tokenRenderer: TokenRenderer;
  let viewport: Viewport;
  let store: ViewStore;
  let eventBus: EventEmitter;
  let ticker: FakeTicker;
  let gridSize: number;
  let selectionOverlayUpdater: ReturnType<typeof vi.fn>;
  let obsidianApp: ReturnType<typeof createInMemoryApp>['app'];
  let restoreGraphics: () => void;
  let emitVault: ReturnType<typeof createInMemoryApp>['emit'];
  let viewportPointerDownListeners: number;
  let isRendererDestroyed: boolean;
  let canvas: HTMLCanvasElement;

  const snapToCellCenter = (x: number, y: number): { x: number; y: number } => ({
    x: Math.floor(x / gridSize) * gridSize + gridSize / 2,
    y: Math.floor(y / gridSize) * gridSize + gridSize / 2,
  });
  const gridSystem = {
    getOptions: () => ({ type: 'square', size: gridSize, offsetX: 0, offsetY: 0 }),
    snapToCellCenter,
    snapTokenCenter: snapToCellCenter,
  } as unknown as GridSystem;

  const createRenderer = (viewStore: ViewStore = store): TokenRenderer => {
    const renderer = new TokenRenderer(
      obsidianApp,
      viewport,
      gridSystem,
      selectionOverlayUpdater,
      viewStore,
      eventBus,
      'test-view-id',
    );
    canvas = document.createElement('canvas');
    renderer.setPixiApp({
      ticker,
      canvas,
      renderer: { generateTexture: vi.fn(() => new Texture()) },
    } as unknown as Application);
    return renderer;
  };

  const tokenGroup = (id: string): Container => tokenRenderer.getTokenSprites()[id] as Container;
  const tokenSprite = (id: string): Sprite => tokenGroup(id).getChildByLabel('tokenSprite') as Sprite;
  const waitForTokens = (...ids: string[]): Promise<void> =>
    vi.waitFor(() => {
      for (const id of ids) expect(tokenGroup(id)).toBeInstanceOf(Container);
    });

  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
    (AssetService as unknown as { instance: AssetService | null }).instance = null;

    const vault = createInMemoryApp({ files: { [GOBLIN_IMAGE]: 'goblin-bytes', [ORC_IMAGE]: 'orc-bytes' } });
    obsidianApp = vault.app;
    emitVault = vault.emit;
    // The viewport only needs the event system's DOM element to bind wheel/pointer listeners.
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
    viewportPointerDownListeners = viewport.listenerCount('pointerdown');
    store = createViewAtlasStore(obsidianApp, 'test-view-id');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/test.atlasmap');
    eventBus = new EventEmitter();
    ticker = new FakeTicker();
    gridSize = 70;
    selectionOverlayUpdater = vi.fn();

    tokenRenderer = createRenderer();
    isRendererDestroyed = false;
  });

  const destroyRenderer = (): void => {
    if (isRendererDestroyed) return;
    isRendererDestroyed = true;
    tokenRenderer.destroy();
  };

  afterEach(() => {
    destroyRenderer();
    viewport.destroy();
    restoreGraphics();
  });

  it('reloads only changed token art and removes the vault listener on destroy', async () => {
    store.getState().addToken(token({ id: 'goblin' }));
    store.getState().addToken(token({ id: 'orc', imagePath: ORC_IMAGE }));
    await waitForTokens('goblin', 'orc');
    const previous = tokenSprite('goblin').texture;
    const untouched = tokenSprite('orc').texture;
    const file = obsidianApp.vault.getFileByPath(GOBLIN_IMAGE);
    expect(file).not.toBeNull();
    emitVault('modify', file);
    await vi.waitFor(() => expect(tokenSprite('goblin').texture).not.toBe(previous));
    expect(previous.destroyed).toBe(true);
    expect(tokenSprite('orc').texture).toBe(untouched);
    destroyRenderer();
    const reads = vi.spyOn(obsidianApp.vault, 'readBinary').mockClear();
    emitVault('modify', file);
    await Promise.resolve();
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
  });

  it('loads tokens already present when the renderer is constructed', async () => {
    destroyRenderer();
    const existing = { ...token({ id: 'existing' }), kind: 'character' as const, name: 'Existing' };
    store.getState().addToken(existing);
    tokenRenderer = createRenderer();
    isRendererDestroyed = false;
    await waitForTokens('existing');
    expect(tokenSprite('existing').texture.label).toBe(GOBLIN_IMAGE);
  });

  it('applies statblock links to matching tokens and stops listening when destroyed', async () => {
    const file = await obsidianApp.vault.create('Goblin.md', '---\nname: Goblin\nhp: 12\n---\n');
    const cache = vi.spyOn(obsidianApp.metadataCache, 'getFileCache').mockImplementation(
      (candidate) => candidate.path === file.path ? { frontmatter: { name: 'Goblin', hp: 12, difficulty: 14 } } : null,
    );
    const links = TokenStatblockLinkService.getInstance(obsidianApp);
    const lookup = vi.spyOn(links, 'getStatblockLinkedToToken').mockResolvedValue(null);
    const linked = { ...token({ id: 'linked' }), kind: 'character' as const, name: 'Old', overriddenMax: ['hp'] };
    store.getState().addToken(linked);
    const other = { ...token({ id: 'other', imagePath: ORC_IMAGE }), kind: 'character' as const, name: 'Other' };
    store.getState().addToken(other);
    await waitForTokens('linked', 'other');
    const listenerCount = links.listenerCount('link-changed');
    links.emit('link-changed', { type: 'linked', tokenImagePath: GOBLIN_IMAGE, statblockPath: file.path });
    expect(store.getState().objects.tokens.linked).toMatchObject({ statblockPath: file.path, name: 'Goblin', difficulty: '14' });
    expect(store.getState().objects.tokens.linked?.overriddenMax).toBeUndefined();
    expect(store.getState().objects.tokens.other).toMatchObject({ name: 'Other' });
    destroyRenderer();
    expect(links.listenerCount('link-changed')).toBe(listenerCount - 1);
    links.emit('link-changed', { type: 'unlinked', tokenImagePath: GOBLIN_IMAGE, statblockPath: null });
    expect(store.getState().objects.tokens.linked).toMatchObject({ statblockPath: file.path, name: 'Goblin' });
    lookup.mockRestore();
    cache.mockRestore();
  });

  describe('Token Creation/Destruction', () => {
    it('should create tokens when added to store', async () => {
      store.getState().addToken(token({ id: 'token-1', ringColor: '#ff0000' }));
      await waitForTokens('token-1');

      const group = tokenGroup('token-1');
      expect(group.parent).toBe(tokenRenderer.getTokenContainer());
      expect(tokenRenderer.getTokenContainer().parent).toBe(viewport);
      expect(group.position).toMatchObject({ x: 100, y: 100 });
      expect(tokenSprite('token-1').texture.label).toBe(GOBLIN_IMAGE);
    });

    it('should destroy tokens when removed from store', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');
      const group = tokenGroup('token-1');

      store.getState().deleteToken('token-1');

      await vi.waitFor(() => expect(tokenRenderer.getTokenSprites()['token-1']).toBeUndefined());
      expect(group.destroyed).toBe(true);
      expect(tokenRenderer.getTokenContainer().children).not.toContain(group);
    });

    it('should handle multiple tokens', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      store.getState().addToken(token({ id: 'token-2', x: 200, y: 200, size: 2, imagePath: ORC_IMAGE, rotation: 45 }));
      await waitForTokens('token-1', 'token-2');

      expect(Object.keys(tokenRenderer.getTokenSprites())).toHaveLength(2);
      expect(tokenSprite('token-2').texture.label).toBe(ORC_IMAGE);
      expect(tokenSprite('token-2').rotation).toBeCloseTo(Math.PI / 4);
      expect(tokenSprite('token-1').width).toBeCloseTo(computeTokenPixelSize(70, 1));
      expect(tokenSprite('token-2').width).toBeCloseTo(computeTokenPixelSize(70, 2));
    });
  });

  describe('Map loads while tokens are loading', () => {
    const tokenGroups = (): Container[] =>
      tokenRenderer.getTokenContainer().children.filter((child) => child.label === 'tokenGroup');

    /** Holds every token image read until the returned function is called. */
    const holdImageReads = (): { reads: ReturnType<typeof vi.fn>; release: () => void } => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const read = obsidianApp.vault.readBinary;
      const reads = vi.fn(async (file: Parameters<typeof read>[0]) => {
        await gate;
        return read(file);
      });
      obsidianApp.vault.readBinary = reads;
      return { reads, release };
    };

    it('shows a token once when its map loads again before its sprite finished, and never keeps destroyed art', async () => {
      const { reads, release } = holdImageReads();
      store.getState().addToken(token({ id: 'goblin' }));
      await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(1));

      // The same scene loads again, e.g. when a restored player view switches scenes on startup
      eventBus.emit('map-loaded');
      await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
      release();
      await waitForTokens('goblin');
      await vi.waitFor(() => expect(tokenGroups()).toEqual([tokenGroup('goblin')]));

      // Switching to a scene without the goblin frees its art, which nothing may still show
      store.getState().clearMapState();
      store.getState().addToken(token({ id: 'orc', imagePath: ORC_IMAGE }));
      eventBus.emit('map-loaded');
      await waitForTokens('orc');

      expect(tokenGroups()).toEqual([tokenGroup('orc')]);
      expect(tokenSprite('orc').texture.source).not.toBeNull();
    });

    it('discards a sprite that finishes loading after the view switched to another scene and back', async () => {
      const { reads, release } = holdImageReads();
      store.getState().addToken(token({ id: 'goblin' }));
      await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(1));

      store.getState().clearMapState();
      eventBus.emit('map-loaded');
      store.getState().addToken(token({ id: 'goblin' }));
      eventBus.emit('map-loaded');
      release();
      await waitForTokens('goblin');

      await vi.waitFor(() => expect(tokenGroups()).toEqual([tokenGroup('goblin')]));
      expect(tokenSprite('goblin').texture.source).not.toBeNull();
    });
  });

  describe('Instance Badges', () => {
    const badgeOf = (id: string): Container | null => tokenGroup(id).getChildByLabel('instanceBadge');

    it('should number tokens spawned after the map loaded as soon as their sprites exist', async () => {
      // The first load redraws every badge once all sprites exist; later spawns must not depend on that.
      store.getState().addToken(token({ id: 'goblin-1' }));
      await waitForTokens('goblin-1');

      store.getState().addTokens([token({ id: 'goblin-2', x: 200 }), token({ id: 'goblin-3', x: 300 }), token({ id: 'orc', imagePath: ORC_IMAGE })]);
      await waitForTokens('goblin-2', 'goblin-3', 'orc');

      for (const id of ['goblin-1', 'goblin-2', 'goblin-3']) expect(badgeOf(id)?.visible).toBe(true);
      expect(badgeOf('orc')?.visible ?? false).toBe(false);
    });
  });

  describe('Sizing on Grid Change', () => {
    it('should update all token sizes when grid size changes', async () => {
      store.getState().addToken(token({ id: 'token-1', size: 2 }));
      await waitForTokens('token-1');
      expect(tokenSprite('token-1').width).toBeCloseTo(computeTokenPixelSize(70, 2));

      gridSize = 100;
      tokenRenderer.updateAllTokenSizes();

      expect(tokenSprite('token-1').width).toBeCloseTo(computeTokenPixelSize(100, 2));
      expect(tokenSprite('token-1').height).toBeCloseTo(computeTokenPixelSize(100, 2));
    });
  });

  describe('Selection frame', () => {
    it('redraws the frame of a selected token at its new size when it is resized', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');
      store.setState({ selectedIds: ['token-1'] });
      const widthsWhenDrawn: number[] = [];
      selectionOverlayUpdater.mockImplementation(() => widthsWhenDrawn.push(tokenSprite('token-1').width));

      store.getState().updateToken('token-1', { size: 1.5 });

      await vi.waitFor(() => expect(widthsWhenDrawn.at(-1)).toBeCloseTo(computeTokenPixelSize(70, 1.5)));
    });
  });

  describe('Ring Color Update', () => {
    it('should update ring color when token ringColor changes', async () => {
      store.getState().addToken(token({ id: 'token-1', ringColor: '#ff0000' }));
      await waitForTokens('token-1');
      const ringBefore = tokenGroup('token-1').getChildByLabel('tokenRing');
      expect(ringBefore).not.toBeNull();

      store.getState().updateToken('token-1', { ringColor: '#00ff00' });

      await vi.waitFor(() => {
        const ringAfter = tokenGroup('token-1').getChildByLabel('tokenRing');
        expect(ringAfter).not.toBeNull();
        expect(ringAfter).not.toBe(ringBefore);
      });
      expect(ringBefore?.destroyed).toBe(true);
    });
  });

  describe('committed fog visibility', () => {
    const paint = fogRectangle({ x: 150, y: 0, width: 100, height: 400 });
    const wireFog = (): void => tokenRenderer.setFogCoverageProvider(() => fogCoverage(store.getState().objects.fog));
    const setFog = (covered = true): void => store.setState((state) => ({
      objects: { ...state.objects, fog: covered ? { paint } : {} },
    }));

    it('filters unlit session tokens and hits, refreshes on fog alone, and preserves GM view', async () => {
      wireFog();
      store.getState().addToken(token({ id: 'covered', x: 200 }));
      await waitForTokens('covered');
      setFog();
      expect(tokenGroup('covered').visible).toBe(true);
      store.getState().setGMView(false);
      expect(tokenGroup('covered').visible).toBe(false);
      expect(tokenRenderer.hitTestTokens(200, 100)).toBeNull();
      expect(tokenRenderer.visibleTokenIds()).toEqual([]);
      setFog(false);
      expect(tokenGroup('covered').visible).toBe(true);
      setFog();
      expect(tokenGroup('covered').visible).toBe(false);
      store.getState().setGMView(true);
      expect(tokenGroup('covered').visible).toBe(true);
    });

    it('filters a player frame without lighting, including nameplates, while preserving the GM canvas', async () => {
      wireFog();
      setFog();
      const named = { ...token({ id: 'covered', x: 200, kind: 'character', showNameplate: true }), name: 'Goblin' };
      store.getState().addToken(named);
      await waitForTokens('covered');
      const layers = tokenRenderer.getPlayerViewLayers({ ...DEFAULT_SETTINGS.localPlayerView, showTokenNameplates: true });
      expect(layers).toContainEqual({ layer: tokenGroup('covered'), visible: false });
      expect(layers.some(({ layer, visible }) => layer !== tokenGroup('covered') && visible === false)).toBe(true);
      expect(tokenGroup('covered').visible).toBe(true);
    });

    it('retains fog when lighting is removed and applies it during an existing unlit peek', async () => {
      wireFog();
      setFog();
      store.getState().addToken(token({ id: 'covered', x: 200 }));
      await waitForTokens('covered');
      let peeking = true;
      tokenRenderer.setPlayerSightProvider(() => undefined, () => peeking);
      tokenRenderer.refreshPlayerSight();
      expect(tokenGroup('covered').visible).toBe(false);
      peeking = false;
      tokenRenderer.refreshPlayerSight();
      expect(tokenGroup('covered').visible).toBe(true);
      store.getState().setGMView(false);
      tokenRenderer.clearLighting();
      expect(tokenGroup('covered').visible).toBe(false);
    });

    it('hides a held token at its displayed centre before the store catches up, and completes the drag', async () => {
      wireFog();
      setFog();
      store.getState().setGMView(false);
      store.getState().addToken(token({ id: 'moving', x: 105, y: 105 }));
      await waitForTokens('moving');
      viewport.emit('pointerdown', pointerEvent(105, 105));
      viewport.emit('pointermove', pointerEvent(120, 105));
      viewport.emit('pointermove', pointerEvent(180, 105));
      expect(tokenGroup('moving').x).toBe(180);
      expect(store.getState().objects.tokens['moving']?.x).not.toBe(180);
      expect(tokenGroup('moving').visible).toBe(false);
      const rulerLayers = tokenRenderer.getPlayerViewLayers(DEFAULT_SETTINGS.localPlayerView).slice(-2);
      expect(rulerLayers).toHaveLength(2);
      expect(rulerLayers.every(({ layer, visible }) => !visible && !layer.visible)).toBe(true);
      viewport.emit('pointermove', pointerEvent(320, 105));
      expect(tokenGroup('moving').visible).toBe(true);
      viewport.emit('pointerup', pointerEvent(320, 105));
      expect(store.getState().objects.tokens['moving']?.x).toBe(tokenGroup('moving').x);
      expect(store.getState().objects.tokens['moving']?.x).toBeGreaterThan(250);
    });

    it.each(['release', 'cancel'])('finishes a covered drag on %s as one undo step', async (ending) => {
      wireFog();
      setFog();
      store.getState().setGMView(false);
      store.getState().addToken(token({ id: 'moving', x: 105, y: 105 }));
      await waitForTokens('moving');
      const history = getHistoryStore(store)!;
      const before = history.getState().pastStates.length;
      viewport.emit('pointerdown', pointerEvent(105, 105));
      viewport.emit('pointermove', pointerEvent(180, 105));
      expect(tokenGroup('moving').visible).toBe(false);
      if (ending === 'cancel') viewport.options.events.domElement.dispatchEvent(new Event('pointercancel'));
      else viewport.emit('pointerup', pointerEvent(180, 105));
      expect(store.getState().isDragging).toBe(false);
      expect(store.getState().objects.tokens.moving?.x).toBe(175);
      expect(history.getState().pastStates).toHaveLength(before + 1);
      expect(tokenGroup('moving').visible).toBe(false);
      history.getState().undo();
      await vi.waitFor(() => expect(tokenGroup('moving').x).toBe(105));
      expect(tokenGroup('moving').visible).toBe(true);
    });

    it('updates only the moving token outline during animation', async () => {
      wireFog();
      setFog();
      const perceive = vi.fn((_id: string) => 'sensed' as const);
      tokenRenderer.setPlayerSightProvider(() => perceive);
      store.getState().addToken(token({ id: 'moving', x: 100 }));
      store.getState().addToken(token({ id: 'stationary', x: 350 }));
      await waitForTokens('moving', 'stationary');
      tokenRenderer.refreshPlayerSight();
      perceive.mockClear();
      eventBus.emit('animate-token-to-position', { tokenId: 'moving', targetX: 120, targetY: 100 });
      ticker.advance(10);
      expect(perceive).toHaveBeenCalled();
      expect(perceive.mock.calls.every(([id]) => id === 'moving')).toBe(true);
    });

    it('uses the displayed centre during path animation and keeps the animation running', async () => {
      wireFog();
      setFog();
      store.getState().setGMView(false);
      store.getState().addToken(token({ id: 'moving' }));
      await waitForTokens('moving');
      eventBus.emit('animate-token-path', {
        tokenId: 'moving', finalX: 300, finalY: 100,
        path: [{ x: 150, y: 100, timestamp: 0 }, { x: 250, y: 100, timestamp: 500 }], duration: 1000,
      });
      ticker.advance(200);
      expect(tokenGroup('moving').x).toBeGreaterThan(150);
      expect(tokenGroup('moving').x).toBeLessThan(250);
      expect(store.getState().objects.tokens['moving']?.x).toBe(100);
      expect(tokenGroup('moving').visible).toBe(false);
      ticker.advance(600);
      expect(tokenGroup('moving').x).toBe(300);
      expect(tokenGroup('moving').visible).toBe(true);
      expect(ticker.size).toBe(0);
    });
  });

  describe('Movement & Path Animation', () => {
    it('should move the sprite when the token position changes in the store', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');

      store.getState().moveToken('token-1', 200, 240);

      await vi.waitFor(() => expect(tokenGroup('token-1').position).toMatchObject({ x: 200, y: 240 }));
    });

    it('should play back a recorded path and commit the final position to the store', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');

      eventBus.emit('animate-token-path', {
        tokenId: 'token-1',
        finalX: 300,
        finalY: 300,
        path: [
          { x: 150, y: 150, timestamp: 0 },
          { x: 250, y: 250, timestamp: 500 },
        ],
        duration: 1000,
      });
      expect(ticker.size).toBe(1);

      ticker.advance(400);
      const midway = tokenGroup('token-1').position;
      expect(midway.x).toBeGreaterThan(100);
      expect(midway.x).toBeLessThan(300);
      expect(store.getState().objects.tokens['token-1']).toMatchObject({ x: 100, y: 100 });

      ticker.advance(400);
      expect(tokenGroup('token-1').position).toMatchObject({ x: 300, y: 300 });
      expect(store.getState().objects.tokens['token-1']).toMatchObject({ x: 300, y: 300 });
      expect(ticker.size).toBe(0);
    });
  });

  describe('Selection & Drag', () => {
    it('should select a token on pointer down, drag it and commit the snapped position as one undo step', async () => {
      store.getState().addToken(token({ id: 'token-1', x: 105, y: 105 }));
      await waitForTokens('token-1');
      expect(tokenRenderer.hitTestTokens(105, 105)).toBe('token-1');
      expect(tokenRenderer.hitTestTokens(900, 900)).toBeNull();
      const undoStepsBefore = getHistoryStore(store)!.getState().pastStates.length;

      viewport.emit('pointerdown', pointerEvent(105, 105));
      expect(store.getState().selectedIds).toEqual(['token-1']);

      viewport.emit('pointermove', pointerEvent(180, 105));
      expect(tokenGroup('token-1').position).toMatchObject({ x: 180, y: 105 });
      expect(store.getState().isDragging).toBe(true);

      viewport.emit('pointerup', pointerEvent(180, 105));

      // 180 lies in the third 70px cell, whose centre is 175.
      expect(store.getState().objects.tokens['token-1']).toMatchObject({ x: 175, y: 105 });
      expect(tokenGroup('token-1').position).toMatchObject({ x: 175, y: 105 });
      expect(store.getState().isDragging).toBe(false);
      expect(selectionOverlayUpdater).toHaveBeenCalled();
      expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(undoStepsBefore + 1);
    });
  });

  describe('Light markers in the dispatch', () => {
    const lightHandlers = (takes: boolean): { pointerDown: ReturnType<typeof vi.fn>; cursorAt: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn> } => ({
      pointerDown: vi.fn(() => takes),
      cursorAt: vi.fn(() => (takes ? 'pointer' : null)),
      leave: vi.fn(),
    });

    it('gives a left press to a light marker before the token beneath it, with the select tool', async () => {
      store.getState().addToken(token({ id: 'token-1', x: 105, y: 105 }));
      await waitForTokens('token-1');
      const lights = lightHandlers(true);
      tokenRenderer.setLightHandlers(lights);

      viewport.emit('pointerdown', pointerEvent(105, 105));
      viewport.emit('pointerup', pointerEvent(105, 105));

      expect(lights.pointerDown).toHaveBeenCalledWith(105, 105, expect.anything());
      expect(store.getState().selectedIds).toEqual([]);
    });

    it('lets the press through to the token where no marker takes it', async () => {
      store.getState().addToken(token({ id: 'token-1', x: 105, y: 105 }));
      await waitForTokens('token-1');
      tokenRenderer.setLightHandlers(lightHandlers(false));

      viewport.emit('pointerdown', pointerEvent(105, 105));
      viewport.emit('pointerup', pointerEvent(105, 105));

      expect(store.getState().selectedIds).toEqual(['token-1']);
    });

    it('asks pins and door badges first', () => {
      const lights = lightHandlers(true);
      tokenRenderer.setLightHandlers(lights);
      const pinClick = vi.fn();
      tokenRenderer.setPinHitTestProvider((x) => (x < 50 ? 'pin-1' : null));
      tokenRenderer.setPinClickHandler(pinClick);
      tokenRenderer.setDoorClickHandler((x) => x > 500);

      viewport.emit('pointerdown', pointerEvent(20, 20));
      viewport.emit('pointerdown', pointerEvent(600, 20));
      expect(pinClick).toHaveBeenCalledTimes(1);
      expect(lights.pointerDown).not.toHaveBeenCalled();

      viewport.emit('pointerdown', pointerEvent(300, 20));
      expect(lights.pointerDown).toHaveBeenCalledTimes(1);
    });

    it('leaves a right press to the menus', () => {
      const lights = lightHandlers(true);
      tokenRenderer.setLightHandlers(lights);
      viewport.emit('pointerdown', { ...pointerEvent(300, 20), button: 2 } as unknown as FederatedPointerEvent);
      expect(lights.pointerDown).not.toHaveBeenCalled();
    });

    it('shows the marker\'s cursor on hover and clears the hover when the pointer leaves the canvas', () => {
      const lights = lightHandlers(true);
      tokenRenderer.setLightHandlers(lights);
      viewport.emit('pointermove', { ...pointerEvent(300, 20), clientX: 300, clientY: 20 });
      expect(lights.cursorAt).toHaveBeenCalledWith(300, 20);
      expect(viewport.cursor).toBe('pointer');
      canvas.dispatchEvent(new Event('pointerleave'));
      expect(lights.leave).toHaveBeenCalled();
    });
  });

  // A marker takes its click with any tool; the tool must not also draw, measure or place there.
  describe('A click on a marker and the active tool', () => {
    const MARKERS: [string, number][] = [['a note pin', 20], ['a door badge', 530], ['a light marker', 300]];
    const OFF_MARKERS = 700;

    beforeEach(() => {
      tokenRenderer.setPinHitTestProvider((x) => (x < 50 ? 'pin-1' : null));
      tokenRenderer.setPinClickHandler(vi.fn());
      tokenRenderer.setDoorClickHandler((x) => x > 500 && x < 560);
      tokenRenderer.setLightHandlers({ pointerDown: (x) => x > 290 && x < 310, cursorAt: () => null, leave: () => undefined });
      promptForText.mockClear();
    });

    const click = (x: number): void => {
      viewport.emit('pointerdown', pointerEvent(x, 200));
      viewport.emit('pointerup', pointerEvent(x, 200));
      viewport.emit('pointertap', pointerEvent(x, 200));
    };

    it.each(MARKERS)('draws no stroke and stamps no icon on %s', (_marker, x) => {
      const drawing = new DrawingRenderer(viewport, eventBus, store);
      try {
        for (const tool of ['draw-pen', 'draw-icon'] as const) {
          store.getState().setActiveTool(tool);
          click(x);
        }
        expect(store.getState().objects.drawings).toEqual({});
        click(OFF_MARKERS);
        expect(Object.keys(store.getState().objects.drawings)).toHaveLength(1);
      } finally {
        drawing.destroy();
      }
    });

    it.each(MARKERS)('starts no measurement on %s', (_marker, x) => {
      const measure = new MeasureRenderer(viewport, eventBus, store, gridSystem);
      const started = (): boolean => (measure as unknown as { isDrawing: boolean }).isDrawing;
      try {
        store.getState().setActiveTool('measure');
        viewport.emit('pointerdown', pointerEvent(x, 200));
        expect(started()).toBe(false);
        viewport.emit('pointerup', pointerEvent(x, 200));
        viewport.emit('pointerdown', pointerEvent(OFF_MARKERS, 200));
        expect(started()).toBe(true);
      } finally {
        measure.destroy();
      }
    });

    it.each(MARKERS)('paints no fog on %s', (_marker, x) => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => (): void => undefined }) as never);
      const fog = new FogOfWarRenderer(viewport, { canvas: createEl('canvas') } as unknown as Application, eventBus as never, store);
      try {
        store.getState().setActiveTool('fog');
        click(x);
        expect(store.getState().objects.fog).toEqual({});
        click(OFF_MARKERS);
        expect(Object.keys(store.getState().objects.fog)).toHaveLength(1);
      } finally {
        fog.destroy();
        vi.restoreAllMocks();
      }
    });

    it.each(MARKERS)('opens no text box on %s', (_marker, x) => {
      const text = new TextTool(viewport, store, gridSystem, eventBus);
      try {
        store.getState().setActiveTool('text');
        text.activate();
        click(x);
        expect(promptForText).not.toHaveBeenCalled();
        click(OFF_MARKERS);
        expect(promptForText).toHaveBeenCalledTimes(1);
      } finally {
        text.deactivate();
      }
    });

    it.each(MARKERS)('places no note pin on %s', (_marker, x) => {
      const pins = new PinRenderer(viewport, eventBus, store);
      const placed = vi.fn();
      eventBus.on('canvas-click', placed);
      try {
        store.getState().setActiveTool('note-pin');
        click(x);
        expect(placed).not.toHaveBeenCalled();
        click(OFF_MARKERS);
        expect(placed).toHaveBeenCalledTimes(1);
      } finally {
        pins.destroy();
      }
    });
  });

  describe('Right-click', () => {
    const rightClick = (x: number, y: number): FederatedPointerEvent =>
      ({ ...pointerEvent(x, y), button: 2, clientX: x + 300, clientY: y + 40 }) as unknown as FederatedPointerEvent;

    it('opens the token menu at the pointer for a token inside fog, and the fog menu beside it', async () => {
      const fogClickHandler = vi.fn();
      tokenRenderer.setFogHitTestProvider(() => 'fog-1');
      tokenRenderer.setFogClickHandler(fogClickHandler);
      store.getState().addToken(token({ id: 'token-1', x: 105, y: 105 }));
      await waitForTokens('token-1');

      viewport.emit('pointerdown', rightClick(105, 105));
      expect(fogClickHandler).not.toHaveBeenCalled();
      expect(openContextMenuGlobal).toHaveBeenCalledWith(expect.any(Array), { x: 405, y: 145 });

      viewport.emit('pointerdown', rightClick(900, 900));
      viewport.emit('pointerup', rightClick(900, 900));
      expect(fogClickHandler).toHaveBeenCalledWith('fog-1', expect.anything());
    });

    it('leaves a right press on fog to the pan and opens the fog menu only when it is released in place', () => {
      const fogClickHandler = vi.fn();
      tokenRenderer.setFogHitTestProvider(() => 'fog-1');
      tokenRenderer.setFogClickHandler(fogClickHandler);

      viewport.emit('pointerdown', rightClick(900, 900));
      expect(fogClickHandler).not.toHaveBeenCalled();
      viewport.emit('pointermove', rightClick(960, 900));
      viewport.emit('pointerup', rightClick(960, 900));
      expect(fogClickHandler).not.toHaveBeenCalled();

      viewport.emit('pointerdown', rightClick(900, 900));
      viewport.emit('pointermove', rightClick(902, 900));
      viewport.emit('pointerup', rightClick(902, 900));
      expect(fogClickHandler).toHaveBeenCalledExactlyOnceWith('fog-1', expect.objectContaining({ clientX: 1202 }));
    });

    it('leaves a right press with the wall tool to the pan and opens the wall menu only when it is released in place', () => {
      const wallMenu = vi.fn();
      tokenRenderer.setWallContextMenuHandler(wallMenu);
      store.setState({ activeTool: 'wall' }); // the tool is behind a feature flag

      viewport.emit('pointerdown', rightClick(900, 900));
      viewport.emit('pointermove', rightClick(960, 900));
      viewport.emit('pointerup', rightClick(960, 900));
      expect(wallMenu).not.toHaveBeenCalled();

      viewport.emit('pointerdown', rightClick(900, 900));
      expect(wallMenu).not.toHaveBeenCalled();
      viewport.emit('pointerup', rightClick(902, 900));
      expect(wallMenu).toHaveBeenCalledExactlyOnceWith(900, 900, 1202, 940);
    });
  });

  describe('Hover', () => {
    it('should drop the statblock hover when the pointer leaves the canvas', async () => {
      store.getState().addToken(token({ id: 'token-1', x: 105, y: 105, kind: 'character', statblockPath: 'Goblin.md' }));
      await waitForTokens('token-1');
      const hovered = vi.fn();
      const left = vi.fn();
      eventBus.on('pin-hover-preview', hovered);
      eventBus.on('pin-hide-preview', left);

      viewport.emit('pointermove', { ...pointerEvent(105, 105), clientX: 105, clientY: 105 });
      expect(hovered).toHaveBeenCalledTimes(1);

      canvas.dispatchEvent(new Event('pointerleave'));
      expect(left).toHaveBeenCalledWith({ pin: expect.objectContaining({ id: 'token-1' }) });
    });
  });

  describe('Canvas Listeners', () => {
    it('should forward a double-click to the wall tool', () => {
      const doubleClicked = vi.fn();
      tokenRenderer.setWallDoubleClickHandler(doubleClicked);
      store.setState({ activeTool: 'wall' }); // the tool is behind a feature flag

      canvas.dispatchEvent(new MouseEvent('dblclick'));
      expect(doubleClicked).toHaveBeenCalledTimes(1);
    });
  });

  describe('Token Visibility', () => {
    it('should show hidden tokens dimmed to the GM', async () => {
      store.getState().addToken(token({ id: 'token-1', isHidden: true }));
      await waitForTokens('token-1');

      expect(tokenGroup('token-1').visible).toBe(true);
      expect(tokenGroup('token-1').alpha).toBe(0.5);
    });

    it('should show tokens when isHidden is false', async () => {
      store.getState().addToken(token({ id: 'token-1', isHidden: false }));
      await waitForTokens('token-1');

      expect(tokenGroup('token-1').visible).toBe(true);
      expect(tokenGroup('token-1').alpha).toBe(1);
    });

    // The player window mirrors this canvas, so the DM previewing the player
    // perspective must see exactly what players get.
    describe('player perspective', () => {
      it('should hide hidden tokens added while the DM previews the player perspective', async () => {
        store.getState().setGMView(false);
        store.getState().addToken(token({ id: 'token-1', isHidden: true }));
        await waitForTokens('token-1');

        expect(tokenGroup('token-1').visible).toBe(false);
      });

      it('should hide already rendered hidden tokens when the DM switches to the player perspective', async () => {
        store.getState().addToken(token({ id: 'token-1', isHidden: true }));
        await waitForTokens('token-1');

        store.getState().setGMView(false);

        await vi.waitFor(() => expect(tokenGroup('token-1').visible).toBe(false));
      });

      it('should keep regular tokens with vault images visible in the player perspective', async () => {
        store.getState().setGMView(false);
        store.getState().addToken(token({ id: 'token-1', isHidden: false }));
        await waitForTokens('token-1');

        expect(tokenGroup('token-1').visible).toBe(true);
      });

      // With dynamic lighting the canvas hides what the players' tokens do not see, as their frame does.
      describe('with the players\' sight', () => {
        const tokenUi = (id: string): Container =>
          (tokenRenderer as unknown as { uiManager: { getTokenUIs(): Record<string, { getContainer(): Container }> } })
            .uiManager.getTokenUIs()[id]!.getContainer();

        it('should hide a token the players do not see, with its nameplate and bars', async () => {
          tokenRenderer.setPlayerSightProvider(() => (id) => (id !== 'token-1' ? 'seen' : 'unseen'));
          store.getState().addToken(token({ id: 'token-1', kind: 'character', statblockPath: 'Goblin.md', name: 'Goblin', showNameplate: true }));
          store.getState().addToken(token({ id: 'token-2', x: 300, kind: 'character', statblockPath: 'Goblin.md', name: 'Orc', showNameplate: true }));
          await waitForTokens('token-1', 'token-2');

          expect(tokenGroup('token-1').visible).toBe(false);
          expect(tokenUi('token-1').visible).toBe(false);
          expect(tokenGroup('token-2').visible).toBe(true);
          expect(tokenUi('token-2').visible).toBe(true);
          expect(tokenRenderer.hitTestTokens(100, 100)).toBeNull();
        });

        it('should show the token once the players see it, and hide it again when they lose it', async () => {
          let seen = false;
          tokenRenderer.setPlayerSightProvider(() => () => (seen ? 'seen' : 'unseen'));
          store.getState().addToken(token({ id: 'token-1', kind: 'character', statblockPath: 'Goblin.md', name: 'Goblin', showNameplate: true }));
          await waitForTokens('token-1');
          expect(tokenGroup('token-1').visible).toBe(false);

          seen = true;
          tokenRenderer.refreshPlayerSight();
          expect(tokenGroup('token-1').visible).toBe(true);
          expect(tokenGroup('token-1').alpha).toBe(1);
          expect(tokenUi('token-1').visible).toBe(true);

          seen = false;
          tokenRenderer.refreshPlayerSight();
          expect(tokenGroup('token-1').visible).toBe(false);
          expect(tokenUi('token-1').visible).toBe(false);
        });

        it('should keep the nameplate and bars of an unseen token hidden when the token changes', async () => {
          tokenRenderer.setPlayerSightProvider(() => (id) => (id !== 'token-1' ? 'seen' : 'unseen'));
          store.getState().addToken(token({ id: 'token-1', kind: 'character', statblockPath: 'Goblin.md', name: 'Goblin', showNameplate: true }));
          await waitForTokens('token-1');
          expect(tokenUi('token-1').visible).toBe(false);

          store.getState().updateToken('token-1', { name: 'Goblin boss', conditions: ['prone'] });
          await new Promise((resolve) => setTimeout(resolve, 20));

          expect(tokenGroup('token-1').visible).toBe(false);
          expect(tokenUi('token-1').visible).toBe(false);
        });

        it('should show a seen token\'s nameplate again after it changed while unseen', async () => {
          let seen = false;
          tokenRenderer.setPlayerSightProvider(() => () => (seen ? 'seen' : 'unseen'));
          store.getState().addToken(token({ id: 'token-1', kind: 'character', statblockPath: 'Goblin.md', name: 'Goblin', showNameplate: true }));
          await waitForTokens('token-1');
          store.getState().updateToken('token-1', { name: 'Goblin boss' });
          await new Promise((resolve) => setTimeout(resolve, 20));

          seen = true;
          tokenRenderer.refreshPlayerSight();
          expect(tokenUi('token-1').visible).toBe(true);
        });

        it('should drop a token from the selection when the players lose sight of it', async () => {
          let seen = true;
          tokenRenderer.setPlayerSightProvider(() => () => (seen ? 'seen' : 'unseen'));
          store.getState().addToken(token({ id: 'token-1' }));
          store.getState().addToken(token({ id: 'token-2', x: 300, isHidden: false }));
          await waitForTokens('token-1', 'token-2');
          store.getState().setSelection(['token-1', 'token-2']);

          seen = false;
          tokenRenderer.setPlayerSightProvider(() => (id) => (id === 'token-2' ? 'seen' : 'unseen'));
          tokenRenderer.refreshPlayerSight();

          expect(store.getState().selectedIds).toEqual(['token-2']);
        });

        it('should offer only the tokens the canvas shows for selecting all', async () => {
          tokenRenderer.setPlayerSightProvider(() => (id) => (id === 'token-2' ? 'seen' : 'unseen'));
          store.getState().addToken(token({ id: 'token-1' }));
          store.getState().addToken(token({ id: 'token-2', x: 300 }));
          await waitForTokens('token-1', 'token-2');

          expect(tokenRenderer.visibleTokenIds()).toEqual(['token-2']);
        });

        it('should keep a token that is being dragged visible until it is released, then follow sight', async () => {
          let seen = true;
          tokenRenderer.setPlayerSightProvider(() => () => (seen ? 'seen' : 'unseen'));
          store.getState().addToken(token({ id: 'token-1', x: 105, y: 105 }));
          await waitForTokens('token-1');

          viewport.emit('pointerdown', pointerEvent(105, 105));
          viewport.emit('pointermove', pointerEvent(180, 105));
          seen = false;
          tokenRenderer.refreshPlayerSight();
          expect(tokenGroup('token-1').visible).toBe(true);
          expect(store.getState().selectedIds).toEqual(['token-1']);

          viewport.emit('pointerup', pointerEvent(180, 105));
          expect(tokenGroup('token-1').visible).toBe(false);
          expect(store.getState().selectedIds).toEqual([]);
        });

        it('should give a picture of the scene the GM\'s tokens in session view, and be in session view afterwards', async () => {
          tokenRenderer.setPlayerSightProvider(() => (id) => (id !== 'token-1' ? 'seen' : 'unseen'));
          store.getState().setGMView(false);
          store.getState().addToken(token({ id: 'token-1', kind: 'character', statblockPath: 'Goblin.md', name: 'Goblin', showNameplate: true }));
          store.getState().addToken(token({ id: 'token-2', x: 300, isHidden: true }));
          store.getState().addToken(token({ id: 'token-3', x: 500, kind: 'character', statblockPath: 'Goblin.md' }));
          await waitForTokens('token-1', 'token-2', 'token-3');
          const look = (): unknown => ({
            unseen: { visible: tokenGroup('token-1').visible, alpha: tokenGroup('token-1').alpha, ui: tokenUi('token-1').visible },
            hidden: { visible: tokenGroup('token-2').visible, alpha: tokenGroup('token-2').alpha },
            seen: { visible: tokenGroup('token-3').visible, ui: tokenUi('token-3').visible },
          });
          const onCanvas = look();
          expect(onCanvas).toEqual({ unseen: { visible: false, alpha: 1, ui: false }, hidden: { visible: false, alpha: 1 }, seen: { visible: true, ui: false } });

          const picture = captureSceneFrame({ gmViewLayers: tokenRenderer.getGmViewLayers(), markerLayers: [], lighting: undefined }, { x: 0, y: 0, resolution: 1 }, look);

          // The GM's picture: every token, the hidden one translucent, and only the token UI that has something to show.
          expect(picture).toEqual({ unseen: { visible: true, alpha: 1, ui: true }, hidden: { visible: true, alpha: 0.5 }, seen: { visible: true, ui: false } });
          expect(look()).toEqual(onCanvas);
          expect(tokenRenderer.visibleTokenIds()).toEqual(['token-3']);
        });

        describe('a token the players only sense', () => {
          const outlineLayer = (): Container => tokenRenderer.getSensedOutlineLayer() as Container;
          const heldOutlines = (): Container => outlineLayer().getChildByLabel('sensedOutlinesHeld')!;
          /** The layer with the outlines on it, without the group of the held ones. */
          const outlines = (): { children: Container[]; visible: boolean; zIndex: number } => {
            const layer = outlineLayer();
            return { children: layer.children.filter((child) => child !== heldOutlines()) as Container[], visible: layer.visible, zIndex: layer.zIndex };
          };
          const sensedSetup = async (): Promise<void> => {
            tokenRenderer.setPlayerSightProvider(() => (id) => (id === 'token-1' ? 'sensed' : id === 'token-2' ? 'unseen' : 'seen'));
            store.getState().addToken(token({ id: 'token-1', kind: 'character', statblockPath: 'Goblin.md', name: 'Goblin', showNameplate: true }));
            store.getState().addToken(token({ id: 'token-2', x: 300 }));
            store.getState().addToken(token({ id: 'token-3', x: 500 }));
            await waitForTokens('token-1', 'token-2', 'token-3');
            tokenRenderer.refreshPlayerSight();
          };

          it('should show as an outline of its footprint, without art, nameplate or bars, and take no pointer', async () => {
            await sensedSetup();
            expect(tokenGroup('token-1').visible).toBe(false);
            expect(tokenUi('token-1').visible).toBe(false);
            expect(outlines().children).toHaveLength(1);
            expect(outlines().children[0]!.position).toMatchObject({ x: tokenGroup('token-1').x, y: tokenGroup('token-1').y });
            expect(tokenRenderer.hitTestTokens(100, 100)).toBeNull();
            expect(tokenRenderer.visibleTokenIds()).toEqual(['token-3']);
          });

          it('should keep its outline layer off until the players\' view switches it on', async () => {
            await sensedSetup();
            expect(outlines().visible).toBe(false);
            expect(outlines().zIndex).toBeGreaterThan(90);
            expect(outlines().zIndex).toBeLessThan(100);
          });

          it('should follow the players\' sight: seen it shows itself, unseen nothing', async () => {
            let perceived: 'seen' | 'sensed' | 'unseen' = 'sensed';
            tokenRenderer.setPlayerSightProvider(() => () => perceived);
            store.getState().addToken(token({ id: 'token-1' }));
            await waitForTokens('token-1');
            tokenRenderer.refreshPlayerSight();
            expect(outlines().children).toHaveLength(1);

            perceived = 'seen';
            tokenRenderer.refreshPlayerSight();
            expect(tokenGroup('token-1').visible).toBe(true);
            expect(outlines().children).toHaveLength(0);

            perceived = 'unseen';
            tokenRenderer.refreshPlayerSight();
            expect(tokenGroup('token-1').visible).toBe(false);
            expect(outlines().children).toHaveLength(0);
          });

          it('should never outline a hidden token', async () => {
            tokenRenderer.setPlayerSightProvider(() => () => 'sensed');
            store.getState().addToken(token({ id: 'token-1', isHidden: true }));
            await waitForTokens('token-1');
            tokenRenderer.refreshPlayerSight();
            expect(outlines().children).toHaveLength(0);
          });

          it('should draw no outline once the canvas shows the GM\'s view again', async () => {
            await sensedSetup();
            tokenRenderer.setPlayerSightProvider(() => undefined);
            tokenRenderer.refreshPlayerSight();
            expect(outlines().children).toHaveLength(0);
            expect(tokenGroup('token-1').visible).toBe(true);
          });

          it('should outline it for the players\' frame and hide its art, nameplate and bars there', async () => {
            tokenRenderer.setPlayerSightProvider(() => undefined);
            store.getState().addToken(token({ id: 'token-1', kind: 'character', statblockPath: 'Goblin.md', name: 'Goblin', showNameplate: true }));
            store.getState().addToken(token({ id: 'token-2', x: 300 }));
            await waitForTokens('token-1', 'token-2');
            const layers = tokenRenderer.getPlayerViewLayers(
              { showTokenNameplates: true } as Parameters<typeof tokenRenderer.getPlayerViewLayers>[0],
              (id) => (id === 'token-1' ? 'sensed' : 'seen'),
            );
            expect(layers).toContainEqual({ layer: tokenGroup('token-1'), visible: false });
            expect(layers).not.toContainEqual({ layer: tokenGroup('token-2'), visible: false });
            expect(outlines().children).toHaveLength(1);
            const playerUi = (tokenRenderer as unknown as { uiManager: { playerTokenUIs: Record<string, { getContainer(): Container }> } }).uiManager.playerTokenUIs;
            expect(playerUi['token-1']!.getContainer().renderable).toBe(false);
          });

          it('should keep the outline of a sensed token the pointer holds for the players\' frame: the canvas shows the token under the pointer', async () => {
            // The GM drags in GM view while the player window mirrors the canvas.
            tokenRenderer.setPlayerSightProvider(() => undefined);
            store.getState().addToken(token({ id: 'token-1' }));
            await waitForTokens('token-1');
            viewport.emit('pointerdown', pointerEvent(100, 100));
            const layers = tokenRenderer.getPlayerViewLayers(
              { showTokenNameplates: true } as Parameters<typeof tokenRenderer.getPlayerViewLayers>[0],
              () => 'sensed',
            );
            expect(tokenGroup('token-1').visible).toBe(true);
            expect(outlines().children).toHaveLength(0);
            expect(heldOutlines().children).toHaveLength(1);
            expect(heldOutlines().visible).toBe(false);
            expect(layers).toContainEqual({ layer: heldOutlines(), visible: true });
            expect(layers).toContainEqual({ layer: tokenGroup('token-1'), visible: false });
            viewport.emit('pointerup', pointerEvent(100, 100));
            tokenRenderer.getPlayerViewLayers({ showTokenNameplates: true } as Parameters<typeof tokenRenderer.getPlayerViewLayers>[0], () => 'sensed');
            expect(heldOutlines().children).toHaveLength(0);
            expect(outlines().children).toHaveLength(1);
          });

          it('should leave it out of a picture of the scene, which shows the token itself', async () => {
            await sensedSetup();
            outlineLayer().visible = true;
            const picture = captureSceneFrame({ gmViewLayers: tokenRenderer.getGmViewLayers(), markerLayers: [], lighting: undefined }, { x: 0, y: 0, resolution: 1 }, () => ({
              outlines: outlineLayer().visible, token: tokenGroup('token-1').visible,
            }));
            expect(picture).toEqual({ outlines: false, token: true });
            expect(outlineLayer().visible).toBe(true);
            expect(tokenGroup('token-1').visible).toBe(false);
          });
        });

        it('should hide nothing by sight while the canvas shows the GM\'s view', async () => {
          tokenRenderer.setPlayerSightProvider(() => undefined);
          store.getState().addToken(token({ id: 'token-1', isHidden: true }));
          await waitForTokens('token-1');

          expect(tokenGroup('token-1').visible).toBe(true);
          expect(tokenGroup('token-1').alpha).toBe(0.5);
        });
      });
    });
  });

  // Measurements and other marks follow the tokens the players see: in their frame, and on the canvas while it shows their view.
  describe('What the players see of the tokens', () => {
    const paint = fogRectangle({ x: 150, y: 0, width: 100, height: 400 });
    const wireFog = (): void => tokenRenderer.setFogCoverageProvider(() => fogCoverage(store.getState().objects.fog));
    const setFog = (): void => store.setState((state) => ({ objects: { ...state.objects, fog: { paint } } }));

    it('answers for a players\' frame by its sight and committed fog, never for a hidden or missing token', async () => {
      wireFog();
      setFog();
      store.getState().addToken(token({ id: 'seen' }));
      store.getState().addToken(token({ id: 'hidden', x: 300, isHidden: true }));
      store.getState().addToken(token({ id: 'covered', x: 200 }));
      store.getState().addToken(token({ id: 'dark', x: 400 }));
      await waitForTokens('seen', 'hidden', 'covered', 'dark');
      const seen = tokenRenderer.playersSeeInFrame((id) => (id === 'dark' ? 'unseen' : 'seen'));
      expect(['seen', 'hidden', 'covered', 'dark', 'missing'].map(seen)).toEqual([true, false, false, false, false]);
      expect(['seen', 'dark'].map(tokenRenderer.playersSeeInFrame())).toEqual([true, true]);
    });

    it('answers for the canvas only while it shows the players\' view: session view or the peek', async () => {
      let peeking = false;
      tokenRenderer.setPlayerSightProvider(() => (peeking ? () => 'unseen' : undefined), () => peeking);
      store.getState().addToken(token({ id: 'goblin' }));
      await waitForTokens('goblin');
      expect(tokenRenderer.playersSeeOnCanvas()).toBeNull();
      store.getState().setGMView(false);
      expect(tokenRenderer.playersSeeOnCanvas()?.('goblin')).toBe(true);
      store.getState().setGMView(true);
      peeking = true;
      tokenRenderer.refreshPlayerSight();
      expect(tokenRenderer.playersSeeOnCanvas()?.('goblin')).toBe(false);
    });

    it('tells its listeners after every pass over the players\' sight and every change of the tokens', async () => {
      const listener = vi.fn();
      const stop = tokenRenderer.onPlayersViewChange(listener);
      store.getState().addToken(token({ id: 'goblin' }));
      await waitForTokens('goblin');
      listener.mockClear();
      store.getState().setGMView(false);
      expect(listener).toHaveBeenCalled();
      listener.mockClear();
      store.getState().updateToken('goblin', { isHidden: true });
      expect(listener).toHaveBeenCalled();
      listener.mockClear();
      store.getState().deleteToken('goblin');
      expect(listener).toHaveBeenCalled();
      stop();
      listener.mockClear();
      store.getState().setGMView(true);
      expect(listener).not.toHaveBeenCalled();
    });

    it('tells them of a drag in session view only when the dragged token enters or leaves the players\' sight', async () => {
      wireFog();
      setFog();
      store.getState().setGMView(false);
      store.getState().addToken(token({ id: 'moving', x: 105, y: 105 }));
      await waitForTokens('moving');
      const listener = vi.fn();
      tokenRenderer.onPlayersViewChange(listener);
      // One write of the live positions to the store, at the drag's first step.
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      viewport.emit('pointerdown', pointerEvent(105, 105));
      viewport.emit('pointermove', pointerEvent(120, 105));
      const calls: number[] = [];
      for (const x of [130, 140, 180, 200, 220, 320, 330]) {
        listener.mockClear();
        viewport.emit('pointermove', pointerEvent(x, 105));
        calls.push(listener.mock.calls.length);
      }
      expect(calls).toEqual([0, 0, 1, 0, 0, 1, 0]);
      viewport.emit('pointerup', pointerEvent(330, 105));
      vi.mocked(Date.now).mockRestore();
    });

    it('in the GM view, a drag asks nothing of the players\' sight or fog', async () => {
      const coverage = vi.fn(() => fogCoverage(store.getState().objects.fog));
      tokenRenderer.setFogCoverageProvider(coverage);
      setFog();
      tokenRenderer.setPlayerSightProvider(() => undefined, () => false);
      store.getState().addToken(token({ id: 'moving', x: 105, y: 105 }));
      await waitForTokens('moving');
      const listener = vi.fn();
      tokenRenderer.onPlayersViewChange(listener);
      viewport.emit('pointerdown', pointerEvent(105, 105));
      coverage.mockClear();
      listener.mockClear();
      for (const x of [120, 180, 320]) viewport.emit('pointermove', pointerEvent(x, 105));
      expect(coverage).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      viewport.emit('pointerup', pointerEvent(320, 105));
    });
  });

  describe('Measurements in the players\' picture', () => {
    let measure: MeasureRenderer;
    let unwire: () => void;
    let perception: ((id: string) => 'seen' | 'unseen') | undefined;
    let peeking: boolean;

    beforeEach(() => {
      perception = undefined;
      peeking = false;
      const active = (): boolean => peeking || !store.getState().isGMView;
      tokenRenderer.setPlayerSightProvider(() => (active() ? perception : undefined), active);
      tokenRenderer.setFogCoverageProvider(() => fogCoverage(store.getState().objects.fog));
      measure = new MeasureRenderer(viewport, eventBus, store, gridSystem);
      unwire = wirePlayerMeasurements({ measure, tokens: tokenRenderer, store, grid: gridSystem, lighting: () => perception });
    });

    afterEach(() => {
      unwire();
      measure.destroy();
    });

    /** The measurement parts' `visible` on the canvas, the live ruler first. */
    const onCanvas = (): boolean[] => measure.getGmViewLayers().map(({ layer }) => layer.visible);
    /** What a players' frame shows of them. */
    const inFrame = (): boolean[] => measure.getPlayerViewLayers(tokenRenderer.playersSeeInFrame(perception)).map(({ visible }) => visible);
    const keepRuler = (x: number): void => {
      eventBus.emit('measure-persistence-changed', true);
      store.getState().setActiveTool('measure');
      viewport.emit('pointerdown', pointerEvent(x, 105));
      viewport.emit('pointermove', pointerEvent(x, 400));
      viewport.emit('pointerup', pointerEvent(x, 400));
    };

    it('leaves a ruler from a hidden token out of the frame and session view, and keeps it in a picture of the scene', async () => {
      store.getState().addToken(token({ id: 'goblin', x: 105, y: 105, isHidden: true }));
      await waitForTokens('goblin');
      store.getState().setActiveTool('measure');
      viewport.emit('pointerdown', pointerEvent(105, 105));
      viewport.emit('pointermove', pointerEvent(105, 400));
      expect(onCanvas()).toEqual([true, true, true]);
      expect(inFrame()).toEqual([false, false, false]);
      store.getState().setGMView(false);
      expect(onCanvas()).toEqual([false, false, false]);
      const picture = captureSceneFrame({ gmViewLayers: [...tokenRenderer.getGmViewLayers(), ...measure.getGmViewLayers()], markerLayers: [], lighting: undefined },
        {} as never, () => onCanvas());
      expect(picture).toEqual([true, true, true]);
      expect(onCanvas()).toEqual([false, false, false]);
      store.getState().setGMView(true);
      expect(onCanvas()).toEqual([true, true, true]);
    });

    it('hides a kept ruler during the peek while its token is out of the players\' sight', async () => {
      store.getState().addToken(token({ id: 'goblin', x: 105, y: 105 }));
      await waitForTokens('goblin');
      keepRuler(105);
      perception = () => 'unseen';
      expect(onCanvas()).toEqual([true, false, false, true, true, true]);
      peeking = true;
      tokenRenderer.refreshPlayerSight();
      expect(onCanvas()).toEqual([true, false, false, false, false, false]);
      perception = () => 'seen';
      tokenRenderer.refreshPlayerSight();
      expect(onCanvas()).toEqual([true, false, false, true, true, true]);
      peeking = false;
      tokenRenderer.refreshPlayerSight();
    });

    it('hides a kept ruler in session view once its token is deleted, or the map reloads without it', async () => {
      store.getState().addToken(token({ id: 'goblin', x: 105, y: 105 }));
      store.getState().addToken(token({ id: 'orc', x: 315, y: 105 }));
      await waitForTokens('goblin', 'orc');
      keepRuler(105);
      keepRuler(315);
      store.getState().setGMView(false);
      expect(onCanvas()).toEqual([true, false, false, true, true, true, true, true, true]);
      store.getState().deleteToken('goblin');
      expect(onCanvas()).toEqual([true, false, false, false, false, false, true, true, true]);
      store.setState((state) => ({ mapPath: 'maps/other.atlasmap', objects: { ...state.objects, tokens: {} } }));
      eventBus.emit('map-loaded');
      expect(onCanvas()).toEqual([true, false, false, false, false, false, false, false, false]);
      expect(inFrame()).toEqual([true, false, false, false, false, false, false, false, false]);
      store.getState().setGMView(true);
      expect(onCanvas()).toEqual([true, false, false, true, true, true, true, true, true]);
    });
  });

  describe('Instance badges in the players\' picture', () => {
    let perception: ((id: string) => 'seen' | 'sensed' | 'unseen') | undefined;

    beforeEach(() => {
      perception = undefined;
      const active = (): boolean => !store.getState().isGMView;
      tokenRenderer.setPlayerSightProvider(() => (active() ? perception : undefined), active);
      tokenRenderer.setFogCoverageProvider(() => fogCoverage(store.getState().objects.fog));
    });

    /** What a token's badge shows on the canvas now: nothing, the GM's number or the players'. */
    const badgeLook = (id: string): string => {
      const group = tokenRenderer.getTokenSprites()[id];
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
    const looks = (...ids: string[]): string[] => ids.map(badgeLook);
    /** The same in a players' frame, composed as the player window's capture composes it. */
    const frameLooks = (...ids: string[]): string[] => {
      let result: string[] = [];
      captureWithLayerVisibility(tokenRenderer.getPlayerViewLayers(DEFAULT_SETTINGS.localPlayerView, perception), () => {}, () => { result = looks(...ids); });
      return result;
    };
    /** The same in a picture of the scene, always the GM's. */
    const pictureLooks = (...ids: string[]): string[] =>
      captureSceneFrame({ gmViewLayers: tokenRenderer.getGmViewLayers(), markerLayers: [], lighting: undefined }, {} as never, () => looks(...ids));
    const goblins = async (...tokens: Array<Partial<TokenInput> & { id: string }>): Promise<void> => {
      for (const [index, entry] of tokens.entries()) store.getState().addToken(token({ x: 105 + 140 * index, y: 105, ...entry }));
      await waitForTokens(...tokens.map(({ id }) => id));
    };
    const hide = (id: string, isHidden: boolean): void => store.getState().updateToken(id, { isHidden });
    /** A goblin as a loaded map file holds it. */
    const saved = (id: string, x: number, instanceNumber: number): TokenEntity => ({ ...token({ id, x }), id, kind: 'token', instanceNumber });
    /** Checks the canvas once the change reached it, and then the players' frame. */
    const expectLooks = async (ids: string[], expected: string[]): Promise<void> => {
      await vi.waitFor(() => expect(looks(...ids)).toEqual(expected));
      expect(frameLooks(...ids)).toEqual(expected);
    };

    it('takes the badges off a token whose look-alike is hidden in session view, and gives both back once it is revealed', async () => {
      await goblins({ id: 'A' }, { id: 'B' });
      store.getState().setGMView(false);
      await expectLooks(['A', 'B'], ['gm 1', 'gm 2']);
      hide('B', true);
      await expectLooks(['A', 'B'], ['none', 'none']);
      hide('B', false);
      await expectLooks(['A', 'B'], ['gm 1', 'gm 2']);
      store.getState().setGMView(true);
      expect(looks('A', 'B')).toEqual(['gm 1', 'gm 2']);
    });

    it('numbers a revealed token by the tokens the players see, with its disc, and keeps the GM\'s pictures as they were', async () => {
      await goblins({ id: 'A' }, { id: 'B' }, { id: 'C' });
      store.getState().setGMView(false);
      hide('A', true);
      hide('B', true);
      await expectLooks(['A', 'B', 'C'], ['none', 'none', 'none']);
      hide('B', false);
      await expectLooks(['A', 'B', 'C'], ['none', 'players 1', 'gm 3']);
      // A picture of the scene taken in session view is the GM's.
      expect(pictureLooks('A', 'B', 'C')).toEqual(['gm 1', 'gm 2', 'gm 3']);
      expect(looks('A', 'B', 'C')).toEqual(['none', 'players 1', 'gm 3']);
      store.getState().setGMView(true);
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'gm 2', 'gm 3']);
      // The player window, while the GM view shows the GM's numbers.
      expect(frameLooks('A', 'B', 'C')).toEqual(['none', 'players 1', 'gm 3']);
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'gm 2', 'gm 3']);
    });

    it('lets a token that showed the players\' number go back to the GM\'s once the numbers agree again', async () => {
      await goblins({ id: 'A' }, { id: 'B', isHidden: true }, { id: 'C' });
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
      hide('C', true);
      await expectLooks(['A', 'B', 'C'], ['none', 'none', 'none']);
      hide('B', false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'gm 2', 'none']);
      hide('C', false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'gm 2', 'gm 3']);
    });

    it('gives a token added in session view the players\' number as soon as its sprite has loaded', async () => {
      await goblins({ id: 'A' }, { id: 'B', isHidden: true });
      store.getState().setGMView(false);
      await expectLooks(['A', 'B'], ['none', 'none']);
      // The sync that adds C passes over the badges before C's sprite exists.
      store.getState().addToken(token({ id: 'C', x: 385, y: 105 }));
      await waitForTokens('C');
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'none', 'players 2']);
      expect(frameLooks('A', 'B', 'C')).toEqual(['gm 1', 'none', 'players 2']);
    });

    it('leaves a token without a badge while its look-alike is only sensed, or under fog', async () => {
      await goblins({ id: 'A' }, { id: 'B' });
      store.getState().setGMView(false);
      perception = (id) => (id === 'B' ? 'sensed' : 'seen');
      tokenRenderer.refreshPlayerSight();
      await expectLooks(['A', 'B'], ['none', 'none']);
      perception = undefined;
      tokenRenderer.refreshPlayerSight();
      await expectLooks(['A', 'B'], ['gm 1', 'gm 2']);
      store.setState((state) => ({ objects: { ...state.objects, fog: { paint: fogRectangle({ x: 200, y: 50, width: 100, height: 100 }) } } }));
      await expectLooks(['A', 'B'], ['none', 'none']);
    });

    it('puts a token whose art changed last among the players\' tokens of its new art', async () => {
      await goblins({ id: 'g1' }, { id: 'g2' }, { id: 'o1', imagePath: ORC_IMAGE }, { id: 'o2', imagePath: ORC_IMAGE });
      store.getState().setGMView(false);
      await expectLooks(['g1', 'g2', 'o1', 'o2'], ['gm 1', 'gm 2', 'gm 1', 'gm 2']);
      store.getState().updateToken('g2', { imagePath: ORC_IMAGE });
      await expectLooks(['g1', 'g2', 'o1', 'o2'], ['none', 'players 3', 'gm 1', 'gm 2']);
      store.getState().setGMView(true);
      expect(looks('g1', 'g2', 'o1', 'o2')).toEqual(['none', 'gm 2', 'gm 1', 'gm 2']);
    });

    it('frames a change the canvas has not drawn yet with the badges it brings, also where the canvas holds one off', async () => {
      await goblins({ id: 'A' }, { id: 'B', isHidden: true }, { id: 'O', imagePath: ORC_IMAGE });
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'O'], ['none', 'none', 'none']);
      // The orc takes the goblin art; the canvas passes over the badges once that art has loaded.
      store.getState().updateToken('O', { imagePath: GOBLIN_IMAGE });
      expect(tokenSprite('O').texture.label).toBe(ORC_IMAGE);
      expect(looks('A')).toEqual(['none']);
      expect(frameLooks('A', 'O')).toEqual(['gm 1', 'none']);
      expect(looks('A')).toEqual(['none']);
      await expectLooks(['A', 'O'], ['gm 1', 'players 2']);
    });

    it('numbers the player window by its own sight while the command palette\'s player mode leaves the lighting off the canvas', async () => {
      await goblins({ id: 'A' }, { id: 'B' }, { id: 'C' });
      // B stands in the dark: the players' sight leaves it out, but the palette's player mode applies no lighting on the canvas.
      perception = (id) => (id === 'B' ? 'unseen' : 'seen');
      eventBus.emit('player-mode-changed', true);
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'gm 2', 'gm 3']);
      expect(frameLooks('A', 'B', 'C')).toEqual(['gm 1', 'none', 'players 2']);
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'gm 2', 'gm 3']);
      // Session view brings the players' lighting to the canvas, and with it the window's numbers.
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
      store.getState().setGMView(true);
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'gm 2', 'gm 3']);
      expect(frameLooks('A', 'B', 'C')).toEqual(['gm 1', 'none', 'players 2']);
    });

    it('holds the window\'s numbers on the canvas in the command palette\'s player mode where no lighting is wired', async () => {
      tokenRenderer.clearLighting();
      await goblins({ id: 'A' }, { id: 'B', isHidden: true }, { id: 'C' });
      eventBus.emit('player-mode-changed', true);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
      eventBus.emit('player-mode-changed', false);
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'gm 2', 'gm 3']);
    });

    it('numbers a loaded scene by its own sight, not by the sight the lighting keeps from the scene before while it loads', async () => {
      await goblins({ id: 'A' }, { id: 'B' }, { id: 'C' });
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'gm 2', 'gm 3']);
      // Another scene loads in this view. Until the load ends the lighting answers with the sight of the
      // scene before, which saw all three places.
      store.getState().setMapLoading(true);
      store.setState((state) => ({ mapPath: 'maps/other.atlasmap', objects: { ...state.objects, tokens: {
        A: saved('A', 105, 1),
        B: saved('B', 245, 2),
        C: saved('C', 385, 3),
      } } }));
      eventBus.emit('map-loaded');
      await waitForTokens('A', 'B', 'C');
      // The load ends: the loaded scene's sight leaves B in the dark.
      perception = (id) => (id === 'B' ? 'unseen' : 'seen');
      store.getState().setMapLoading(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
    });

    it('keeps the players\' badges on the canvas when a load starts, for the still frame that covers the switch', async () => {
      await goblins({ id: 'A' }, { id: 'B', isHidden: true }, { id: 'C' });
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
      store.getState().setMapLoading(true);
      expect(looks('A', 'B', 'C')).toEqual(['gm 1', 'none', 'players 2']);
    });

    let stopLighting: (() => void) | null = null;
    afterEach(() => {
      stopLighting?.();
      stopLighting = null;
    });

    /**
     * A lighting that keeps sight of its own, as the view's lighting does: worked out by a store listener that
     * comes after the token renderer's (dynamic lighting switched on in an open view), from the party's token P,
     * which sees every token within 150 px. A load keeps the sight of the scene before until it ends; while
     * `blocked` (a lost graphics context) nothing is built, and the sight it keeps is no longer the scene's from
     * the first change it cannot take in. New sight is reported as `onSightChange` reports it.
     */
    const keptSight = (): { blocked: boolean; rebuild: () => void } => {
      let eye: number | null = null;
      let built = false;
      const lighting = {
        blocked: false,
        rebuild: (): void => {
          const state = store.getState();
          if (state.isMapLoading || lighting.blocked) {
            built = false;
            return;
          }
          const party = state.objects.tokens.P?.x ?? null;
          if (built && party === eye) return;
          eye = party;
          built = true;
          tokenRenderer.refreshPlayerSight();
        },
      };
      lighting.rebuild();
      stopLighting = store.subscribe(() => lighting.rebuild());
      perception = (id) => {
        const x = store.getState().objects.tokens[id]?.x;
        return x !== undefined && eye !== null && Math.abs(x - eye) <= 150 ? 'seen' : 'unseen';
      };
      const active = (): boolean => !store.getState().isGMView;
      tokenRenderer.setPlayerSightProvider(() => (active() ? perception : undefined), active, () => built);
      return lighting;
    };
    /** The party P with goblins A, B and C, which P sees from x 245; on the loaded scene P stands at C and leaves B in the dark. */
    const partyScene = async (): Promise<void> => {
      await goblins({ id: 'P', imagePath: ORC_IMAGE, x: 245 }, { id: 'A', x: 315 }, { id: 'B', x: 105 }, { id: 'C', x: 385 });
    };
    /** Another scene loads into this view, as `MapService` loads it: the party moved to C. */
    const loadPartyScene = async (): Promise<void> => {
      store.getState().setMapLoading(true);
      store.setState((state) => ({ mapPath: 'maps/other.atlasmap', objects: { ...state.objects, tokens: {
        P: { ...saved('P', 385, 1), imagePath: ORC_IMAGE },
        A: saved('A', 315, 1),
        B: saved('B', 105, 2),
        C: saved('C', 385, 3),
      } } }));
      eventBus.emit('map-loaded');
      await waitForTokens('P', 'A', 'B', 'C');
      store.getState().setMapLoading(false);
    };

    it('numbers a loaded scene by its sight once the lighting has built it, also where the lighting hears of the load\'s end last', async () => {
      await partyScene();
      keptSight();
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'gm 2', 'gm 3']);
      await loadPartyScene();
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
    });

    it('shows the players no badges while the lighting has no sight for the loaded scene, and numbers from the first it has', async () => {
      await partyScene();
      const lighting = keptSight();
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'gm 2', 'gm 3']);
      lighting.blocked = true;
      await loadPartyScene();
      await expectLooks(['A', 'B', 'C'], ['none', 'none', 'none']);
      // The context is back: the lighting builds the loaded scene.
      lighting.blocked = false;
      lighting.rebuild();
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
    });

    it('shows the players no badges while a lost graphics context keeps the lighting from the scene\'s changes, and numbers anew once it is back', async () => {
      await goblins({ id: 'P', imagePath: ORC_IMAGE, x: 105 }, { id: 'A', x: 175 }, { id: 'C', x: 525 });
      const lighting = keptSight();
      store.getState().setGMView(false);
      await expectLooks(['A', 'C'], ['none', 'none']);
      // The context is lost. The party walks on, a goblin is put where it stood and another is brought along. By
      // the sight from before the loss B would take 2 and C 3, and C would keep its 3 beside A once B is out of sight.
      lighting.blocked = true;
      store.getState().moveToken('P', 245, 105);
      store.getState().addToken(token({ id: 'B', x: 35, y: 105 }));
      await waitForTokens('B');
      store.getState().moveToken('C', 210, 105);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await expectLooks(['A', 'B', 'C'], ['none', 'none', 'none']);
      lighting.blocked = false;
      lighting.rebuild();
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'gm 2']);
    });

    it('numbers by the lighting\'s sight once it has taken in a drop that moves the party and a look-alike together', async () => {
      await goblins({ id: 'P', imagePath: ORC_IMAGE, x: 105 }, { id: 'A', x: 175 }, { id: 'B', x: 35 }, { id: 'C', x: 525 });
      keptSight();
      store.getState().setGMView(false);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'gm 2', 'none']);
      // One drop takes the party away from B and brings C along; the token renderer hears of it before the lighting.
      store.getState().dropTokens([{ id: 'P', x: 245, y: 105 }, { id: 'C', x: 210, y: 105 }]);
      await expectLooks(['A', 'B', 'C'], ['gm 1', 'none', 'players 2']);
    });

    it('numbers anew when the same map loads again with other tokens', async () => {
      await goblins({ id: 'A' }, { id: 'B' });
      store.getState().setGMView(false);
      await expectLooks(['A', 'B'], ['gm 1', 'gm 2']);
      // B held 2 before the load; on the loaded map it is the first of its art.
      store.setState((state) => ({ objects: { ...state.objects, tokens: {
        B: saved('B', 245, 1),
        C: saved('C', 385, 2),
      } } }));
      eventBus.emit('map-loaded');
      await waitForTokens('B', 'C');
      await expectLooks(['B', 'C'], ['gm 1', 'gm 2']);
    });

    it('numbers each map on its own when the view goes to another map and back', async () => {
      await goblins({ id: 'x' }, { id: 'y' });
      store.getState().setGMView(false);
      hide('x', true);
      await expectLooks(['y'], ['none']);
      const load = async (mapPath: string, tokens: Record<string, TokenEntity>): Promise<void> => {
        store.setState((state) => ({ mapPath, objects: { ...state.objects, tokens } }));
        eventBus.emit('map-loaded');
        await waitForTokens(...Object.keys(tokens));
      };
      await load('maps/other.atlasmap', {
        y: saved('y', 105, 1),
        z: saved('z', 245, 2),
      });
      await expectLooks(['y', 'z'], ['gm 1', 'gm 2']);
      await load('maps/test.atlasmap', {
        x: saved('x', 105, 1),
        y: saved('y', 245, 2),
      });
      await expectLooks(['x', 'y'], ['gm 1', 'gm 2']);
    });

    type BadgePasses = { pass(seen: (id: string) => boolean): void; syncCanvas(seen: ((id: string) => boolean) | null): void };
    const playerBadges = (): BadgePasses => (tokenRenderer as unknown as { playerBadges: BadgePasses }).playerBadges;

    it('does no players\' work in the GM view until a frame is captured', async () => {
      const pass = vi.spyOn(playerBadges(), 'pass');
      const sync = vi.spyOn(playerBadges(), 'syncCanvas');
      await goblins({ id: 'A' }, { id: 'B' });
      hide('B', true);
      store.getState().moveToken('A', 175, 105);
      const settings = store.getState().tokenSettings;
      store.getState().setTokenSettings({ ...settings, showInstanceBadges: false });
      store.getState().setTokenSettings({ ...settings, showInstanceBadges: true });
      viewport.emit('pointerdown', pointerEvent(175, 105));
      viewport.emit('pointermove', pointerEvent(300, 105));
      viewport.emit('pointerup', pointerEvent(300, 105));
      await vi.waitFor(() => expect(looks('A', 'B')).toEqual(['gm 1', 'gm 2']));
      expect(pass).not.toHaveBeenCalled();
      expect(sync).not.toHaveBeenCalled();
      expect(frameLooks('A', 'B')).toEqual(['none', 'none']);
      expect(pass).toHaveBeenCalledOnce();
    });

    it('in session view, follows a drag only when the dragged token enters or leaves the players\' sight', async () => {
      store.setState((state) => ({ objects: { ...state.objects, fog: { paint: fogRectangle({ x: 150, y: 0, width: 100, height: 400 }) } } }));
      store.getState().setGMView(false);
      await goblins({ id: 'moving' }, { id: 'twin', x: 105, y: 245 });
      await expectLooks(['moving', 'twin'], ['gm 1', 'gm 2']);
      const sync = vi.spyOn(playerBadges(), 'syncCanvas');
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      viewport.emit('pointerdown', pointerEvent(105, 105));
      viewport.emit('pointermove', pointerEvent(120, 105));
      const calls: number[] = [];
      const shown: string[][] = [];
      for (const x of [130, 140, 180, 200, 220, 320, 330]) {
        sync.mockClear();
        viewport.emit('pointermove', pointerEvent(x, 105));
        calls.push(sync.mock.calls.length);
        shown.push(looks('twin'));
      }
      expect(calls).toEqual([0, 0, 1, 0, 0, 1, 0]);
      expect(shown.flat()).toEqual(['gm 2', 'gm 2', 'none', 'none', 'none', 'gm 2', 'gm 2']);
      viewport.emit('pointerup', pointerEvent(330, 105));
      vi.mocked(Date.now).mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('should properly clean up when destroyed', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');
      const group = tokenGroup('token-1');
      const container = tokenRenderer.getTokenContainer();

      expect(viewport.listenerCount('pointerdown')).toBeGreaterThan(viewportPointerDownListeners);

      destroyRenderer();

      expect(group.destroyed).toBe(true);
      expect(container.destroyed).toBe(true);
      expect(viewport.listenerCount('pointerdown')).toBe(viewportPointerDownListeners);

      // A destroyed renderer must not react to the store any more.
      store.getState().addToken(token({ id: 'token-2' }));
      expect(tokenRenderer.getTokenSprites()).toEqual({});
    });
  });
});
