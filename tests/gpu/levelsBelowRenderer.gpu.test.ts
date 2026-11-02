import '../setup/obsidianDom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../src/app/types';
import type { LevelSurface } from '../../src/app/types/sceneLevelTypes';
import { LEVELS, openLevelsView, paintedTexture, worldOf, type LevelsView } from '../helpers/levelsView';
import { requestRender, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import { copiedPixel } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { Rectangle, type WebGLRenderer } from 'pixi.js';
import { resetContext } from '../../src/app/pixi/lighting/__tests__/rendererHarness';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const PANE = 256;
const rect = (x: number, y: number, w: number, h: number): LevelSurface['polygon'] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const viewer = (id: string, x: number, y: number, level = 'upper'): TokenEntity => ({ id, kind: 'token', x, y, imagePath: '', level, vision: { enabled: true } }) as TokenEntity;

/** A pixel shows the level below's magenta: red and blue far above green. */
const magenta = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o]! > pixels[o + 1]! + 60 && pixels[o + 2]! > pixels[o + 1]! + 60;

/** Sets the scene, and waits until the level below's image is in and its picture built. */
async function scene(view: LevelsView, surfaces: Record<string, LevelSurface>, tokens: Record<string, TokenEntity>, ambient = 1): Promise<void> {
  const { store } = view;
  store.setState({
    mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper',
    objects: { ...store.getState().objects, tokens, levelSurfaces: surfaces },
  });
  store.getState().setSceneLighting({ enabled: true, ambient });
  await view.settle();
}

