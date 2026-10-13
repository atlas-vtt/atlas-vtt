import { RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstDifference, playerFrameSource, playerWindow, viewOf } from '../helpers/playerFrameView';
import { openLitView, type LitView } from '../helpers/litView';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import type { TokenEntity } from '../../src/app/types';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 256;
/** The player window, and the pane of a DM whose screen has its size: all of the map, a pixel to a world pixel. */
const WINDOW = { width: MAP, height: MAP };
/** A pane a sidebar left: the middle third of the map. Two thirds of what the players' window shows lie beside it. */
const NARROW = { width: 84, height: MAP };

function token(id: string, x: number, y: number, vision: TokenEntity['vision']): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision } as TokenEntity;
}

/**
 * A dark scene with everything the composite draws, spread over the whole map: party tokens
 * left and right that see a part of it, a wall with a closed and an open door between them,
 * lights on both sides, a source of magical darkness, a zone with daylight of its own, the grid
 * and explored memory left where a token stood before.
 */
function build({ store, displayFrames }: LitView): void {
  const state = store.getState();
  state.setSceneLighting({ enabled: true, ambient: 0.08 });
  store.setState((s) => ({ objects: { ...s.objects, tokens: {
    // Ada sees 84 px around her, Bo 98
    ada: token('ada', 40, 215, { enabled: true, range: 6 }),
    bo: token('bo', 215, 190, { enabled: true, range: 7 }),
    // Seen by nobody: no vision of its own
    cat: token('cat', 128, 30, { enabled: false }),
  } } }));
  state.addWall({ type: 'solid', p1: { x: 128, y: 0 }, p2: { x: 128, y: 50 } });
  state.addWall({ type: 'door', closed: true, p1: { x: 128, y: 50 }, p2: { x: 128, y: 90 } });
  state.addWall({ type: 'solid', p1: { x: 128, y: 90 }, p2: { x: 128, y: 190 } });
  state.addWall({ type: 'door', closed: false, p1: { x: 128, y: 190 }, p2: { x: 128, y: 230 } });
  state.addWall({ type: 'solid', p1: { x: 128, y: 230 }, p2: { x: 128, y: 256 } });
  state.addWall({ type: 'solid', p1: { x: 180, y: 40 }, p2: { x: 240, y: 80 } });
  const emission = { bright: 2, dim: 4.5, color: '#ffc080', intensity: 1, animation: 'none' as const };
  state.addLight({ x: 30, y: 200, emission });
  state.addLight({ x: 96, y: 50, emission });
  // Out of everybody's sight
  state.addLight({ x: 200, y: 40, emission: { ...emission, color: '#80c0ff' } });
  state.addLight({ x: 70, y: 100, emission: { ...emission, dim: 2.5, darkness: true } });
  state.addLightZone({ polygon: [{ x: 116, y: 200 }, { x: 250, y: 200 }, { x: 250, y: 250 }, { x: 116, y: 250 }], ambient: 0.9 });
  displayFrames(30);
  // Ada walks north: the lit floor where she stood is remembered
  store.getState().updateToken('ada', { x: 50, y: 70 });
  displayFrames(30);
}

