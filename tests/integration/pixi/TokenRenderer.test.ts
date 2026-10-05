import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Container,
  Point,
  Sprite,
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
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

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
