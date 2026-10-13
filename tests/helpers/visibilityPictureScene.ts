import '../setup/obsidianDom';
import { Application, autoDetectRenderer, Container, RenderTexture, Sprite, Texture, Ticker, WebGLRenderer, type Renderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource, SceneLighting } from '../../src/app/types/lightingTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';

/** A lit scene the sweep feeds: walls, tokens that see (cones, senses), lights (beams, darkness), and where to look. */
export interface PictureScene {
  name: string;
  size: number;
  walls: WallSegment[];
  tokens: Record<string, TokenEntity>;
  lights: Record<string, LightSource>;
  lighting?: Partial<SceneLighting>;
  focus: Point;
}

/** Every picture of a scene: frames per camera scale and mode, the explored memory, its saved mask, a thumbnail. */
export interface Pictures {
  frames: Map<string, Uint8ClampedArray>;
  memory: Uint8ClampedArray;
  mask: string | null;
  thumbnail: Uint8ClampedArray;
}

export const VIEW = 320;
export const SCALES = [0.37, 1, 2.5];
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };

function storeOf(scene: PictureScene): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, `pictures-${scene.name}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/pictures.atlasmap');
  store.setState((state) => ({ exploredMask: null, objects: { ...state.objects, tokens: scene.tokens, walls: Object.fromEntries(scene.walls.map((w) => [w.id, w])), lights: scene.lights } }));
  store.getState().setSceneLighting({ enabled: true, ambient: 0.05, sightOnDrop: true, ...scene.lighting });
  return store;
}

/** The canvas as a 2D copy, read in the task that rendered it. */
function canvasPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const context = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')!;
  context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

function look(viewport: Container, scene: PictureScene, scale: number): void {
  viewport.scale.set(scale);
  viewport.position.set(VIEW / 2 - scene.focus.x * scale, VIEW / 2 - scene.focus.y * scale);
}

/**
 * The scene through the real lighting renderer on a canvas set up as the plugin's (antialiased,
 * always through the back buffer): multisampled at resolution 1, plain at 2. Needs fake timers
 * for the explored memory's save.
 */
export async function lightingPictures(scene: PictureScene, resolution: number): Promise<Pictures> {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: VIEW, height: VIEW, antialias: true, useBackBuffer: true, backgroundAlpha: 1, resolution });
  const app = new Application();
  app.renderer = renderer;
  app.ticker = new Ticker();
  const viewport = new Viewport({ screenWidth: VIEW, screenHeight: VIEW, worldWidth: scene.size, worldHeight: scene.size, events: renderer.events });
  app.stage.addChild(viewport);
  const floor = new Sprite(Texture.WHITE);
  floor.setSize(scene.size, scene.size);
  floor.tint = 0x8899aa;
  viewport.addChild(floor);
  const store = storeOf(scene);
  const held: { memory: Texture | null } = { memory: null };
  const lighting = new LightingRenderer({
    viewport, app, store, measurement: () => MEASUREMENT, bounds: () => ({ width: scene.size, height: scene.size }), albedo: () => null,
    exploredWatcher: { setTexture: (texture) => { held.memory = texture; }, memoryTravelled: () => {} },
    onUnavailable: (reason) => { throw new Error(`lighting unavailable: ${reason}`); },
  });
  try {
    const frames = new Map<string, Uint8ClampedArray>();
    for (const scale of SCALES) {
      for (const mode of ['gm', 'player'] as const) {
        look(viewport, scene, scale);
        lighting.modeLayer.visible = mode === 'player';
        renderer.render({ container: app.stage });
        frames.set(`${mode} at ${scale}`, canvasPixels(renderer.canvas));
      }
    }
    lighting.modeLayer.visible = false;
    const target = RenderTexture.create({ width: VIEW, height: VIEW });
    const thumbnail = lighting.renderForFrame({ x: 0, y: 0, resolution: 1 }, () => {
      renderer.render({ container: app.stage, target, clear: true });
      return renderer.extract.pixels({ target }).pixels;
    });
    target.destroy(true);
    if (!(held.memory instanceof RenderTexture)) throw new Error('no explored memory');
    const recorded = renderer.extract.pixels({ target: held.memory }).pixels;
    vi.advanceTimersByTime(2100);
    return { frames, memory: recorded, mask: store.getState().exploredMask, thumbnail };
  } finally {
    lighting.destroy();
    app.ticker.destroy();
    viewport.destroy({ children: true });
    app.stage.destroy();
    renderer.destroy();
  }
}

/** The players' view of the scene through the line-of-sight fallback, on WebGL or on PIXI's Canvas renderer; null when that renderer cannot start. */
export async function fallbackPictures(scene: PictureScene, preference: 'webgl' | 'canvas'): Promise<Uint8ClampedArray[] | null> {
  let renderer: Renderer;
  try {
    renderer = await autoDetectRenderer({ preference, width: VIEW, height: VIEW, antialias: false, backgroundAlpha: 1, backgroundColor: 0x8899aa });
  } catch {
    return null;
  }
  if (renderer.name !== preference) {
    renderer.destroy();
    return null;
  }
  const stage = new Container();
  const viewport = new Container();
  stage.addChild(viewport);
  const store = storeOf(scene);
  const fallback = new CanvasLightingFallback({ viewport: viewport as unknown as Viewport, store, measurement: () => MEASUREMENT, bounds: () => ({ width: scene.size, height: scene.size }) });
  fallback.modeLayer.visible = true;
  try {
    return SCALES.map((scale) => {
      look(viewport, scene, scale);
      renderer.render({ container: stage });
      return canvasPixels(renderer.canvas as HTMLCanvasElement);
    });
  } finally {
    fallback.destroy();
    stage.destroy({ children: true });
    renderer.destroy();
  }
}

/** Bytes that differ between two pictures of one size. */
export function differingBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let differ = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
  return differ;
}
