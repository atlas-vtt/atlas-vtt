import '../setup/obsidianDom';
import { Application, RenderTexture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HANDLE_LOOK, handleSpots, handlesOf } from '../../src/app/annotations/annotationHandles';
import { annotationList } from '../../src/app/annotations/annotationList';
import { rectanglePoints } from '../../src/app/annotations/shapeOutlines';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { captureWithLayerVisibility, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('events', async () => import('eventemitter3'));

const WIDTH = 600;
const HEIGHT = 400;
/** The accent the handles are drawn in here: a colour nothing else on the stage has. */
const ACCENT = 0xff00ff;

interface Scene {
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  annotations: AnnotationsRenderer;
  /** Looks at the world point (x, y) at `zoom`, and lets the view's tick follow the camera. */
  look(x: number, y: number, zoom: number): void;
  gm(): Uint8ClampedArray;
  players(): Uint8ClampedArray;
}

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

function picture(app: Application, layers: readonly LayerVisibility[]): Uint8ClampedArray {
  const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
  let pixels = new Uint8ClampedArray();
  captureWithLayerVisibility(layers, () => undefined, () => {
    app.renderer.render({ container: app.stage, target, clear: true, clearColor: app.renderer.background.colorRgba });
    pixels = app.renderer.extract.pixels({ target }).pixels;
  });
  target.destroy(true);
  return pixels;
}

/** A view of a black map with one dim rectangle from (200, 150) to (400, 250), selected in the Draw tool's Select mode. */
async function open(): Promise<Scene> {
  const app = new Application();
  await app.init({ width: WIDTH, height: HEIGHT, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x000000 });
  const viewport = new Viewport({ screenWidth: WIDTH, screenHeight: HEIGHT, worldWidth: 4000, worldHeight: 4000, events: app.renderer.events, ticker: app.ticker });
  viewport.sortableChildren = true;
  app.stage.addChild(viewport);
  const store = createViewAtlasStore(createInMemoryApp().app, `annotation-handles-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/handles.atlasmap');
  const annotations = new AnnotationsRenderer({ viewport, store, grid: () => null, accent: () => ACCENT });
  cleanup.push(() => {
    annotations.destroy();
    viewport.destroy();
    app.destroy(true, { children: true });
  });
  const id = store.getState().addDrawing({ type: 'rectangle', points: rectanglePoints({ x: 200, y: 150 }, { x: 400, y: 250 }), color: '#202020', width: 2, opacity: 1 });
  store.getState().setDrawTool({ mode: 'select' });
  store.getState().setActiveTool('draw');
  store.getState().setSelection([id]);
  return {
    app, viewport, store, annotations,
    look: (x, y, zoom) => {
      viewport.setZoom(zoom, true);
      viewport.moveCenter(x, y);
      app.ticker.update(performance.now());
    },
    gm: () => picture(app, []),
    players: () => picture(app, annotations.getPlayerViewLayers()),
  };
}

const isAccent = (pixels: Uint8ClampedArray, i: number): boolean => pixels[i]! > 150 && pixels[i + 1]! < 90 && pixels[i + 2]! > 150;
const accentPixels = (pixels: Uint8ClampedArray): number => {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) if (isAccent(pixels, i)) count++;
  return count;
};

/** How many pixels across the mark at the screen point (x, y) is, along its row: lit pixels with no gap between them. */
function markWidth(pixels: Uint8ClampedArray, x: number, y: number): number {
  const row = Math.round(y);
  const lit = (column: number): boolean => {
    const i = (row * WIDTH + column) * 4;
    return pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 120;
  };
  let left = Math.round(x);
  let right = left;
  while (left > 0 && lit(left - 1)) left--;
  while (right < WIDTH - 1 && lit(right + 1)) right++;
  return lit(Math.round(x)) ? right - left + 1 : 0;
}

/** Where the selected rectangle's handles stand on screen now. */
function handlesOnScreen(s: Scene): { corner: { x: number; y: number }; turn: { x: number; y: number } } {
  const zoom = s.viewport.scale.x;
  const spots = handleSpots(handlesOf(annotationList(s.store.getState().objects))!, zoom);
  const screen = (kind: 'corner' | 'turn'): { x: number; y: number } => {
    const spot = spots.find(({ ref }) => ref.kind === kind)!;
    const { x, y } = s.viewport.toScreen(spot.at.x, spot.at.y);
    return { x, y };
  };
  return { corner: screen('corner'), turn: screen('turn') };
}

describe('the handles of a selected drawing', () => {
  it('show for the GM, as large on screen at one zoom as at another', async () => {
    const s = await open();
    const sizes: { corner: number; turn: number; frame: number }[] = [];
    for (const zoom of [1, 2.5]) {
      s.look(300, 200, zoom);
      const pixels = s.gm();
      const { corner, turn } = handlesOnScreen(s);
      // A row above the frame's line, which runs through the corner's middle: there the row crosses the square alone.
      // And a row through the disc above its glyph, where the disc is twelve pixels across.
      sizes.push({ corner: markWidth(pixels, corner.x, corner.y - 3), turn: markWidth(pixels, turn.x, turn.y - 8), frame: accentPixels(pixels) });
    }
    const [near, far] = sizes as [typeof sizes[0], typeof sizes[0]];
    // The square is its fill and its line on either side.
    expect(near.corner).toBeGreaterThanOrEqual(2 * HANDLE_LOOK.grip);
    expect(near.corner).toBeLessThanOrEqual(2 * HANDLE_LOOK.grip + 4);
    expect(Math.abs(far.corner - near.corner)).toBeLessThanOrEqual(1);
    expect(near.turn).toBeGreaterThanOrEqual(10);
    expect(near.turn).toBeLessThanOrEqual(14);
    expect(Math.abs(far.turn - near.turn)).toBeLessThanOrEqual(1);
    // The frame is longer on screen where the drawing is larger, and no thicker: two and a half times the zoom, far less than six times the ink.
    expect(far.frame).toBeGreaterThan(near.frame * 1.2);
    expect(far.frame).toBeLessThan(near.frame * 3);
  });

  it('are in no players\' frame: with something selected or nothing, players see the same picture', async () => {
    const s = await open();
    s.look(300, 200, 1);
    expect(accentPixels(s.gm())).toBeGreaterThan(400);
    const withSelection = s.players();
    expect(accentPixels(withSelection)).toBe(0);
    s.annotations.selecting.pointer.cursorAt(300, 150, () => false);
    s.store.getState().clearSelection();
    // Nothing selected, the pointer over the drawing: its hover mark is the GM's too.
    s.annotations.selecting.pointer.cursorAt(300, 150, () => false);
    expect(accentPixels(s.gm())).toBeGreaterThan(100);
    const hovered = s.players();
    expect(accentPixels(hovered)).toBe(0);
    expect(hovered).toEqual(withSelection);
  });

  it('go from the GM\'s own canvas while it shows the players\' picture', async () => {
    const s = await open();
    s.look(300, 200, 1);
    s.store.getState().setGMView(false);
    expect(accentPixels(s.gm())).toBe(0);
    s.store.getState().setGMView(true);
    expect(accentPixels(s.gm())).toBeGreaterThan(400);
  });
});
