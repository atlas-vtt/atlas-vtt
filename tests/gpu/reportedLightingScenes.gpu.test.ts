import '../setup/obsidianDom';
import { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { Application, Sprite, Texture, Ticker, WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightEmission } from '../../src/app/types/lightingTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { LightingRenderer, type LightingUnavailable } from '../../src/app/pixi/lighting/LightingRenderer';
import { resetContext } from '../../src/app/pixi/lighting/__tests__/rendererHarness';
import { watchGl, type GlWatch } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import type { SightRules } from '../../src/app/vision/sightRules';

vi.mock('events', async () => import('eventemitter3'));

const VIEW = 512;
const MAP = { width: 1400, height: 2100 };
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const PATHFINDER: SightRules = { definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!, conditions: [] };
const CARRIED: LightEmission = { bright: 20, dim: 40, color: '#8fa8ff', intensity: 1, animation: 'none' };
const LAMP: LightEmission = { bright: 20, dim: 40, color: '#ffcc88', intensity: 1, animation: 'torch', kind: 'torch' };

/**
 * How the plugin's canvas is set up: a view opened with dynamic lighting off keeps its samples
 * on the canvas and lighting switches the back buffer on, one opened with it on draws through
 * the back buffer all the time. Windows displays are often scaled by half steps.
 */
const CANVASES = [1, 1.5, 2].flatMap((resolution) => [{ useBackBuffer: false, resolution }, { useBackBuffer: true, resolution }]);
type CanvasSetup = (typeof CANVASES)[number];

function wall(id: string, p1: Point, p2: Point, type: WallSegment['type'] = 'solid'): WallSegment {
  return { id, kind: 'wall', type, p1, p2, ...(type === 'door' && { closed: true }) };
}

function token(id: string, x: number, y: number, vision: TokenEntity['vision'] = { enabled: true }): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision };
}

function byId<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  return Object.fromEntries(list.map((item) => [item.id, item]));
}

// A corridor with a door across it and a hall below, as on the map of the report.
const CORRIDOR: WallSegment[] = [
  wall('west', { x: 560, y: 0 }, { x: 560, y: 1050 }),
  wall('east', { x: 840, y: 0 }, { x: 840, y: 1050 }),
  wall('sill-west', { x: 560, y: 620 }, { x: 660, y: 620 }),
  wall('door', { x: 660, y: 620 }, { x: 740, y: 620 }, 'door'),
  wall('sill-east', { x: 740, y: 620 }, { x: 840, y: 620 }),
  wall('hall-north-west', { x: 140, y: 1050 }, { x: 560, y: 1050 }),
  wall('hall-north-east', { x: 840, y: 1050 }, { x: 1300, y: 1400 }),
  wall('hall-west', { x: 140, y: 1050 }, { x: 140, y: 2100 }),
  wall('hall-east', { x: 1300, y: 1400 }, { x: 1300, y: 2100 }),
];
/** A square drawn as one chain of walls that stops short of closing. */
const SQUARE: Point[] = [{ x: 400, y: 400 }, { x: 1000, y: 400 }, { x: 1000, y: 1000 }, { x: 400, y: 1000 }, { x: 400, y: 560 }];

type TokenChange = Partial<Pick<TokenEntity, 'light' | 'vision' | 'x' | 'y'>>;

/** Four tokens with vision, the first with darkvision. */
function party(koss: TokenChange = {}, zorgash: TokenChange = {}): Record<string, TokenEntity> {
  return byId([
    { ...token('zorgash', 610, 420, { enabled: true, senses: [{ id: 'pathfinder2e-darkvision' }] }), ...zorgash },
    token('gyliam', 790, 420),
    { ...token('koss', 700, 540), ...koss },
    token('akhmet', 880, 540),
  ]);
}

/** A map view's canvas, stage and store, with every WebGL call of its renderer checked. */
interface Canvas {
  renderer: WebGLRenderer;
  app: Application;
  viewport: Viewport;
  obsApp: App;
  store: ViewAtlasStore;
  watch: GlWatch;
  /** The stage on the canvas for the GM, for the players and for the GM again, each followed by a frame of the ticker. */
  frames: (view: { modeLayer: { visible: boolean } }) => void;
  set: (objects: Partial<Pick<ViewAtlasState['objects'], 'tokens' | 'walls'>>) => void;
  dispose: () => void;
}

