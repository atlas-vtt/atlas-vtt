import '../setup/obsidianDom';
import { Container, RenderTexture, Sprite, Text, Texture, Ticker, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { maxTextureSide } from '../../src/app/pixi/lighting/engine/gpu';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { TEXT_SETTLE_MS } from '../../src/app/pixi/TextSharpening';
import { TEXT_CONTENT_LABEL } from '../../src/app/pixi/textElementView';
import { TEXT_TEXTURE_LIMITS } from '../../src/app/pixi/textSharpness';
import { destroyTree } from '../../src/app/pixi/utils/destroyTree';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** The view's side in points: the text fits it at the closest zoom. */
const VIEW = 800;
/** Where the text stands in the world. */
const PLACE = { x: 1000, y: 700 };
const LABEL = { ...PLACE, text: 'Guard room', fontSize: 24, fontFamily: 'Arial', color: '#ffffff' };
/** The closest zoom a view allows. */
const CLOSE = 5;

interface Picture {
  data: Uint8ClampedArray;
  /** Device pixels a side. */
  side: number;
}

interface Scene {
  renderer: WebGLRenderer;
  viewport: Viewport;
  texts: AnnotationsRenderer;
  store: ReturnType<typeof createViewAtlasStore>;
  /** One frame of the view's loop. */
  tick(): void;
  /** Shows the world around the text's place at `zoom`, as the GM's camera. */
  zoomTo(zoom: number): void;
  picture(): Picture;
  /** The text of `id` as PIXI draws it. */
  textOf(id: string): Text;
  /** How often a text was drawn into a texture so far. */
  drawn(): number;
  /** The pixels of the texture drawn last. */
  lastTexture(): { width: number; height: number };
}

const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

async function scene(resolution = 1): Promise<Scene> {
  const renderer = await createTestRenderer(VIEW, resolution);
  const ticker = new Ticker();
  const viewport = new Viewport({ screenWidth: VIEW, screenHeight: VIEW, events: renderer.events, ticker });
  const stage = new Container();
  const floor = new Sprite(Texture.WHITE);
  floor.tint = 0x000000;
  floor.setSize(VIEW, VIEW);
  stage.addChild(floor, viewport);
  const store = createViewAtlasStore(createInMemoryApp().app, 'map-text-test');
  store.getState().setPersistenceEnabled(false);
  const texts = new AnnotationsRenderer({
    viewport, store, grid: () => null,
    sharpness: { resolution: () => renderer.resolution, maxTextureSide: () => maxTextureSide(renderer) },
  });
  const target = RenderTexture.create({ width: VIEW, height: VIEW, resolution });
  const rasters = vi.spyOn(renderer.canvasText, 'getTexture');
  let time = 0;
  cleanups.push(() => {
    rasters.mockRestore();
    texts.destroy();
    target.destroy(true);
    destroyTree(stage);
    ticker.destroy();
    renderer.destroy();
  });
  return {
    renderer, viewport, texts, store,
    tick: () => ticker.update(time += 16),
    zoomTo: (zoom) => {
      viewport.setZoom(zoom, true);
      viewport.moveCenter(PLACE.x, PLACE.y);
    },
    picture: () => {
      renderer.render({ container: stage, target, clear: true });
      return { data: renderer.extract.pixels({ target }).pixels, side: VIEW * resolution };
    },
    textOf: (id) => texts.layer.node('text', id)?.getChildByLabel(TEXT_CONTENT_LABEL) as Text,
    drawn: () => rasters.mock.calls.length,
    lastTexture: () => {
      const texture = rasters.mock.results.at(-1)?.value as Texture;
      return { width: texture.source.pixelWidth, height: texture.source.pixelHeight };
    },
  };
}

/** `LABEL` set at the size zoom `zoom` shows it at, in the middle of a view: what sharp is. */
async function setAtSize(zoom: number, resolution = 1): Promise<Picture> {
  const renderer = await createTestRenderer(VIEW, resolution);
  const stage = new Container();
  const floor = new Sprite(Texture.WHITE);
  floor.tint = 0x000000;
  floor.setSize(VIEW, VIEW);
  const text = new Text({ text: LABEL.text, style: { fontFamily: LABEL.fontFamily, fontSize: LABEL.fontSize * zoom, fill: LABEL.color, align: 'center' } });
  text.anchor.set(0.5);
  text.position.set(VIEW / 2, VIEW / 2);
  stage.addChild(floor, text);
  const target = RenderTexture.create({ width: VIEW, height: VIEW, resolution });
  renderer.render({ container: stage, target, clear: true });
  const data = renderer.extract.pixels({ target }).pixels;
  target.destroy(true);
  destroyTree(stage);
  renderer.destroy();
  return { data, side: VIEW * resolution };
}

const ink = (picture: Picture, x: number, y: number): number => picture.data[(y * picture.side + x) * 4]! / 255;

/**
 * The share of a text's pixels that are neither ink nor ground: the width of its edges. A text
 * drawn at its size has edges a pixel wide; one stretched from a smaller picture has ramps as
 * wide as the stretch.
 */
function softness(picture: Picture): number {
  let inked = 0;
  let soft = 0;
  for (let i = 0; i < picture.data.length; i += 4) {
    const value = picture.data[i]! / 255;
    if (value <= 0.15) continue;
    inked++;
    if (value < 0.85) soft++;
  }
  expect(inked).toBeGreaterThan(200);
  return soft / inked;
}

/** The box of the pixels that are more ink than ground. */
function inkBox(picture: Picture): { left: number; right: number; top: number; bottom: number } {
  const box = { left: picture.side, right: -1, top: picture.side, bottom: -1 };
  for (let y = 0; y < picture.side; y++) {
    for (let x = 0; x < picture.side; x++) {
      if (ink(picture, x, y) < 0.5) continue;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
  }
  return box;
}

const rested = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, TEXT_SETTLE_MS + 50));

