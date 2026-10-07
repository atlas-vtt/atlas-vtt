import { EventEmitter } from 'events';
import { afterEach, vi } from 'vitest';
import type { Application, EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { LightPointerHandlers } from '../../src/app/pixi/lighting/LightInteraction';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { SEES_ALL } from '../../src/app/vision/sight';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const memory = vi.hoisted(() => ({ edits: [] as unknown[], resets: 0, watcher: null as SceneLightingDeps['exploredWatcher'] | null }));

vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => {
    memory.watcher = deps.exploredWatcher;
    return {
      modeLayer: { visible: false },
      isEnabled: () => deps.store.getState().lighting.enabled,
      currentSight: () => SEES_ALL,
      sightIsCurrent: () => true,
      lightReaches: () => [],
      ambientLight: () => ({ ambient: 1 }),
      refreshBounds: vi.fn(),
      resetExplored: () => { memory.resets++; },
      editExplored: (edit) => {
        memory.edits.push(edit);
        return true;
      },
      beforeMapUnload: vi.fn(),
      renderForFrame: (_frame, render) => render(),
      destroy: vi.fn(),
    };
  },
}));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
const notices = vi.hoisted(() => [] as boolean[]);
/** The undos (true) and redos (false) of memory edits the GM was told of. */
export const told = notices;
/** What the controller asked of the scene's memory, and who its lighting view reports the memory to. */
export const asked = memory;
vi.mock('../../src/app/pixi/lighting/lightingNotices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/pixi/lighting/lightingNotices')>()),
  showExploredTravelNotice: (undone: boolean) => { notices.push(undone); },
}));

type Press = (x: number, y: number, e: FederatedPointerEvent) => boolean;
type Move = (x: number, y: number, e: FederatedPointerEvent) => void;

/** A lighting controller wired as `TokenRenderer` wires it, over a lighting view that only notes what is asked of the memory. Import this module first: it mocks what the controller imports. */
export interface Setup {
  controller: LightingController;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  canvas: HTMLCanvasElement;
  down: (x: number, y: number) => boolean;
  move: (x: number, y: number) => void;
  up: () => void;
  light: LightPointerHandlers;
  cursor: (x: number, y: number) => string;
  /** The lighting tool, in its explored-memory mode, on a lit scene. */
  enterMode: () => void;
}

let cleanup: (() => void) | null = null;
/** Destroys the controller of the last `setup`; also run after each test. */
export function teardown(): void {
  cleanup?.();
  cleanup = null;
}
afterEach(() => {
  teardown();
  memory.edits = [];
  memory.resets = 0;
  notices.length = 0;
});

export const KEYS = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false } as FederatedPointerEvent;
export const PEEK = { key: 'h', code: 'KeyH', bubbles: true };

/** `prepare` sets the store up before the controller is built on it. */
export function setup(prepare?: (store: ViewAtlasStore) => void): Setup {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: createEl('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app: obsApp } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(obsApp, `lighting-memory-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/memory.atlasmap');
  prepare?.(store);
  const eventBus = new EventEmitter();
  const canvas = createEl('canvas');
  const controller = new LightingController({
    viewport,
    app: { canvas } as unknown as Application,
    store,
    eventBus,
    obsApp,
    viewId: 'memory-view',
    bounds: () => ({ width: 1000, height: 1000 }),
    albedo: () => null,
  });
  const wired: { down?: Press; move?: Move; up?: () => void; light?: LightPointerHandlers; cursor?: (x: number, y: number) => string } = {};
  controller.wire({
    setWallPointerDownHandler: (fn: Press) => { wired.down = fn; },
    setWallPointerMoveHandler: (fn: Move) => { wired.move = fn; },
    setWallPointerUpHandler: (fn: () => void) => { wired.up = fn; },
    setWallDoubleClickHandler: vi.fn(),
    setWallContextMenuHandler: vi.fn(),
    setWallCursorProvider: (fn: (x: number, y: number) => string) => { wired.cursor = fn; },
    setDoorMenuHandlers: vi.fn(),
    setDoorClickHandler: vi.fn(),
    setLightHandlers: (handlers: LightPointerHandlers) => { wired.light = handlers; },
    setPlayerSightProvider: vi.fn(),
    refreshPlayerSight: vi.fn(),
    getSensedOutlineLayer: () => ({ visible: false }),
  } as unknown as TokenRenderer);
  cleanup = () => {
    controller.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  return {
    controller,
    store,
    eventBus,
    canvas,
    // As the token renderer dispatches a press of the lighting tool: lights first, then the tool.
    down: (x, y) => wired.light!.pointerDown(x, y, KEYS) || wired.down!(x, y, KEYS),
    move: (x, y) => wired.move!(x, y, KEYS),
    up: () => wired.up!(),
    light: wired.light!,
    cursor: (x, y) => wired.cursor!(x, y),
    enterMode: () => {
      store.getState().setSceneLighting({ enabled: true });
      store.getState().setActiveTool('wall');
      eventBus.emit('wall-submode-changed', 'explored-memory');
    },
  };
}

export const overlay = (controller: LightingController): { visible: boolean } => controller.gmOverlays().exploredMemory;
export const wallCount = (store: ViewAtlasStore): number => Object.keys(store.getState().objects.walls).length;
