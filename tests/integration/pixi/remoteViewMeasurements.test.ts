/**
 * Atlas #321 in a remote view. A remote view's store is a player view (`isPlayerView`, never the GM's), so its canvas
 * always shows the players' view: a measurement that starts on a token the players there do not see, under the fog
 * the view is fed or hidden, is left out, as in the player window and session view; one from a token they see shows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Point, Texture, type Application, type EventSystem, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { MeasureRenderer } from '../../../src/app/pixi/MeasureRenderer';
import { AssetService } from '../../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import { fogCoverage } from '../../../src/app/fog/fogCoverage';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { fogRectangle } from '../../helpers/fogOperations';
import { wirePlayerMeasurements } from '../../helpers/playerMeasureWiring';

vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: vi.fn(), closeContextMenuGlobal: vi.fn() }));
vi.mock('../../../src/app/ui/textInputDialog', () => ({ promptForText: vi.fn(async () => null) }));
// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({ createLucideIconTexture: vi.fn(async () => new Texture()) }));

const IMAGE = 'atlas-vtt/collections/default/tokens/goblin.png';
const GRID = 70;
const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / GRID) * GRID + GRID / 2, y: Math.floor(y / GRID) * GRID + GRID / 2 });
const grid = { getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap, snapTokenCenter: snap } as unknown as GridSystem;

const pointer = (x: number, y: number): FederatedPointerEvent => ({
  button: 0, pointerId: 1, pointerType: 'mouse', global: new Point(x, y), stopPropagation: vi.fn(), preventDefault: vi.fn(),
}) as unknown as FederatedPointerEvent;

describe("A remote view's measurements follow what its player sees (#321)", () => {
  let restoreGraphics: () => void;
  let viewport: Viewport;
  let store: ReturnType<typeof createViewAtlasStore>;
  let bus: EventEmitter;
  let tokens: TokenRenderer;
  let measure: MeasureRenderer;
  let unwire: () => void;

  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
    (AssetService as unknown as { instance: AssetService | null }).instance = null;
    const { app } = createInMemoryApp({ files: { [IMAGE]: 'bytes' } });
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: document.createElement('canvas') } as unknown as EventSystem });
    store = createViewAtlasStore(app, 'remote-measure', undefined, false, { remote: true });
    store.getState().setMapPath('remote:remote-measure');
    bus = new EventEmitter();
    tokens = new TokenRenderer(app, viewport, grid, vi.fn(), store, bus, 'remote-measure');
    const ticker = { add: vi.fn(), remove: vi.fn() } as unknown as Ticker;
    tokens.setPixiApp({ ticker, canvas: document.createElement('canvas'), renderer: { generateTexture: vi.fn(() => new Texture()) } } as unknown as Application);
    // The fog the owner feeds: the players' frame and a player view's canvas hide every token under it.
    tokens.setFogCoverageProvider(() => fogCoverage(store.getState().objects.fog));
    store.setState((state) => ({ objects: { ...state.objects, fog: { paint: fogRectangle({ x: 140, y: 0, width: 140, height: 400 }) } } }));
    measure = new MeasureRenderer(viewport, bus, store, grid);
    unwire = wirePlayerMeasurements({ measure, tokens, store, grid, lighting: () => undefined });
  });

  afterEach(() => {
    unwire();
    measure.destroy();
    tokens.destroy();
    viewport.destroy();
    restoreGraphics();
  });

  const onCanvas = (): boolean[] => measure.getGmViewLayers().map(({ layer }) => layer.visible);
  const ruler = (x: number): void => {
    store.getState().setActiveTool('measure');
    viewport.emit('pointerdown', pointer(x, 105));
    viewport.emit('pointermove', pointer(x, 400));
  };

  it('leaves out a ruler from a token under its fog, shows one from a token its player sees, and records no undo step', async () => {
    expect(store.getState().isPlayerView).toBe(true);
    expect(store.getState().isGMView).toBe(false);
    store.getState().addToken({ id: 'scout', x: 105, y: 105, size: 1, imagePath: IMAGE, layer: 0, isHidden: false, rotation: 0 } as never);
    store.getState().addToken({ id: 'lurker', x: 210, y: 105, size: 1, imagePath: IMAGE, layer: 0, isHidden: false, rotation: 0 } as never);
    await vi.waitFor(() => {
      for (const id of ['scout', 'lurker']) expect(tokens.getTokenSprites()[id]).toBeInstanceOf(Container);
    });
    tokens.refreshPlayerSight();
    expect(tokens.playersSeeOnCanvas()?.('scout')).toBe(true);
    expect(tokens.playersSeeOnCanvas()?.('lurker')).toBe(false);
    ruler(210);
    expect(onCanvas()).toEqual([false, false, false]);
    viewport.emit('pointerup', pointer(210, 400));
    ruler(105);
    expect(onCanvas()).toEqual([true, true, true]);
    viewport.emit('pointerup', pointer(105, 400));
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });
});
