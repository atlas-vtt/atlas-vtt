import '../setup/obsidianDom';
import { Container, type Application, type Texture, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { ExploredEdit } from '../../src/app/lighting/exploredEdits';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore, type HistoryState } from '../../src/app/stores/history';
import type { StrokeShape } from '../../src/app/tools/shapeStroke';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import type { MapBounds } from '../../src/app/vision/visibility';
import type { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import { createTestRenderer, readRgba, renderThroughEngine, type PixelReader } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl, type GlWatch } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import type { ExploredTexture } from '../../src/app/pixi/lighting/ExploredTexture';
import { LightingRenderer, type LightingUnavailable } from '../../src/app/pixi/lighting/LightingRenderer';
import { SIZE, nextFrame } from '../../src/app/pixi/lighting/__tests__/rendererHarness';

/**
 * A dark map of two rooms, a wall between them from top to bottom at x = 128. The party's token
 * stands in the left one and sees 70 px; a lamp and a goblin are in the right one.
 */
export const WALL = { type: 'solid' as const, p1: { x: 128, y: 0 }, p2: { x: 128, y: SIZE }, closed: true };
export const PARTY = { id: 'party', kind: 'token', imagePath: 'p.png', x: 60, y: 128, vision: { enabled: true, range: 5 } } as TokenEntity;
export const GOBLIN = { id: 'goblin', kind: 'token', imagePath: 'g.png', x: 200, y: 100 } as TokenEntity;
const LAMP = { x: 200, y: 128, emission: { bright: 5, dim: 10, color: '#ffffff', intensity: 1, animation: 'none' as const } };
/** The right room, from the wall's centre line to the map's edge. */
export const RIGHT_ROOM: StrokeShape = { type: 'rectangle', x: 128, y: 0, width: 128, height: SIZE };
export const reveal = (area: ExploredEdit['area']): ExploredEdit => ({ mode: 'reveal', area });
export const forget = (area: ExploredEdit['area']): ExploredEdit => ({ mode: 'forget', area });

export interface MemoryScene {
  renderer: WebGLRenderer;
  store: ViewAtlasStore;
  lighting: LightingRenderer;
  history: () => HistoryState;
  /** The memory's coverage (0..255) at a point of the map. */
  redAt: (x: number, y: number) => number;
  /** Every texel of the memory as one number (FNV-1a): two textures are equal when these are. */
  textureHash: () => number;
  /** The memory's texels, four bytes each, top row first. */
  texels: () => Uint8ClampedArray;
  /** What the players see of a white map, one screen pixel per world pixel. */
  players: () => PixelReader;
  /** Every texture the GM's overlay was handed, in order; null when it was told there is none. */
  overlayTextures: (Texture | null)[];
  /** What the overlay was told of undo (true) and redo (false). */
  travels: boolean[];
  /** Why the engine gave up, each time it did. */
  unavailable: LightingUnavailable[];
  /** Moves the party's token, so its sight is worked out and recorded anew. */
  moveParty: (x: number, y: number) => void;
  /** Destroys the lighting view, as when the Canvas fallback takes its place or the map view closes. */
  destroyLighting: () => void;
  settle: () => Promise<void>;
}

export interface MemorySceneOptions {
  lighting?: Partial<SceneLighting>;
  exploredMask?: string | null;
  lamp?: boolean;
  /** The map's size, asked for anew on every lighting update; unset, `SIZE` square. */
  bounds?: () => MapBounds;
}

/**
 * The two rooms with the real store, its undo history and the real lighting renderer, for the
 * tests of a `describe`: every stamp, read and write of the memory runs under strict GL, timers
 * that save the memory are faked, and everything is destroyed after each test.
 */
export function memoryScenes(): { scene: (options?: MemorySceneOptions) => Promise<MemoryScene>; unwatch: () => void } {
  const cleanup: (() => void)[] = [];
  let watch: GlWatch | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    watch?.stop();
    expect(watch?.findings ?? []).toEqual([]);
    watch = null;
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function scene(options: MemorySceneOptions = {}): Promise<MemoryScene> {
    const renderer = await createTestRenderer(SIZE);
    watch = watchGl(renderer.gl);
    const store = createViewAtlasStore(createInMemoryApp().app, `memory-edits-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/rooms.atlasmap', exploredMask: options.exploredMask ?? null });
    store.getState().setSceneLighting({ enabled: true, ambient: 0, ...options.lighting });
    store.getState().addObject('walls', WALL);
    store.setState((state) => ({ objects: { ...state.objects, tokens: { party: PARTY, goblin: GOBLIN } } }));
    if (options.lamp !== false) store.getState().addObject('lights', LAMP);
    const history = getHistoryStore(store)!;
    history.getState().clear();

    const viewport = new Container();
    const ticks: (() => void)[] = [];
    const app = { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: vi.fn() } } as unknown as Application;
    const overlayTextures: (Texture | null)[] = [];
    const travels: boolean[] = [];
    const unavailable: LightingUnavailable[] = [];
    const lighting = new LightingRenderer({
      viewport: viewport as unknown as Viewport,
      app,
      store,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds: options.bounds ?? ((): MapBounds => ({ width: SIZE, height: SIZE })),
      albedo: () => null,
      exploredWatcher: { setTexture: (texture) => overlayTextures.push(texture), memoryTravelled: (undone) => travels.push(undone) },
      onUnavailable: (reason) => unavailable.push(reason),
    });
    let destroyed = false;
    const destroyLighting = (): void => {
      if (!destroyed) lighting.destroy();
      destroyed = true;
    };
    cleanup.push(() => {
      destroyLighting();
      viewport.destroy({ children: true });
      renderer.destroy();
    });
    const explored = (): ExploredTexture => (lighting as unknown as { memory: { texture: ExploredTexture } }).memory.texture;
    const texels = (): Uint8ClampedArray => readRgba(renderer, explored().texture);
    return {
      renderer,
      store,
      lighting,
      history: () => history.getState(),
      redAt: (x, y) => texels()[(y * explored().texture.width + x) * 4]!,
      textureHash: () => texels().reduce((hash, value) => Math.imul(hash ^ value, 0x01000193), 0x811c9dc5) >>> 0,
      texels,
      players: () => {
        lighting.modeLayer.visible = true;
        const engine = (lighting as unknown as { engine: LightingEngine }).engine;
        engine.flush();
        const at = renderThroughEngine(engine, renderer, { size: SIZE, scale: 1, x: 0, y: 0, map: SIZE });
        lighting.modeLayer.visible = false;
        return at;
      },
      overlayTextures,
      travels,
      unavailable,
      // No undo step of its own: the tests step through the memory's.
      moveParty: (x, y) => history.getState().untracked(() => store.setState((state) => ({ objects: { ...state.objects, tokens: { ...state.objects.tokens, party: { ...PARTY, x, y } } } }))),
      destroyLighting,
      settle: async () => {
        for (let frame = 0; frame < 6; frame++) await nextFrame();
      },
    };
  }

  return {
    scene,
    unwatch: () => {
      watch?.stop();
      watch = null;
    },
  };
}
