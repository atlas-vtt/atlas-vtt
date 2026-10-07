import '../setup/obsidianDom';
import { Application, Container, FederatedPointerEvent, RenderTexture, Sprite, Texture, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { afterEach, expect, vi } from 'vitest';

vi.mock('events', async () => import('eventemitter3'));
import { GridSystem } from '../../src/app/grid/GridSystem';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { MeasureRenderer } from '../../src/app/pixi/MeasureRenderer';
import { captureWithLayerVisibility, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';
import { gmPictureLayers, playerFrameLayers, wirePlayerMeasurements } from './playerMeasureWiring';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { DEFAULT_SETTINGS } from '../../src/app/services/atlasSettings';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { destroyTree } from '../../src/app/pixi/utils/destroyTree';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { TokenPerception } from '../../src/app/vision/tokenPerception';
import type { TokenEntity } from '../../src/app/types';
import type { FogOperation } from '../../src/app/types/fogTypes';

export const SIZE = 256;
/** Cells of 40 px: a size-1 token is 36 px wide, centred on a cell centre (20, 60, 100, ...). */
export const CELL = 40;

export interface PlayerViewScene {
  app: Application;
  tokens: TokenRenderer;
  fog: FogOfWarRenderer;
  measure: MeasureRenderer;
  store: ReturnType<typeof createViewAtlasStore>;
  events: EventEmitter;
  /** The scene's lighting as the players see it: `unseen`, `sensed` or `seen` per token; none on an unlit scene. */
  lighting: { perception: TokenPerception | undefined; peeking: boolean };
  setFog(operations: Record<string, FogOperation>): void;
  /** Adds tokens and waits until they are drawn, with what they load later (a hidden token's icon). */
  add(...tokens: Array<Partial<TokenEntity> & { id: string; x: number; y: number }>): Promise<void>;
  /** Waits until the canvas stops changing: parts that load on their own have arrived. */
  settle(): Promise<void>;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void;
  /** The measure tool, left active, from (x0, y0) to (x1, y1); released unless `hold`. */
  measureFrom(x0: number, y0: number, x1: number, y1: number, hold?: boolean): void;
  /** The canvas as the GM's view shows it now (session view and the peek included). */
  canvas(): Uint8ClampedArray;
  /** A players' frame, composed as the player window's capture composes it. */
  frame(): Uint8ClampedArray;
  /** What that capture changes on the stage. */
  frameLayers(): LayerVisibility[];
  /** A picture of the scene (a thumbnail), always the GM's. */
  thumbnail(): Uint8ClampedArray;
  /** Shows or ends the peek, as the lighting's session view does. */
  peek(held: boolean): void;
}

export function playerViewScenes(): { scene: () => Promise<PlayerViewScene> } {
  const cleanups: Array<() => void> = [];
  afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

  async function createScene(): Promise<PlayerViewScene> {
    const renderer = await createTestRenderer(SIZE);
    const watch = watchGl(renderer.gl);
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const viewport = new Viewport({ screenWidth: SIZE, screenHeight: SIZE, worldWidth: SIZE, worldHeight: SIZE, events: renderer.events });
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.tint = 0x202020;
    floor.setSize(SIZE, SIZE);
    viewport.addChild(floor);
    const obsidian = createInMemoryApp().app;
    const store = createViewAtlasStore(obsidian, 'player-view-test');
    store.getState().setPersistenceEnabled(false);
    store.setState({ mapPath: 'maps/a.atlasmap', isMapLoading: false, isGMView: true });
    const events = new EventEmitter();
    const grid = new GridSystem(app, viewport, floor, { size: CELL, enabled: false, color: 0xffffff });
    const tokens = new TokenRenderer(obsidian, viewport, grid, () => {}, store, events, 'player-view-test');
    tokens.setPixiApp(app);
    const fog = new FogOfWarRenderer(viewport, app, events, store);
    viewport.addChild(fog.getContainer());
    tokens.setFogCoverageProvider(() => fog.getCommittedCoverage());
    const lighting: PlayerViewScene['lighting'] = { perception: undefined, peeking: false };
    // As the lighting wires it: its sight while the canvas shows the players' view.
    const showsPlayers = (): boolean => lighting.peeking || !store.getState().isGMView;
    tokens.setPlayerSightProvider(() => (showsPlayers() ? lighting.perception : undefined), showsPlayers);
    const measure = new MeasureRenderer(viewport, events, store, grid);
    const unwire = wirePlayerMeasurements({ measure, tokens, store, grid, lighting: () => lighting.perception });
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    cleanups.push(() => {
      unwire();
      measure.destroy();
      tokens.destroy();
      fog.destroy();
      grid.destroy();
      target.destroy(true);
      app.ticker.destroy();
      destroyTree(viewport);
      app.stage.destroy();
      watch.stop();
      expect(watch.findings).toEqual([]);
      renderer.destroy();
    });
    const read = (layers: readonly LayerVisibility[]): Uint8ClampedArray => {
      let result: Uint8ClampedArray = new Uint8ClampedArray();
      captureWithLayerVisibility(layers, () => {}, () => {
        renderer.render({ container: app.stage, target, clear: true });
        result = renderer.extract.pixels({ target }).pixels;
      });
      return result;
    };
    const pointer = (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void => {
      const event = new FederatedPointerEvent(renderer.events.rootBoundary);
      event.button = 0;
      event.global.set(x, y);
      viewport.emit(type, event);
    };
    const scene: PlayerViewScene = {
      app, tokens, fog, measure, store, events, lighting, pointer,
      setFog(operations): void { store.setState((state) => ({ objects: { ...state.objects, fog: operations } })); },
      async add(...added): Promise<void> {
        for (const token of added) store.getState().addToken({ kind: 'token', imagePath: '', size: 1, ...token } as TokenEntity);
        await expect.poll(() => added.every(({ id }) => tokens.getTokenSprites()[id] instanceof Container)).toBe(true);
        await this.settle();
      },
      async settle(): Promise<void> {
        let last = read([]);
        for (let quiet = 0, wait = 0; quiet < 5 && wait < 100; wait++) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          const next = read([]);
          quiet = samePixels(next, last) ? quiet + 1 : 0;
          last = next;
        }
      },
      measureFrom(x0, y0, x1, y1, hold = false): void {
        store.getState().setActiveTool('measure');
        pointer('pointerdown', x0, y0);
        pointer('pointermove', x1, y1);
        if (!hold) pointer('pointerup', x1, y1);
      },
      canvas: () => read([]),
      frameLayers: () => playerFrameLayers({ measure, tokens, fog, settings: DEFAULT_SETTINGS.localPlayerView, lighting: lighting.perception }),
      frame(): Uint8ClampedArray { return read(this.frameLayers()); },
      thumbnail(): Uint8ClampedArray {
        let result: Uint8ClampedArray = new Uint8ClampedArray();
        captureSceneFrame({ gmViewLayers: gmPictureLayers({ measure, tokens, fog }), markerLayers: [], lighting: undefined }, { x: 0, y: 0, width: SIZE, height: SIZE } as never, () => {
          renderer.render({ container: app.stage, target, clear: true });
          result = renderer.extract.pixels({ target }).pixels;
        });
        return result;
      },
      peek(held): void {
        lighting.peeking = held;
        tokens.refreshPlayerSight();
      },
    };
    return scene;
  }
  return { scene: createScene };
}

/** Whether two pictures differ anywhere. */
export function samePixels(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** How many pixels of two pictures differ. */
export function differingPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++;
  }
  return count;
}

/** How many pixels of two pictures differ within the rectangle from (x0, y0) to (x1, y1). */
export function differingIn(a: Uint8ClampedArray, b: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * SIZE + x) * 4;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++;
    }
  }
  return count;
}
