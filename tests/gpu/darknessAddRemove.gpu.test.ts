import { Application, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import { watchGl, type GlWatch } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { LightingRenderer, type LightingUnavailable } from '../../src/app/pixi/lighting/LightingRenderer';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import { openLitView } from '../helpers/litView';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 256;
const PANE = { width: MAP, height: MAP };
const TORCH = { id: 'torch', kind: 'light', x: 60, y: 60, emission: { bright: 2, dim: 4, color: '#ffc080', intensity: 1, animation: 'none' } } as LightSource;
const DARKNESS = { id: 'dark', kind: 'light', x: 128, y: 128, emission: { bright: 0, dim: 3, color: '#000000', intensity: 1, animation: 'none', darkness: true } } as LightSource;

function token(id: string, x: number, y: number): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision: { enabled: true, range: 20 } } as TokenEntity;
}

function canvasPixels(app: Application): Uint8ClampedArray {
  app.renderer.render({ container: app.stage });
  const copy = new OffscreenCanvas(app.canvas.width, app.canvas.height).getContext('2d', { willReadFrequently: true })!;
  copy.drawImage(app.canvas, 0, 0);
  return copy.getImageData(0, 0, app.canvas.width, app.canvas.height).data;
}

function brightest(pixels: Uint8ClampedArray): number {
  let most = 0;
  for (let i = 0; i < pixels.length; i += 4) most = Math.max(most, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
  return most;
}

/** What the console was told during a test. */
function listenToConsole(): { warnings: string[]; errors: string[] } {
  const said = { warnings: [] as string[], errors: [] as string[] };
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { said.warnings.push(args.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { said.errors.push(args.map(String).join(' ')); });
  return said;
}

/** No error and no warning about a bind group, the sign of a texture destroyed while a shader held it. */
function expectNothingSaid(said: { warnings: string[]; errors: string[] }): void {
  expect(said.warnings.filter((warning) => warning.includes('BindGroup'))).toEqual([]);
  expect(said.errors).toEqual([]);
}

interface PlayerPage {
  app: Application;
  renderer: LightingRenderer;
  watch: GlWatch | null;
  unavailable: () => LightingUnavailable | null;
  frames: (count: number) => void;
  /** One sight message: every object made anew, as the page's copy of the store writes it; the darkness stands beside the token. */
  message: (x: number, darkness: boolean) => void;
}

/**
 * A source of magical darkness placed over a token in a lit scene and deleted again (#515): the
 * map must come back as it was at every quality, without a texture destroyed while a shader still
 * holds it; and where the players' page draws with another renderer than WebGL, the lighting
 * stops at once instead of throwing from PIXI once a darkness is drawn.
 */
describe('a source of magical darkness added and deleted again', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
  });

  /** The players' page as it lights a scene: its own stage and Atlas's `LightingRenderer` in the players' view. */
  async function openPlayerPage(preference: 'webgl' | 'canvas', level: LightingQualityLevel): Promise<PlayerPage> {
    const app = new Application();
    await app.init({ preference, width: MAP, height: MAP, antialias: true, useBackBuffer: true, resolution: 1.5, autoStart: false, backgroundColor: 0x101820 });
    const scheduler = new RenderScheduler(app);
    const viewport = new Viewport({ screenWidth: MAP, screenHeight: MAP, worldWidth: MAP, worldHeight: MAP, events: app.renderer.events, ticker: app.ticker });
    viewport.sortableChildren = true;
    const floor = new Sprite(Texture.WHITE);
    floor.tint = 0x8899aa;
    floor.setSize(MAP, MAP);
    viewport.addChild(floor);
    app.stage.addChild(viewport);
    const store: ViewAtlasStore = createViewAtlasStore(createInMemoryApp().app, `darkness-page-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/page.atlasmap');
    let unavailable: LightingUnavailable | null = null;
    const renderer = new LightingRenderer({
      app, viewport, store, measurement: () => resolveMeasurementSettings(undefined, null), bounds: () => ({ width: MAP, height: MAP }), albedo: () => null,
      paceStamps: true, onUnavailable: (reason) => { unavailable = reason; },
      quality: { current: () => LIGHTING_QUALITY[level], onChange: () => () => undefined },
    });
    renderer.modeLayer.visible = true;
    const watch = preference === 'webgl' ? watchGl((app.renderer as WebGLRenderer).gl) : null;
    cleanup.push(() => {
      watch?.stop();
      renderer.destroy();
      scheduler.destroy();
      viewport.destroy({ children: true });
      app.destroy(true, { children: true });
    });
    let time = 1000;
    return {
      app, renderer, watch,
      unavailable: () => unavailable,
      frames: (count) => { for (let i = 0; i < count; i++) app.ticker.update(time += 16); },
      message: (x, darkness) => store.setState((s) => ({
        lighting: { enabled: true, ambient: 0.3 },
        objects: {
          ...s.objects,
          tokens: { ada: token('ada', x, 128) },
          lights: { torch: { ...TORCH, emission: { ...TORCH.emission } }, ...(darkness && { dark: { ...DARKNESS, x: x + 20, emission: { ...DARKNESS.emission } } }) },
        },
      })),
    };
  }

  it.each([...LIGHTING_QUALITY_LEVELS])('leaves the lit map as it was at %s', async (level) => {
    const said = listenToConsole();
    const view = await openLitView({ pane: PANE, map: MAP, quality: LIGHTING_QUALITY[level], resolution: 2 });
    cleanup.push(() => view.dispose());
    const watch = watchGl((view.app.renderer as WebGLRenderer).gl);
    cleanup.push(() => watch.stop());
    const { store, displayFrames } = view;
    store.getState().setSceneLighting({ enabled: true, ambient: 0.5 });
    // The players' picture, as the player page shows it
    store.getState().setGMView(false);
    store.setState((s) => ({ objects: { ...s.objects, tokens: { ada: token('ada', 128, 128) } } }));
    store.getState().addLight({ x: TORCH.x, y: TORCH.y, emission: TORCH.emission });
    displayFrames(20);
    const before = canvasPixels(view.app);
    expect(brightest(before)).toBeGreaterThan(60);

    for (let round = 0; round < 3; round++) {
      const id = store.getState().addLight({ x: DARKNESS.x, y: DARKNESS.y, emission: DARKNESS.emission });
      displayFrames(20);
      const dark = canvasPixels(view.app);
      // Below the token, past its footprint: it sees nothing while it stands in the darkness
      const below = ((MAP + 90) * MAP * 2 + MAP) * 4;
      expect(dark[below]! + dark[below + 1]! + dark[below + 2]!).toBeLessThan(before[below]! + before[below + 1]! + before[below + 2]! - 30);
      store.getState().deleteLight(id);
      displayFrames(20);
    }

    const after = canvasPixels(view.app);
    expect(watch.findings).toEqual([]);
    expectNothingSaid(said);
    let differing = 0;
    for (let i = 0; i < after.length; i += 4) {
      if (Math.abs(after[i]! - before[i]!) + Math.abs(after[i + 1]! - before[i + 1]!) + Math.abs(after[i + 2]! - before[i + 2]!) > 6) differing++;
    }
    expect(differing).toBe(0);
  });

  it('keeps drawing while a token walks along walls into and out of the darkness and the quality changes under it', async () => {
    const said = listenToConsole();
    const view = await openLitView({ pane: PANE, map: MAP, quality: LIGHTING_QUALITY.saver, resolution: 2 });
    cleanup.push(() => view.dispose());
    const watch = watchGl((view.app.renderer as WebGLRenderer).gl);
    cleanup.push(() => watch.stop());
    const { store, displayFrames } = view;
    const state = store.getState();
    state.setSceneLighting({ enabled: true, ambient: 0.1 });
    state.setGMView(false);
    state.addWall({ type: 'solid', p1: { x: 40, y: 100 }, p2: { x: 220, y: 100 } });
    state.addWall({ type: 'solid', p1: { x: 220, y: 100 }, p2: { x: 220, y: 220 } });
    state.addWall({ type: 'door', closed: false, p1: { x: 120, y: 100 }, p2: { x: 150, y: 100 } });
    state.addLight({ x: TORCH.x, y: TORCH.y, emission: { ...TORCH.emission, animation: 'torch' } });
    store.setState((s) => ({ objects: { ...s.objects, tokens: { ada: token('ada', 50, 120) } } }));
    displayFrames(10);
    const levels = [...LIGHTING_QUALITY_LEVELS];
    for (let step = 0; step < 24; step++) {
      if (step % 4 === 0) {
        const id = store.getState().addLight({ x: 50 + step * 6, y: 120, emission: { ...DARKNESS.emission, dim: 2 } });
        displayFrames(3);
        if (step % 8 === 0) store.getState().deleteLight(id);
      }
      store.getState().updateToken('ada', { x: 50 + step * 7, y: 112 });
      if (step % 3 === 0) view.setQuality(LIGHTING_QUALITY[levels[(step / 3) % levels.length]!]);
      if (step % 5 === 0) store.getState().setGMView(step % 10 !== 0);
      displayFrames(3);
      canvasPixels(view.app);
    }
    for (const id of Object.keys(store.getState().objects.lights ?? {})) store.getState().deleteLight(id);
    displayFrames(10);
    expect(watch.findings).toEqual([]);
    expectNothingSaid(said);
    expect(brightest(canvasPixels(view.app))).toBeGreaterThan(60);
  });

  it.each([...LIGHTING_QUALITY_LEVELS])('keeps the players\' page lit at %s when every sight message brings its lights anew', async (level) => {
    const said = listenToConsole();
    const page = await openPlayerPage('webgl', level);
    page.message(100, false);
    page.frames(20);
    const before = brightest(canvasPixels(page.app));
    for (let step = 0; step < 30; step++) {
      page.message(100 + step, step >= 5 && step < 20);
      page.frames(2);
    }
    page.frames(20);
    expect(page.unavailable()).toBeNull();
    expect(page.renderer.sightIsCurrent()).toBe(true);
    expect(page.watch?.findings).toEqual([]);
    expectNothingSaid(said);
    expect(brightest(canvasPixels(page.app))).toBeGreaterThan(before - 20);
  });

  it('stops the lighting at once on a players\' page that draws with PIXI\'s Canvas renderer, instead of throwing once a darkness is drawn', async () => {
    const said = listenToConsole();
    const page = await openPlayerPage('canvas', 'high');
    page.message(100, false);
    page.frames(5);
    expect(page.unavailable()).toBe('failed');
    for (let step = 0; step < 10; step++) {
      page.message(100 + step, true);
      page.frames(2);
    }
    expect(said.errors).toHaveLength(1);
    expect(said.errors[0]).toContain('needs WebGL');
  });
});