describe('a lit players\' frame of another size than the DM\'s pane', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  async function open(pane: { width: number; height: number }, preference: 'webgl' | 'canvas' = 'webgl'): Promise<LitView> {
    const view = await openLitView({ preference, pane, map: MAP, grid: 32 });
    cleanup.push(() => view.dispose());
    build(view);
    return view;
  }

  /** The players' frame of `view` for a window of `WINDOW`'s size, through the frame texture. */
  function mirrored(view: LitView, resolution = 1): { pixels: Uint8ClampedArray; antialias: boolean } {
    const { app, viewport, controller } = view;
    const { source, frames } = playerFrameSource({ renderer: app.renderer, stage: app.stage, ...viewOf(viewport, app.renderer), layers: () => controller.playerLayers() });
    const players = playerWindow(source, { width: WINDOW.width / resolution, height: WINDOW.height / resolution, resolution });
    cleanup.push(() => { players.mirror.stop(); frames.destroy(); });
    players.frame();
    expect([players.target.width, players.target.height]).toEqual([WINDOW.width, WINDOW.height]);
    return { pixels: players.pixels(), antialias: resolution < 2 };
  }

  /** The players' picture on a DM screen of the window's size, rendered into a texture as smooth as the frame's. */
  function onScreen(view: LitView, antialias: boolean): Uint8ClampedArray {
    const { app, controller } = view;
    const target = RenderTexture.create({ ...WINDOW, antialias });
    let pixels = new Uint8ClampedArray();
    captureWithLayerVisibility(controller.playerLayers(), () => undefined, () => {
      app.renderer.render({ container: app.stage, target, clear: true, clearColor: app.renderer.background.colorRgba });
      pixels = app.renderer.extract.pixels({ target }).pixels;
    });
    target.destroy(true);
    app.renderer.render({ container: app.stage });
    return pixels;
  }

  /** The players' picture on that screen's own canvas, as the mirror copied it until now. */
  function onCanvas(view: LitView): Uint8ClampedArray {
    const { app, controller } = view;
    let pixels = new Uint8ClampedArray();
    captureWithLayerVisibility(controller.playerLayers(), () => app.renderer.render({ container: app.stage }), () => {
      const copy = new OffscreenCanvas(app.canvas.width, app.canvas.height).getContext('2d', { willReadFrequently: true })!;
      copy.drawImage(app.canvas, 0, 0);
      pixels = copy.getImageData(0, 0, app.canvas.width, app.canvas.height).data;
    });
    return pixels;
  }

  function at(pixels: Uint8ClampedArray, x: number, y: number): number[] {
    const i = (y * WINDOW.width + x) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  }

  const luma = ([r, g, b]: number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

  it('is, pixel for pixel, the players\' picture on a DM screen of the window\'s size: light, sight, memory, magical darkness, a zone, the unlit grid and the doors', async () => {
    const narrow = await open(NARROW);
    const wide = await open(WINDOW);
    expect((narrow.app.renderer as WebGLRenderer).backBuffer.useBackBuffer).toBe(true);
    // The narrow pane shows the map's middle third
    expect([narrow.viewport.left, narrow.viewport.right]).toEqual([86, 170]);

    const players = mirrored(narrow);
    const expected = onScreen(wide, players.antialias);
    expect(firstDifference(players.pixels, expected, WINDOW.width)).toBeNull();

    // What the picture holds, left and right of the pane
    const lit = luma(at(players.pixels, 90, 44));
    const unseen = luma(at(players.pixels, 250, 20));
    const remembered = luma(at(players.pixels, 38, 190));
    const zone = luma(at(players.pixels, 232, 225));
    expect(lit).toBeGreaterThan(90);
    expect(unseen).toBeLessThan(8);
    expect(remembered).toBeGreaterThan(unseen + 4);
    expect(remembered).toBeLessThan(lit);
    expect(zone).toBeGreaterThan(90);
  });

  it('is the picture on that screen\'s canvas, but for what is sized by zoom rather than by device pixels', async (ctx) => {
    const narrow = await open(NARROW);
    const wide = await open(WINDOW);
    // Two pixels to a point: the frame is not smoothed, like the canvas of this renderer
    const players = mirrored(narrow, 2);
    expect(players.antialias).toBe(false);
    const canvas = onCanvas(wide);
    let differing = 0;
    let largest = 0;
    for (let i = 0; i < canvas.length; i += 4) {
      const difference = Math.max(Math.abs(canvas[i]! - players.pixels[i]!), Math.abs(canvas[i + 1]! - players.pixels[i + 1]!), Math.abs(canvas[i + 2]! - players.pixels[i + 2]!));
      if (difference > 0) differing++;
      largest = Math.max(largest, difference);
    }
    const figures = `lit players' frame against a DM canvas of its size: ${differing} of ${canvas.length / 4} pixels differ, by ${largest} at most`;
    await ctx.annotate(figures, 'comparison');
    console.info(figures);
    // The frame has two pixels to a point where this canvas has one. What the picture sizes by zoom and not by device
    // pixels differs there, as on a canvas at a pixel ratio of 2: the composite's ramp along wall faces, the grid's lines
    expect(differing / (canvas.length / 4)).toBeLessThan(0.01);
  });

  it('leaves the DM\'s lit canvas as it is without a players\' frame', async () => {
    const narrow = await open(NARROW);
    const { app } = narrow;
    const own = (): Uint8ClampedArray => {
      app.renderer.render({ container: app.stage });
      const copy = new OffscreenCanvas(app.canvas.width, app.canvas.height).getContext('2d', { willReadFrequently: true })!;
      copy.drawImage(app.canvas, 0, 0);
      return copy.getImageData(0, 0, app.canvas.width, app.canvas.height).data;
    };
    const before = own().slice();
    mirrored(narrow);
    expect(firstDifference(own(), before, app.canvas.width)).toBeNull();
    expect((app.renderer as WebGLRenderer).backBuffer.useBackBuffer).toBe(true);
  });

  it('shows, behind the line-of-sight fallback on PIXI\'s Canvas renderer, the mask of a DM screen of the window\'s size', async () => {
    const narrow = await open(NARROW, 'canvas');
    const wide = await open(WINDOW, 'canvas');
    expect(narrow.app.renderer.name).toBe('canvas');
    const players = mirrored(narrow);
    const expected = onScreen(wide, false);
    expect(firstDifference(players.pixels, expected, WINDOW.width)).toBeNull();
    // Black outside what the party sees, on both sides of the pane, and the map where a token looks
    expect(at(players.pixels, 250, 20)).toEqual([0, 0, 0]);
    expect(at(players.pixels, 8, 250)).toEqual([0, 0, 0]);
    expect(luma(at(players.pixels, 50, 60))).toBeGreaterThan(60);
    expect(luma(at(players.pixels, 215, 205))).toBeGreaterThan(60);
  });
});
