import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchGl } from '../../pixi/lighting/engine/__tests__/strictGl';
import { LightingWorld } from '../../pixi/lighting/engine/LightingWorld';
import { visionToken } from '../../pixi/lighting/__tests__/rendererHarness';
import type { SceneFrameCapture } from '../../pixi/sceneFrameCapture';
import { MapThumbnailService, SNAPSHOT_THUMBNAIL_SIZE, type ThumbnailSize } from '../MapThumbnailService';
import {
  DARK_AT, LIGHT_AT, MAP_RECT, OPEN_AT, SHADOW_AT, brightnessAt, createThumbnailScene, decodeImage, inThumbnail, largestDifference, overlayLayers, type Pixels, type ThumbnailScene,
} from './thumbnailScene';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Notice: class {
    constructor(message: string) {
      notices.push(message);
    }
  },
}));

const SCENE_CARD: ThumbnailSize = { width: 400, height: 300 };
/** The map's own colour in a thumbnail without lighting. */
const UNLIT_MAP = 180;

describe.each([false, true])('thumbnail of a scene with dynamic lighting (antialiased canvas: %s)', (antialias) => {
  let scene: ThumbnailScene | null = null;

  beforeEach(() => {
    notices.length = 0;
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  });

  afterEach(() => {
    scene?.dispose();
    scene = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function dataUrl(size: ThumbnailSize, capture: SceneFrameCapture | undefined = scene!.capture): string {
    const { app, viewport } = scene!;
    return new MapThumbnailService({} as App).renderThumbnail(app, viewport, MAP_RECT, size, capture)!;
  }

  function thumbnail(size: ThumbnailSize = SCENE_CARD): Promise<Pixels> {
    return decodeImage(dataUrl(size));
  }

  it.each([SCENE_CARD, SNAPSHOT_THUMBNAIL_SIZE])('is bright where a light is and dark where none is, at %o', async (size) => {
    scene = await createThumbnailScene({ enabled: true, ambient: 0 }, antialias);
    const pixels = await thumbnail(size);
    const at = (point: { x: number; y: number }): number => {
      const { x, y } = inThumbnail(point, size);
      return brightnessAt(pixels, x, y);
    };
    expect(at(LIGHT_AT)).toBeGreaterThan(150);
    expect(at(DARK_AT)).toBeLessThan(70);
    expect(at(OPEN_AT)).toBeGreaterThan(at(SHADOW_AT) + 30);
  });

  it.each([SCENE_CARD, SNAPSHOT_THUMBNAIL_SIZE])('shows what the GM sees of the same frame on the canvas, at %o', async (size) => {
    scene = await createThumbnailScene({ enabled: true, ambient: 0.2, ambientColor: '#ffd9a0' }, antialias);
    scene.tick();
    const onScreen = scene.onScreen(size);
    const lit = inThumbnail(LIGHT_AT, size);
    expect(brightnessAt(onScreen, lit.x, lit.y)).toBeGreaterThan(150);
    expect(largestDifference(await thumbnail(size), onScreen)).toBeLessThan(2);
  });

  it('includes the bounce of an edit made a moment ago, which the canvas builds on its next frame', async () => {
    scene = await createThumbnailScene({ enabled: true, ambient: 0 }, antialias);
    const pixels = await thumbnail();
    scene.tick();
    expect(largestDifference(pixels, scene.onScreen(SCENE_CARD))).toBeLessThan(2);
  });

  it('shows the GM view while the canvas shows the players, and leaves the canvas on theirs', async () => {
    // The token sees 5 ft around itself: the players' view of the torch is black.
    scene = await createThumbnailScene({ enabled: true, ambient: 0 }, antialias, { t: visionToken(680, 300, 5) });
    scene.tick();
    const gmView = scene.onScreen(SCENE_CARD);
    scene.lighting.modeLayer.visible = true;
    const lit = inThumbnail(LIGHT_AT, SCENE_CARD);
    const playerView = scene.onScreen(SCENE_CARD);
    expect(brightnessAt(playerView, lit.x, lit.y)).toBeLessThan(5);

    expect(largestDifference(await thumbnail(), gmView)).toBeLessThan(2);
    expect(largestDifference(scene.onScreen(SCENE_CARD), playerView)).toBe(0);
  });

  it('leaves out the GM overlays and has them back afterwards', async () => {
    scene = await createThumbnailScene({ enabled: true, ambient: 0 }, antialias);
    const layers = overlayLayers(scene.overlays);
    scene.overlays.gmOverlays.wallEditor.visible = false;
    scene.tick();
    const before = scene.onScreen(SCENE_CARD);

    // Each overlay covers the map in magenta: one that reached the picture would light its dark floor.
    const dark = inThumbnail(DARK_AT, SCENE_CARD);
    expect(brightnessAt(await thumbnail(), dark.x, dark.y)).toBeLessThan(70);
    // Pins, hex links and the GM's seven overlays: all but the wall editor, hidden before, are back.
    expect(layers.map((layer) => layer.visible)).toEqual([true, true, false, true, true, true, true, true, true]);
    expect(largestDifference(scene.onScreen(SCENE_CARD), before)).toBe(0);
  });

  it('has the overlays back when the render fails', async () => {
    scene = await createThumbnailScene({ enabled: true, ambient: 0 }, antialias);
    const failing: SceneFrameCapture = (frame) => scene!.capture(frame, () => {
      throw new Error('the render failed');
    });
    expect(() => dataUrl(SCENE_CARD, failing)).toThrow('the render failed');
    expect(overlayLayers(scene.overlays).every((layer) => layer.visible)).toBe(true);
    // The composite is back on the canvas's camera and view.
    scene.tick();
    expect(largestDifference(await thumbnail(), scene.onScreen(SCENE_CARD))).toBeLessThan(2);
  });

  it('raises no GL error', async () => {
    scene = await createThumbnailScene({ enabled: true, ambient: 0.2 }, antialias);
    const watch = watchGl(scene.renderer.gl);
    dataUrl(SCENE_CARD);
    dataUrl(SNAPSHOT_THUMBNAIL_SIZE);
    watch.stop();
    expect(watch.findings).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(0);
  });

  it('is the same picture as without lighting support while the scene has lighting off', async () => {
    scene = await createThumbnailScene({ enabled: false, ambient: 0 }, antialias);
    // What the thumbnail was before it knew about lighting, which had no overlays to leave out.
    overlayLayers(scene.overlays).forEach((layer) => (layer.visible = false));
    const before = dataUrl(SCENE_CARD, undefined);
    expect(dataUrl(SCENE_CARD)).toBe(before);
    const dark = inThumbnail(DARK_AT, SCENE_CARD);
    expect(brightnessAt(await decodeImage(before), dark.x, dark.y)).toBeGreaterThan(UNLIT_MAP);
  });

  it('is unlit, not missing, when the lighting fails while the thumbnail is made', async () => {
    scene = await createThumbnailScene({ enabled: true, ambient: 0 }, antialias);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(LightingWorld.prototype, 'flush').mockImplementation(() => {
      throw new Error('the graphics device gave up');
    });
    const pixels = await thumbnail();
    const dark = inThumbnail(DARK_AT, SCENE_CARD);
    expect(brightnessAt(pixels, dark.x, dark.y)).toBeGreaterThan(UNLIT_MAP);
    expect(notices).toHaveLength(1);

    // The line-of-sight fallback lights nothing on the GM's canvas: its thumbnails are the plain render.
    overlayLayers(scene.overlays).forEach((layer) => (layer.visible = false));
    expect(dataUrl(SCENE_CARD)).toBe(dataUrl(SCENE_CARD, undefined));
  });
});
