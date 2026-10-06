import type { App } from 'obsidian';
import { Container, Graphics, RenderTexture, type Application, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { vi } from 'vitest';
import type { FogOperation } from '../../../types/fogTypes';
import type { ExploredMemoryWatcher } from '../sceneLightingView';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import type { MapBounds } from '../../../vision/visibility';
import { createTestRenderer } from '../engine/__tests__/gpuTestUtils';
import { createSceneLighting } from '../createSceneLighting';
import { LIGHTING_ATTEMPTS_KEY } from '../lightingAttempts';
import type { LightingViewHost } from '../LightingViewHost';
import { SIZE, visionToken } from './rendererHarness';

export const CAVE = 'maps/cave.atlasmap';

/** What a map file holds of its scene, as far as lighting reads it. */
export type SavedScene = Pick<ViewAtlasState, 'lighting' | 'objects' | 'exploredMask'>;

export interface SceneOptions {
  enabled: boolean;
  /** Lighting notes an earlier session left in this device's local storage. */
  noted?: string[] | null;
  exploredMask?: string | null;
  /** Told when the view worked out new sight, as `LightingController` is. */
  onSightChange?: () => void;
  exploredWatcher?: ExploredMemoryWatcher;
}

/** `createSceneLighting` over a real renderer, with the store, storage and ticker a map view gives it. */
export interface Scene {
  renderer: WebGLRenderer;
  viewport: Container;
  store: ViewAtlasStore;
  host: LightingViewHost;
  setExploredMask: ReturnType<typeof vi.fn>;
  /** The lighting notes in this device's local storage. */
  noted: () => unknown;
  switchLighting: (enabled: boolean) => void;
  /** The vision token is moved, as a drag writes it to the store. */
  moveToken: (x: number, y: number) => void;
  /** A change to the scene's lighting that leaves sight as it is, e.g. `{ ambientColor }`. */
  setLighting: (changes: Partial<ViewAtlasState['lighting']>) => void;
  /** A fog-only update, preserving every lighting and source record. */
  setFog: (fog: Record<string, FogOperation>) => void;
  /** The store writes and lighting calls of `MapService.loadMap`, in its order. */
  loadMap: (path: string, saved: SavedScene, bounds: MapBounds) => void;
  /** `loadMap` up to the rehydrated scene: the store holds it, and the loading screen is still up. */
  startLoad: (path: string, saved: SavedScene, bounds: MapBounds) => void;
  /** The loading screen goes: the last write of a load. */
  finishLoad: () => void;
  tick: () => void;
  renderStage: () => void;
  dispose: () => void;
}

export function litScene(tokenX: number, tokenY: number): SavedScene {
  return {
    lighting: { enabled: true, ambient: 0 },
    objects: { walls: {}, lights: {}, tokens: { t: visionToken(tokenX, tokenY, 5) } },
    exploredMask: null,
  } as unknown as SavedScene;
}

export async function createScene({ enabled, noted = null, exploredMask = null, onSightChange, exploredWatcher }: SceneOptions): Promise<Scene> {
  const renderer = await createTestRenderer(SIZE);
  const viewport = new Container();
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  const setExploredMask = vi.fn();
  const listeners = new Set<(state: ViewAtlasState, previous: ViewAtlasState) => void>();
  let bounds: MapBounds = { width: SIZE, height: SIZE };
  let state = {
    mapPath: CAVE,
    isMapLoading: false,
    grid: null,
    heldTokens: {},
    setExploredMask,
    exploredEdits: 0,
    setExploredEdits: (exploredEdits: number): void => write({ exploredEdits }),
    ...litScene(100, 128),
    lighting: { enabled, ambient: 0 },
    exploredMask,
  } as unknown as ViewAtlasState;
  const write = (patch: Partial<ViewAtlasState>): void => {
    const previous = state;
    state = { ...state, ...patch };
    // As zustand notifies: a listener removed by an earlier one in the round is not called.
    listeners.forEach((listener) => listener(state, previous));
  };
  const store = {
    getState: () => state,
    subscribe: (listener: (state: ViewAtlasState, previous: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)),
  } as unknown as ViewAtlasStore;
  const startLoad = (path: string, saved: SavedScene, mapBounds: MapBounds): void => {
    host.beforeMapUnload(); // 'map-unloading'
    write({ isMapLoading: true }); // setMapLoading(true, 0)
    write({ mapPath: path }); // setMapPath
    write({ lighting: { enabled: false, ambient: 0.1 }, exploredMask: null, exploredEdits: 0, objects: { ...state.objects, walls: {}, lights: {}, tokens: {} } }); // clearMapState
    bounds = mapBounds;
    host.refreshBounds(); // the map image is in
    write(saved); // persist.rehydrate
  };
  const finishLoad = (): void => write({ isMapLoading: false });
  const storage = new Map<string, unknown>([[LIGHTING_ATTEMPTS_KEY, noted]]);
  const obsApp = {
    loadLocalStorage: (key: string): unknown => storage.get(key) ?? null,
    saveLocalStorage: (key: string, data: unknown): void => void storage.set(key, data),
  } as unknown as App;
  const ticks: (() => void)[] = [];
  const app = { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: (tick: () => void) => ticks.splice(ticks.indexOf(tick), 1) } } as unknown as Application;
  const host = createSceneLighting({
    viewport: viewport as unknown as Viewport,
    app,
    store,
    obsApp,
    measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
    bounds: () => bounds,
    albedo: () => null,
    ...(onSightChange && { onSightChange }),
    ...(exploredWatcher && { exploredWatcher }),
  });
  return {
    renderer,
    viewport,
    store,
    host,
    setExploredMask,
    noted: () => storage.get(LIGHTING_ATTEMPTS_KEY) ?? null,
    switchLighting: (on) => write({ lighting: { ...state.lighting, enabled: on } }),
    moveToken: (x, y) => write({ objects: { ...state.objects, tokens: { t: visionToken(x, y, 5) } } }),
    setLighting: (changes) => write({ lighting: { ...state.lighting, ...changes } }),
    setFog: (fog) => write({ objects: { ...state.objects, fog } }),
    loadMap: (path, saved, mapBounds) => {
      startLoad(path, saved, mapBounds);
      finishLoad();
    },
    startLoad,
    finishLoad,
    tick: () => [...ticks].forEach((tick) => tick()),
    renderStage: () => renderer.render({ container: viewport, target, clear: true }),
    dispose: () => {
      host.destroy();
      viewport.destroy({ children: true });
      target.destroy(true);
      renderer.destroy();
    },
  };
}

/** The engine's layer in the viewport, while the engine lights the view. */
export function engineLayer(viewport: Container): Container | undefined {
  return viewport.children.find((child) => child.label === 'lighting');
}

/** The fallback's darkness in the viewport, while line of sight stands in. */
export function darkness(viewport: Container): Graphics | undefined {
  return viewport.children.find((child): child is Graphics => child instanceof Graphics);
}

/** Every program link fails from now on, as on a driver that rejects the shaders. */
export function breakLinking(renderer: WebGLRenderer): void {
  const { gl } = renderer;
  const original = gl.getProgramParameter.bind(gl);
  vi.spyOn(gl, 'getProgramParameter').mockImplementation((program: WebGLProgram, name: number): unknown => (name === gl.LINK_STATUS ? false : original(program, name)));
}
