import '../setup/obsidianDom';
import { Application, Matrix, RenderTexture, Sprite, Texture, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { SightRules } from '../../src/app/vision/sightRules';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LightingRenderer, type LightingUnavailable } from '../../src/app/pixi/lighting/LightingRenderer';
import type { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';

export const SIZE = 256;
export const BOUNDS = { width: SIZE, height: SIZE };
export const MEASUREMENT: MeasurementSettings = {
  mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5,
  diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90,
};
export const DIVIDER: WallSegment = { id: 'divider', kind: 'wall', type: 'solid', p1: { x: 128, y: 0 }, p2: { x: 128, y: SIZE }, closed: true };
export const DOOR: WallSegment = { id: 'door', kind: 'wall', type: 'door', p1: { x: 220, y: 100 }, p2: { x: 220, y: 150 }, closed: true };

export function visionToken(id: string, x: number, hidden = false): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y: 128, size: 1, layer: 0,
    rotation: 0, isHidden: hidden, vision: { enabled: true, range: 5 } };
}

export interface TableSceneOptions {
  tokens?: Record<string, TokenEntity>;
  walls?: Record<string, WallSegment>;
  lighting?: Partial<SceneLighting>;
  rules?: SightRules;
  mask?: string | null;
}

/** Counts differences in actual RGBA bytes without printing an entire texture on failure. */
export function byteDifferences(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  expect(after.length).toBe(before.length);
  let changed = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) changed++;
  return changed;
}

export function rgb(pixels: Uint8ClampedArray, x: number, y: number): number[] {
  return Array.from(pixels.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3));
}

export function tableScenes(): { scene: (options?: TableSceneOptions) => Promise<Awaited<ReturnType<typeof createScene>>> } {
  const cleanups: (() => void)[] = [];
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function createScene(options: TableSceneOptions = {}) {
    const renderer = await createTestRenderer(SIZE);
    const watch = watchGl(renderer.gl);
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const viewport = new Viewport({ screenWidth: SIZE, screenHeight: SIZE, worldWidth: SIZE, worldHeight: SIZE, events: renderer.events });
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(SIZE, SIZE);
    floor.tint = 0x6699cc;
    viewport.addChild(floor);
    const store = createViewAtlasStore(createInMemoryApp().app, 'table-sight-test');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/rooms.atlasmap');
    store.setState(state => ({ exploredMask: options.mask ?? null, objects: {
      ...state.objects, tokens: options.tokens ?? { party: visionToken('party', 60) },
      walls: options.walls ?? { divider: DIVIDER, door: DOOR },
    } }));
    store.getState().setSceneLighting({ enabled: true, ambient: 1, sightOnDrop: true, ...options.lighting });
    let memory: Texture | null = null;
    const unavailable: LightingUnavailable[] = [];
    const lighting = new LightingRenderer({
      viewport, app, store, measurement: () => MEASUREMENT, bounds: () => BOUNDS,
      albedo: () => null, ...(options.rules ? { rules: () => options.rules! } : {}),
      exploredWatcher: { setTexture: texture => { memory = texture; }, memoryTravelled: () => {} },
      onUnavailable: reason => { unavailable.push(reason); },
    });
    const target = RenderTexture.create(BOUNDS);
    const readFrame = (): Uint8ClampedArray => {
      renderer.render({ container: app.stage, target, clear: true });
      expect(unavailable).toEqual([]);
      return renderer.extract.pixels({ target }).pixels;
    };
    cleanups.push(() => {
      lighting.destroy();
      target.destroy(true);
      app.ticker.destroy();
      viewport.destroy({ children: true });
      app.stage.destroy();
      watch.stop();
      expect(watch.findings).toEqual([]);
      renderer.destroy();
    });
    return {
      renderer, store, lighting,
      pixels: (mode: 'gm' | 'player'): Uint8ClampedArray => {
        lighting.renderForFrame({ x: 0, y: 0, resolution: 1 }, () => {});
        lighting.modeLayer.visible = mode === 'player';
        return readFrame();
      },
      reference: (engine: Pick<LightingEngine, 'layer' | 'setView'>): Uint8ClampedArray => {
        viewport.removeChild(lighting.layer);
        viewport.addChild(engine.layer);
        engine.setView(new Matrix(), 1);
        try { return readFrame(); }
        finally { viewport.removeChild(engine.layer); viewport.addChild(lighting.layer); }
      },
      thumbnail: (): Uint8ClampedArray => lighting.renderForFrame({ x: 0, y: 0, resolution: 1 }, readFrame),
      memory: (): Uint8ClampedArray => {
        if (!(memory instanceof RenderTexture)) throw new Error('Missing explored texture');
        return renderer.extract.pixels({ target: memory }).pixels;
      },
      settle: async (): Promise<void> => {
        for (let i = 0; i < 6; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      },
    };
  }
  return { scene: createScene };
}