describe('a text on the map', () => {
  it.each([1, 2])('is as sharp at the closest zoom as a text set at that size, at %i pixels to the point', async (resolution) => {
    const s = await scene(resolution);
    const id = s.store.getState().addText(LABEL);
    s.zoomTo(CLOSE);
    s.tick();
    const sharp = s.picture();
    // As every text was drawn before: once, at the screen's pixels, and stretched by the zoom.
    s.textOf(id).resolution = resolution;
    const stretched = s.picture();
    const reference = await setAtSize(CLOSE, resolution);

    const [sharpEdges, stretchedEdges, referenceEdges] = [softness(sharp), softness(stretched), softness(reference)];
    expect(sharpEdges).toBeLessThan(referenceEdges * 1.25 + 0.01);
    expect(stretchedEdges).toBeGreaterThan(sharpEdges * 2);

    // The same text in the same place, to a texel of the stretched picture (which places no edge more exactly).
    const [box, before] = [inkBox(sharp), inkBox(stretched)];
    expect(box.right - box.left).toBeGreaterThan(VIEW * resolution * 0.6);
    expect(box.right).toBeLessThan(VIEW * resolution - 1);
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      expect(Math.abs(box[side] - before[side]), side).toBeLessThanOrEqual(CLOSE);
    }
  });

  it('keeps its bounds whatever resolution it is drawn at', async () => {
    const s = await scene();
    const id = s.store.getState().addText({ ...LABEL, backgroundColor: '#202020' });
    const view = s.textOf(id).parent!;
    s.zoomTo(1);
    s.tick();
    const { minX, minY, maxX, maxY } = view.getLocalBounds();
    s.zoomTo(CLOSE);
    s.tick();
    s.picture();
    expect(s.textOf(id).resolution).toBe(8);
    expect(view.getLocalBounds()).toMatchObject({ minX, minY, maxX, maxY });
  });

  it('is drawn anew once per doubling of the zoom, and not at all while the camera only pans', async () => {
    const s = await scene();
    s.store.getState().addText(LABEL);
    s.zoomTo(1);
    s.tick();
    s.picture();
    const first = s.drawn();
    expect(first).toBe(1);

    for (let zoom = 1; zoom <= CLOSE; zoom += 0.1) {
      s.zoomTo(zoom);
      s.tick();
      s.picture();
    }
    // 2, 4 and 8 pixels to the unit.
    expect(s.drawn() - first).toBe(3);

    const atClosest = s.drawn();
    for (let step = 0; step < 20; step++) {
      s.viewport.moveCenter(PLACE.x + step, PLACE.y - step);
      s.tick();
      s.picture();
    }
    expect(s.drawn()).toBe(atClosest);
  });

  it('gives its pixels back once the camera has rested zoomed out', async () => {
    const s = await scene();
    const id = s.store.getState().addText(LABEL);
    s.zoomTo(CLOSE);
    s.tick();
    s.picture();
    s.zoomTo(1);
    s.tick();
    s.picture();
    expect(s.textOf(id).resolution).toBe(8);
    await rested();
    s.tick();
    s.picture();
    expect(s.textOf(id).resolution).toBe(1);
    expect(s.lastTexture().width).toBeLessThanOrEqual(256);
  });

  it('is sharp in a players\' frame that shows it larger than the GM\'s view does', async () => {
    const s = await scene();
    s.store.getState().addText(LABEL);
    s.zoomTo(1);
    s.tick();
    s.picture();
    // The player window's frame, as `frameView` describes it: five pixels to the world unit around the text.
    const world = VIEW / CLOSE;
    const release = s.texts.addDemandRegion({ rect: { x: PLACE.x - world / 2, y: PLACE.y - world / 2, width: world, height: world }, worldPerScreenPixel: 1 / CLOSE });
    // The frame's camera is set on the viewport for one render, which no tick sees.
    const { x, y } = s.viewport.position;
    s.viewport.scale.set(CLOSE);
    s.viewport.position.set(VIEW / 2 - PLACE.x * CLOSE, VIEW / 2 - PLACE.y * CLOSE);
    const frame = s.picture();
    s.viewport.scale.set(1);
    s.viewport.position.set(x, y);
    release();

    expect(softness(frame)).toBeLessThan(softness(await setAtSize(CLOSE)) * 1.25 + 0.01);
  });

  it('holds a huge text at the closest zoom to the texture limits, and still draws it', async () => {
    const s = await scene(2);
    // Blocks: wherever the view looks into so large a text, there is ink.
    const id = s.store.getState().addText({ ...LABEL, text: '\u2588'.repeat(30), fontSize: 72, scale: 5 });
    s.zoomTo(CLOSE);
    s.tick();
    const picture = s.picture();
    const { width, height } = s.lastTexture();
    expect(Math.max(width, height)).toBeLessThanOrEqual(Math.min(TEXT_TEXTURE_LIMITS.maxSide, maxTextureSide(s.renderer) ?? Infinity));
    expect(width * height).toBeLessThanOrEqual(TEXT_TEXTURE_LIMITS.maxPixels);
    // Fifty pixels to the unit were asked for.
    expect(s.textOf(id).resolution).toBeLessThan(16);
    expect(ink(picture, picture.side / 2, picture.side / 2)).toBeGreaterThan(0.85);
  });
});
