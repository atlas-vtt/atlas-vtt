import { Container, RenderTexture, Sprite, Texture, type Application, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { vi } from 'vitest';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import type { TokenEntity } from '../../../types';
import type { SightRules } from '../../../vision/sightRules';
import { createTestRenderer, readRgba } from '../engine/__tests__/gpuTestUtils';
import { ExploredTexture } from '../ExploredTexture';
import { LightingRenderer, type LightingRendererDeps } from '../LightingRenderer';
import { saveExploredMask } from '../exploredMaskSaving';

export const SIZE = 256;
export const SAVE_DELAY = 2000;

export interface Harness {
  renderer: WebGLRenderer;
  lighting: LightingRenderer;
  state: ViewAtlasState;
  setExploredMask: ReturnType<typeof vi.fn>;
  /** Applies a change to the state and tells the renderer, as the store does. */
  change: (patch: Record<string, unknown>) => void;
  /** The explored memory's red channel, 255 where seen. */
  redAt: (x: number, y: number) => number;
  /** Lets every pending mask decode, and what follows it, finish. */
  settle: () => Promise<void>;
  /** Resolves the first mask decode, when it was held with `holdFirstDecode`. */
  releaseFirstDecode: () => void;
  /** One frame of the app's ticker, which the harness does not run. */
  tick: () => void;
  /** Renders the lighting layer as the stage does. */
  renderStage: () => void;
  dispose: () => void;
}

interface HarnessOptions {
  patch?: Record<string, unknown>;
  /** The first mask decode does not finish until `releaseFirstDecode`. */
  holdFirstDecode?: boolean;
  /** The first mask decode fails. */
  failFirstDecode?: boolean;
  attempt?: LightingRendererDeps['attempt'];
  onUnavailable?: LightingRendererDeps['onUnavailable'];
  /** The sight rules of the map's collection; unset, the generic ones. */
  rules?: () => SightRules;
  quality?: LightingRendererDeps['quality'];
}

/** A token with vision; a range (in game units) limits what it sees to a circle. */
export function visionToken(x: number, y = 128, range?: number): TokenEntity {
  return { id: 't', x, y, vision: { enabled: true, ...(range === undefined ? {} : { range }) } } as unknown as TokenEntity;
}

export function tokens(token: TokenEntity): Record<string, unknown> {
  return { objects: { walls: {}, lights: {}, tokens: { t: token } } };
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export async function until(condition: () => boolean): Promise<void> {
  for (let frame = 0; frame < 300 && !condition(); frame++) await nextFrame();
  if (!condition()) throw new Error('condition was not met within 300 frames');
}

/** The saved mask's coverage at a point of the map, read back as an image. */
export async function maskCoverageAt(mask: string, x: number, y: number): Promise<number> {
  const image = new Image();
  image.src = mask;
  await image.decode();
  const canvas = createEl('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(Math.floor((x / SIZE) * image.width), Math.floor((y / SIZE) * image.height), 1, 1).data[3]!;
}

/** Loses the WebGL context and restores it, as a GPU reset does; resolves once PIXI handled the restore. */
export async function resetContext(renderer: WebGLRenderer, whileLost: () => void = (): void => undefined): Promise<void> {
  const ext = renderer.gl.getExtension('WEBGL_lose_context')!;
  const lost = new Promise<void>((resolve) => renderer.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }));
  ext.loseContext();
  await lost;
  whileLost();
  await nextFrame();
  const restored = new Promise<void>((resolve) => renderer.canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true }));
  ext.restoreContext();
  await restored;
}

/** A saved memory that has seen the whole map. */
async function fullMask(renderer: WebGLRenderer): Promise<string> {
  const explored = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
  const white = new Sprite(Texture.WHITE);
  white.setSize(explored.texture.width, explored.texture.height);
  renderer.render({ container: white, target: explored.texture, clear: true });
  const mask = saveExploredMask(explored.toCanvas());
  explored.destroy();
  return mask;
}

export async function createHarness({ patch = {}, holdFirstDecode = false, failFirstDecode = false, attempt, onUnavailable, rules, quality }: HarnessOptions = {}): Promise<Harness> {
  const renderer = await createTestRenderer(SIZE);
  const setExploredMask = vi.fn();
  const listeners = new Set<(state: ViewAtlasState) => void>();
  const state = {
    mapPath: 'a.atlasmap',
    lighting: { enabled: true, ambient: 1 },
    objects: { walls: {}, lights: {}, tokens: {} },
    grid: null,
    exploredMask: await fullMask(renderer),
    heldTokens: {},
    setExploredMask,
    exploredEdits: 0,
    // As the store counts an edit of the memory, or takes one back.
    setExploredEdits: (exploredEdits: number): void => change({ exploredEdits }),
    ...patch,
  } as unknown as ViewAtlasState;
  const change = (next: Record<string, unknown>): void => {
    Object.assign(state, next);
    for (const listener of listeners) listener(state);
  };

  let releaseFirstDecode = (): void => undefined;
  const gate = new Promise<void>((resolve) => (releaseFirstDecode = resolve));
  const decode: (this: HTMLImageElement) => Promise<void> = Reflect.get(HTMLImageElement.prototype, 'decode');
  let calls = 0;
  const decodes = vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) {
    const first = calls++ === 0;
    if (first && failFirstDecode) return Promise.reject(new Error('the image could not be decoded'));
    if (first && holdFirstDecode) return decode.call(this).then(() => gate);
    return decode.call(this);
  });

  const store = {
    getState: () => state,
    subscribe: (listener: (next: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)),
  } as unknown as ViewAtlasStore;
  const ticks: (() => void)[] = [];
  const app = { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: vi.fn() } } as unknown as Application;
  const viewport = new Container();
  const lighting = new LightingRenderer({
    viewport: viewport as unknown as Viewport,
    app,
    store,
    measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
    bounds: () => ({ width: SIZE, height: SIZE }),
    albedo: () => null,
    ...(attempt ? { attempt } : {}),
    ...(onUnavailable ? { onUnavailable } : {}),
    ...(rules ? { rules } : {}),
    ...(quality ? { quality } : {}),
  });
  const explored = (): ExploredTexture => (lighting as unknown as { memory: { texture: ExploredTexture } }).memory.texture;
  const stageTarget = RenderTexture.create({ width: SIZE, height: SIZE });
  return {
    renderer,
    lighting,
    state,
    setExploredMask,
    change,
    redAt: (x, y) => readRgba(renderer, explored().texture)[(y * explored().texture.width + x) * 4]!,
    settle: async () => {
      await Promise.allSettled(decodes.mock.results.map((result) => result.value as Promise<void>));
      await nextFrame();
      await nextFrame();
    },
    releaseFirstDecode: () => releaseFirstDecode(),
    tick: () => ticks.forEach((tick) => tick()),
    renderStage: () => renderer.render({ container: viewport, target: stageTarget, clear: true }),
    dispose: () => {
      lighting.destroy();
      viewport.destroy({ children: true });
      stageTarget.destroy(true);
      renderer.destroy();
    },
  };
}
