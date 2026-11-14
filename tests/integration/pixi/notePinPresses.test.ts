// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Point, Texture, type Application, type EventSystem, type FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { PinRenderer } from '../../../src/app/pixi/PinRenderer';
import { DrawingRenderer } from '../../../src/app/pixi/DrawingRenderer';
import { FogOfWarRenderer } from '../../../src/app/pixi/fog/FogOfWarRenderer';
import { AssetService } from '../../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: vi.fn(),
  closeContextMenuGlobal: vi.fn(),
}));

// jsdom has no 2D canvas, so glyphs cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({
  createLucideIconTexture: vi.fn(async () => new Texture()),
}));
vi.mock('../../../src/app/pixi/utils/pinIconTexture', () => ({
  createPinIconTexture: vi.fn(() => new Texture()),
}));

type ViewStore = ReturnType<typeof createViewAtlasStore>;

const GRID = 70;
const snap = (x: number, y: number): { x: number; y: number } => ({ x, y });
const gridSystem = {
  getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }),
  snapToCellCenter: snap,
  snapTokenCenter: snap,
} as unknown as GridSystem;

/**
 * The view as the app builds it: the pin renderer comes with the viewport, the token renderer,
 * whose press dispatch claims pins, tokens and badges, only once the first map brings a grid.
 */
describe('Presses with the note pin tool', () => {
  let viewport: Viewport;
  let store: ViewStore;
  let eventBus: EventEmitter;
  let pins: PinRenderer;
  let drawing: DrawingRenderer;
  let fog: FogOfWarRenderer;
  let tokens: TokenRenderer;
  let restoreGraphics: () => void;
  let placed: ReturnType<typeof vi.fn>;
  /** PIXI hands every press the same pooled event object. */
  let pooled: FederatedPointerEvent;

  const press = (x: number, y: number): void => {
    Object.assign(pooled, { global: new Point(x, y) });
    viewport.emit('pointerdown', pooled);
    viewport.emit('pointerup', pooled);
  };

  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
    (AssetService as unknown as { instance: AssetService | null }).instance = null;
    const { app } = createInMemoryApp({ files: { 'Inn.md': '# Inn' } });
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
    store = createViewAtlasStore(app, 'pin-press-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/world.atlasmap');
    eventBus = new EventEmitter();

    pins = new PinRenderer(viewport, eventBus, store);
    fog = new FogOfWarRenderer(viewport, { canvas: createEl('canvas') } as unknown as Application, eventBus as never, store, () => null);
    drawing = new DrawingRenderer(viewport, eventBus, store);
    tokens = new TokenRenderer(app, viewport, gridSystem, vi.fn(), store, eventBus, 'pin-press-view');
    tokens.setPixiApp({
      ticker: { add: vi.fn(), remove: vi.fn(), lastTime: 0 },
      canvas: document.createElement('canvas'),
      renderer: { generateTexture: vi.fn(() => new Texture()) },
    } as unknown as Application);
    tokens.setPinHitTestProvider((x, y) => pins.hitTestPins(x, y));
    tokens.setPinClickHandler((pinId, e) => pins.handleViewportPinPointerDown(pinId, e));
    // As the view does once the dispatch listens (`_initGridInternal`)
    pins.reorderViewportListeners();
    drawing.reorderViewportListeners();
    fog.reorderViewportListeners();

    placed = vi.fn();
    eventBus.on('canvas-click', placed);
    pooled = { button: 0, pointerId: 1, pointerType: 'mouse', global: new Point(0, 0), stopPropagation: vi.fn(), preventDefault: vi.fn() } as unknown as FederatedPointerEvent;
    store.getState().addNotePin(100, 100, 'Inn.md');
    store.getState().setActiveTool('note-pin');
  });

  afterEach(() => {
    tokens.destroy();
    drawing.destroy();
    fog.destroy();
    pins.destroy();
    viewport.destroy();
    restoreGraphics();
  });

  it('places no pin on a pin, which takes the press itself', () => {
    press(100, 100);
    expect(placed).not.toHaveBeenCalled();
  });

  it('places a pin on the first press after one a pin took', () => {
    press(100, 100);
    press(500, 400);
    expect(placed).toHaveBeenCalledTimes(1);
    expect(placed).toHaveBeenLastCalledWith(expect.objectContaining({ worldX: 500, worldY: 400 }));
  });

  it('places a pin on every press on the open map, whatever tool took the press before', () => {
    store.getState().setActiveTool('move');
    press(100, 100);
    store.getState().setActiveTool('note-pin');
    for (let index = 0; index < 5; index++) press(400 + index * 40, 300);
    expect(placed).toHaveBeenCalledTimes(5);
  });

  it('draws no stroke on a pin, and one on the first press after it', () => {
    store.getState().setActiveTool('draw-pen');
    press(100, 100);
    expect(store.getState().objects.drawings).toEqual({});
    press(500, 400);
    expect(Object.keys(store.getState().objects.drawings)).toHaveLength(1);
  });

  it('paints no fog on a pin, and some on the first press after it', () => {
    store.getState().setActiveTool('fog');
    press(100, 100);
    expect(store.getState().objects.fog).toEqual({});
    press(500, 400);
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(1);
  });
});