describe('levels below through openings, in a lit view', () => {
  const views: LevelsView[] = [];
  afterEach(() => {
    while (views.length) views.pop()!.dispose();
  });

  it('shows the level below in an opening where the party sees, and the viewed level everywhere else', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(100, 100, 200, 200) } }, { v: viewer('v', 60, 60) });
    const scale = PANE / MAP;
    const frame = view.playerFrame(scale, 0, 0);
    let inside = 0;
    let shown = 0;
    let outside = 0;
    let leaked = 0;
    for (let sy = 0; sy < PANE; sy++) {
      for (let sx = 0; sx < PANE; sx++) {
        const p = worldOf(sx, sy, 1, scale, 0, 0);
        const o = (sy * PANE + sx) * 4;
        const hole = p.x > 104 && p.x < 296 && p.y > 104 && p.y < 296;
        const floor = p.x < 96 || p.x > 304 || p.y < 96 || p.y > 304;
        if (hole) {
          inside++;
          if (magenta(frame, o)) shown++;
        } else if (floor) {
          outside++;
          if (magenta(frame, o)) leaked++;
        }
      }
    }
    expect(inside).toBeGreaterThan(5000);
    expect(shown).toBe(inside);
    expect(leaked).toBe(0);
  });

  it('shows nothing below without an opening, and the level below only once its picture is ready', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, {}, { v: viewer('v', 60, 60) });
    const frame = view.playerFrame(PANE / MAP, 0, 0);
    let magentaPixels = 0;
    for (let o = 0; o < frame.length; o += 4) if (magenta(frame, o)) magentaPixels++;
    expect(magentaPixels).toBe(0);
  });

  it('draws each picture\'s level below through that picture\'s own camera', async () => {
    // Magenta on the left half of the level below, teal on the right.
    const halves = paintedTexture(MAP, MAP, (x) => (x < MAP / 2 ? [220, 30, 220] : [30, 200, 200]));
    const view = await openLevelsView({ map: MAP, pane: PANE, below: halves });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(0, 0, 512, 512) } }, { v: viewer('v', 60, 60) });
    // The players' frame looks at the left half, the GM's canvas then at the right half.
    const players = view.playerFrame(1, 0, 0);
    const gm = view.gmCanvas(1, -256, 0);
    const count = (pixels: Uint8ClampedArray, test: (o: number) => boolean): number => {
      let n = 0;
      for (let o = 0; o < pixels.length; o += 4) if (test(o)) n++;
      return n;
    };
    const teal = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o + 1]! > pixels[o]! + 60 && pixels[o + 2]! > pixels[o]! + 60;
    const all = PANE * PANE;
    expect(count(players, (o) => magenta(players, o))).toBeGreaterThan(all * 0.95);
    expect(count(gm, (o) => teal(gm, o))).toBeGreaterThan(all * 0.95);
    expect(count(gm, (o) => magenta(gm, o))).toBe(0);
  });

  it('draws the levels below into a picture of the scene (a snapshot\'s thumbnail) in the GM\'s look, through the picture\'s own frame', async () => {
    const halves = paintedTexture(MAP, MAP, (x) => (x < MAP / 2 ? [220, 30, 220] : [30, 200, 200]));
    const view = await openLevelsView({ map: MAP, pane: PANE, below: halves });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(0, 0, 512, 512) } }, { v: viewer('v', 60, 60) });
    // The canvas looks at the left half; the picture frames the right half at half a pixel per world pixel.
    view.viewport.scale.set(1);
    view.viewport.position.set(0, 0);
    const renderer = view.app.renderer as WebGLRenderer;
    const picture = (frame: { x: number; y: number; resolution: number; width?: number; height?: number }): Uint8ClampedArray => {
      const texture = view.controller.renderer.renderForFrame(frame, () => renderer.generateTexture({ target: view.viewport, frame: new Rectangle(frame.x, frame.y, 256, 512), resolution: frame.resolution }));
      try {
        return renderer.extract.pixels({ target: texture }).pixels;
      } finally {
        texture.destroy(true);
      }
    };
    const teal = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o + 1]! > pixels[o]! + 40 && pixels[o + 2]! > pixels[o]! + 40;
    const count = (pixels: Uint8ClampedArray, test: (o: number) => boolean): number => {
      let n = 0;
      for (let o = 0; o < pixels.length; o += 4) if (test(o)) n++;
      return n;
    };
    const framed = picture({ x: 256, y: 0, resolution: 0.5, width: 256, height: 512 });
    const pixels = framed.length / 4;
    expect(pixels).toBe(128 * 256);
    expect(count(framed, (o) => teal(framed, o))).toBeGreaterThan(pixels * 0.95);
    expect(count(framed, (o) => magenta(framed, o))).toBe(0);
    // A frame without a size draws nothing below: its openings show nothing.
    const bare = picture({ x: 256, y: 0, resolution: 0.5 });
    expect(count(bare, (o) => teal(bare, o))).toBe(0);
    // The canvas still shows its own level below afterwards.
    const canvas = view.gmCanvas(1, 0, 0);
    expect(count(canvas, (o) => magenta(canvas, o))).toBeGreaterThan(PANE * PANE * 0.95);
  });

  it('draws the canvas\'s level below in its own hook, after the player window\'s frame took its own, through the canvas\'s camera', async () => {
    const halves = paintedTexture(MAP, MAP, (x) => (x < MAP / 2 ? [220, 30, 220] : [30, 200, 200]));
    const view = await openLevelsView({ map: MAP, pane: PANE, below: halves });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(0, 0, 512, 512) } }, { v: viewer('v', 60, 60) });
    // The canvas looks at the right half; the player window's frame, taken first in the same render, at the left.
    view.viewport.scale.set(1);
    view.viewport.position.set(-256, 0);
    let framed: Uint8ClampedArray | null = null;
    const stop = setBeforeRender(view.app, () => {
      const camera = { x: view.viewport.x, y: view.viewport.y };
      framed = view.playerFrame(1, 0, 0).slice();
      view.viewport.position.set(camera.x, camera.y);
    });
    requestRender(view.app);
    view.displayFrames(1);
    const canvas = copiedPixel(view.app.canvas as HTMLCanvasElement, PANE / 2, PANE / 2);
    stop();
    expect(framed).not.toBeNull();
    const left = framed!;
    const o = ((PANE / 2) * PANE + PANE / 2) * 4;
    expect(magenta(left, o)).toBe(true);
    // The canvas shows teal, the right half: its own picture, not the one the frame left bound.
    expect(canvas[1]! > canvas[0]! + 60 && canvas[2]! > canvas[0]! + 60).toBe(true);
  });

  it('shows nothing of a level below until its picture is ready, then shows it', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE, holdBelowImage: true });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(100, 100, 200, 200) } }, { v: viewer('v', 60, 60) });
    const at = (pixels: Uint8ClampedArray): number => ((PANE / 2) * PANE + PANE / 2) * 4;
    const before = view.playerFrame(PANE / MAP, 0, 0);
    expect(Math.max(before[at(before)]!, before[at(before) + 1]!, before[at(before) + 2]!)).toBeLessThanOrEqual(1);
    view.releaseBelowImage();
    await view.settle();
    const after = view.playerFrame(PANE / MAP, 0, 0);
    expect(magenta(after, at(after))).toBe(true);
  });

  it('shows nothing below while the graphics context is lost, and the level below again once it is restored', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(100, 100, 200, 200) } }, { v: viewer('v', 60, 60) });
    // Drawing below asks for nothing while the context is gone.
    await resetContext(view.app.renderer as WebGLRenderer, () => expect(() => view.controller.renderer.prepareBelow?.()).not.toThrow());
    view.store.setState({ objects: { ...view.store.getState().objects } });
    await view.settle();
    await view.settle();
    const frame = view.playerFrame(PANE / MAP, 0, 0);
    const o = ((PANE / 2) * PANE + PANE / 2) * 4;
    expect(magenta(frame, o)).toBe(true);
  });

  it('gives the view over to the line-of-sight fallback when the lighting of the level below stops', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(100, 100, 200, 200) } }, { v: viewer('v', 60, 60) });
    const host = view.controller.renderer as unknown as { view: { levelsBelow: { levels: Map<string, { engine: { fail(error: unknown): void } }> } } };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    host.view.levelsBelow.levels.get('ground')!.engine.fail(new Error('a pass threw'));
    view.store.setState({ objects: { ...view.store.getState().objects } });
    await view.settle();
    error.mockRestore();
    expect((view.controller.renderer as unknown as { view: unknown }).view).toBeInstanceOf(CanvasLightingFallback);
  });

  it('draws the openings, the level below and both composites with every uniform and draw valid (strict GL)', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    const watch = watchGl((view.app.renderer as WebGLRenderer).gl);
    try {
      await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(100, 100, 200, 200) } }, { v: viewer('v', 60, 60), m: { id: 'm', kind: 'token', x: 200, y: 200, imagePath: 'm.png', level: 'ground' } as TokenEntity });
      view.playerFrame(PANE / MAP, 0, 0);
      view.gmCanvas(PANE / MAP, 0, 0);
      expect(watch.draws()).toBeGreaterThan(10);
      expect(watch.findings).toEqual([]);
    } finally {
      watch.stop();
    }
  });

  it('saves what the level below remembers before the view takes that level up, and nothing writes it twice', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(100, 100, 200, 200) } }, { v: viewer('v', 60, 60) });
    // Every save of the ground floor's memory, as the memories hand it to the store.
    const writes: string[] = [];
    const save = view.store.getState().setExploredMask;
    view.store.setState({
      setExploredMask: (dataUrl, level) => {
        if ((level ?? 'ground') === 'ground' && dataUrl) writes.push(dataUrl);
        save(dataUrl, level);
      },
    });
    // The view goes down to the ground floor while the memory below still waits to be saved.
    view.store.getState().setViewedLevel('ground');
    await view.settle();
    await new Promise((resolve) => setTimeout(resolve, 2300));
    await view.settle();
    // One save, the level below's, before the view read the ground floor's memory; no later one over it.
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^data:image\/png/);
    const frame = view.playerFrame(PANE / MAP, 0, 0);
    const o = ((PANE / 2) * PANE + PANE / 2) * 4;
    // Remembered: the floor seen through the opening shows as memory on its own level.
    expect(frame[o]! + frame[o + 1]! + frame[o + 2]!).toBeGreaterThan(3);
  }, 30_000);
});