async function openCanvas(setup: CanvasSetup): Promise<Canvas> {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: VIEW, height: VIEW, antialias: true, backgroundAlpha: 1, ...setup });
  const watch = watchGl(renderer.gl);
  const app = new Application();
  app.renderer = renderer;
  app.ticker = new Ticker();
  const ticks: (() => void)[] = [];
  app.ticker.add = ((tick: () => void) => (ticks.push(tick), app.ticker)) as Ticker['add'];
  const viewport = new Viewport({ screenWidth: VIEW, screenHeight: VIEW, worldWidth: MAP.width, worldHeight: MAP.height, events: renderer.events });
  viewport.scale.set(0.3);
  viewport.sortableChildren = true;
  app.stage.addChild(viewport);
  const floor = new Sprite(Texture.WHITE);
  floor.setSize(MAP.width, MAP.height);
  floor.tint = 0x8899aa;
  viewport.addChild(floor);
  const obsApp = createInMemoryApp().app;
  const store = createViewAtlasStore(obsApp, `reported-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/reported.atlasmap');
  return {
    renderer, app, viewport, obsApp, store, watch,
    frames: (view) => {
      for (const players of [false, true, false]) {
        view.modeLayer.visible = players;
        renderer.render({ container: app.stage });
        ticks.forEach((tick) => tick());
      }
    },
    set: (objects) => store.setState((state) => ({ objects: { ...state.objects, ...objects } })),
    dispose: () => {
      watch.stop();
      app.ticker.destroy();
      viewport.destroy({ children: true });
      app.stage.destroy();
      renderer.destroy();
    },
  };
}

/**
 * Two reports of dynamic lighting crashing on Windows (ANGLE's Direct3D backend), one with
 * "Vertex buffer is not big enough for the draw call" in the console. `watchGl` applies that
 * backend's rule to every draw, so the reported steps are replayed under it.
 */
describe('the scenes of the lighting crash reports, drawn under strict GL', () => {
  const cleanup: (() => void)[] = [];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The engine's view of the canvas, as `createSceneLighting` builds it. */
  function light(canvas: Canvas, rules?: SightRules): { lighting: LightingRenderer; unavailable: LightingUnavailable[] } {
    const unavailable: LightingUnavailable[] = [];
    const lighting = new LightingRenderer({
      viewport: canvas.viewport, app: canvas.app, store: canvas.store, measurement: () => MEASUREMENT, bounds: () => MAP, albedo: () => null,
      ...(rules && { rules: () => rules }),
      onUnavailable: (reason) => unavailable.push(reason),
    });
    cleanup.push(canvas.dispose, () => lighting.destroy());
    return { lighting, unavailable };
  }

  it.each(CANVASES)('four tokens with vision, one with darkvision, and a light given to one of them (canvas %o)', async (setup) => {
    const canvas = await openCanvas(setup);
    const { store, set, watch } = canvas;
    set({ tokens: party(), walls: byId(CORRIDOR) });
    store.getState().setSceneLighting({ enabled: true, ambient: 0.1 });
    const { lighting, unavailable } = light(canvas, PATHFINDER);
    const frames = (): void => {
      canvas.frames(lighting);
      // A thumbnail builds the bounce that is still due.
      lighting.renderForFrame({ x: 0, y: 0, resolution: 1 }, () => undefined);
      canvas.frames(lighting);
    };
    frames();
    expect(watch.findings).toEqual([]);

    // Edit Token, Carries a light, Save: the scene's first light.
    set({ tokens: party({ light: CARRIED }) });
    frames();
    expect(watch.findings).toEqual([]);

    // What the report did next: a token moved, the light bearer's vision off, the darkvision taken away.
    for (const tokens of [party({ light: CARRIED, x: 700, y: 700 }), party({ light: CARRIED, vision: { enabled: false } }), party({ light: CARRIED }, { vision: { enabled: true } })]) {
      set({ tokens });
      frames();
    }
    store.getState().toggleDoor('door');
    frames();
    set({ tokens: party({ light: { ...CARRIED, animation: 'torch' } }) });
    frames();
    set({ tokens: party() });
    frames();
    store.getState().setSceneLighting({ enabled: false });
    frames();
    store.getState().setSceneLighting({ enabled: true });
    frames();
    expect(watch.findings).toEqual([]);

    // A graphics reset with the light in the scene, and the scene built again after it.
    set({ tokens: party({ light: CARRIED }) });
    frames();
    await resetContext(canvas.renderer);
    frames();
    expect(watch.findings).toEqual([]);
    expect(unavailable).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(100);
  });

  it.each(CANVASES)('a new scene: walls in a square with an opening, a light in its middle, then lighting switched on (canvas %o)', async (setup) => {
    const canvas = await openCanvas(setup);
    const { store, watch } = canvas;
    const { lighting, unavailable } = light(canvas);
    const frames = (): void => canvas.frames(lighting);
    frames();
    for (let i = 0; i + 1 < SQUARE.length; i++) {
      store.getState().addWall({ type: 'solid', p1: SQUARE[i]!, p2: SQUARE[i + 1]! });
      frames();
    }
    store.getState().addLight({ x: 700, y: 700, emission: LAMP });
    frames();
    expect(watch.findings).toEqual([]);

    store.getState().setSceneLighting({ enabled: true });
    frames();
    frames();
    expect(watch.findings).toEqual([]);

    store.getState().setSceneLighting({ enabled: false });
    frames();
    store.getState().setSceneLighting({ enabled: true });
    frames();
    await resetContext(canvas.renderer);
    frames();
    expect(watch.findings).toEqual([]);
    expect(unavailable).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(100);
  });

  it.each(CANVASES)('the new scene through the lighting controller: the wall tool, the popover of the light, selected tokens (canvas %o)', async (setup) => {
    const canvas = await openCanvas(setup);
    const { store, watch } = canvas;
    const errors = vi.spyOn(console, 'error');
    const controller = new LightingController({
      viewport: canvas.viewport, app: canvas.app, store, eventBus: new EventEmitter(), obsApp: canvas.obsApp, viewId: 'reported', bounds: () => MAP, albedo: () => null,
    });
    cleanup.push(canvas.dispose, () => controller.destroy());
    const ignore = (): void => undefined;
    controller.wire({
      setLightHandlers: ignore, setWallPointerDownHandler: ignore, setWallContextMenuHandler: ignore, setWallPointerMoveHandler: ignore,
      setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore, setDoorMenuHandlers: ignore,
      setDoorClickHandler: ignore, setPlayerSightProvider: ignore, refreshPlayerSight: ignore, getSensedOutlineLayer: () => ({ visible: false }),
    } as unknown as TokenRenderer);
    // The GM's overlays are on the canvas: the view stays the GM's.
    const frames = (): void => canvas.frames({ modeLayer: { visible: false } });

    store.getState().setActiveTool('wall');
    frames();
    for (let i = 0; i + 1 < SQUARE.length; i++) {
      store.getState().addWall({ type: i === 2 ? 'door' : 'solid', p1: SQUARE[i]!, p2: SQUARE[i + 1]!, closed: true });
      frames();
    }
    store.getState().openLightPopover(store.getState().addLight({ x: 700, y: 700, emission: LAMP }));
    canvas.set({ tokens: party() });
    store.getState().setSelection(['zorgash', 'koss']);
    frames();
    expect(watch.findings).toEqual([]);

    store.getState().setSceneLighting({ enabled: true });
    frames();
    store.getState().updateToken('koss', { light: CARRIED });
    frames();
    // Session view and back, then another tool.
    store.getState().setGMView(false);
    frames();
    store.getState().setGMView(true);
    store.getState().setActiveTool('select');
    frames();
    await resetContext(canvas.renderer);
    frames();
    expect(watch.findings).toEqual([]);
    expect(errors.mock.calls).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(100);
  });
});
