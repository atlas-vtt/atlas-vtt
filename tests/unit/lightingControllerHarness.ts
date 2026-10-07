import { EventEmitter } from 'events';
import { afterEach, vi } from 'vitest';
import type { Application, EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { genericLight } from '../mocks/lights';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { LightPointerHandlers } from '../../src/app/pixi/lighting/LightInteraction';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import type { DoorMenuHandlers, TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { SEES_ALL } from '../../src/app/vision/sight';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => {
    // As the engine's view does: a lit scene is built while the view is constructed, and its sight reported.
    if (deps.store.getState().lighting.enabled) deps.onSightChange?.();
    return lightingView(deps);
  },
}));
const lightingView = vi.hoisted(() => (deps: SceneLightingDeps): SceneLightingView => ({
  modeLayer: { visible: false },
  isEnabled: () => deps.store.getState().lighting.enabled,
  currentSight: () => SEES_ALL,
  sightIsCurrent: () => true,
  lightReaches: () => [],
  ambientLight: () => ({ ambient: 1 }),
  refreshBounds: vi.fn(),
  resetExplored: vi.fn(),
  editExplored: vi.fn(() => false),
  beforeMapUnload: vi.fn(),
  renderForFrame: (_frame, render) => render(),
  destroy: vi.fn(),
}));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));
/** The context menu the controller opens. */
export const contextMenuOpened = openContextMenuGlobal;

/** A lighting controller on a store with two lights, wired as `TokenRenderer` wires it. Import this module first: it mocks what the controller imports. */
export interface Setup {
  controller: LightingController;
  store: ViewAtlasStore;
  obsApp: ReturnType<typeof createInMemoryApp>['app'];
  eventBus: EventEmitter;
  viewport: Viewport;
  light: LightPointerHandlers;
  wallDown: (x: number, y: number, e: FederatedPointerEvent) => boolean;
  contextMenu: (x: number, y: number, screenX: number, screenY: number) => void;
  wallMove: (x: number, y: number, e: FederatedPointerEvent) => void;
  /** A torch at (400, 300) and a lantern at (600, 300). */
  torch: string;
  lantern: string;
  click: (x: number, y: number, keys?: { shift?: boolean }) => boolean;
}

const doorMenu: { current: DoorMenuHandlers | null } = { current: null };
let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  openContextMenuGlobal.mockReset();
});

export function event(x: number, y: number, keys: { shift?: boolean } = {}): FederatedPointerEvent {
  return { global: { x, y }, shiftKey: !!keys.shift, ctrlKey: false, metaKey: false, altKey: false } as FederatedPointerEvent;
}

export function setup(): Setup {
  const restoreGraphics = stubJsdomGraphics();
  window.matchMedia = (() => ({ matches: true })) as never;
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const events = { domElement: canvas } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app: obsApp } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(obsApp, `light-popover-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/popover.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const eventBus = new EventEmitter();
  const controller = new LightingController({
    viewport, app: { canvas } as unknown as Application, store, eventBus, obsApp, viewId: 'popover-view',
    bounds: () => ({ width: 1000, height: 1000 }), albedo: () => null,
  });
  const wired = {} as Pick<Setup, 'light' | 'wallDown' | 'contextMenu' | 'wallMove'>;
  const ignore = (): void => undefined;
  const sensedOutlines = { visible: false };
  controller.wire({
    setLightHandlers: (handlers: LightPointerHandlers) => { wired.light = handlers; },
    setWallPointerDownHandler: (fn: Setup['wallDown']) => { wired.wallDown = fn; },
    setWallContextMenuHandler: (fn: Setup['contextMenu']) => { wired.contextMenu = fn; },
    setWallPointerMoveHandler: (fn: Setup['wallMove']) => { wired.wallMove = fn; },
    setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore,
    setDoorMenuHandlers: (handlers: DoorMenuHandlers) => { doorMenu.current = handlers; },
    setDoorClickHandler: ignore, setPlayerSightProvider: ignore, refreshPlayerSight: ignore,
    getSensedOutlineLayer: () => sensedOutlines,
  } as unknown as TokenRenderer);
  const torch = store.getState().addLight({ x: 400, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
  const lantern = store.getState().addLight({ x: 600, y: 300, emission: { ...genericLight('lantern'), kind: 'lantern' } });
  getHistoryStore(store)!.getState().clear();
  cleanup = () => {
    controller.destroy();
    viewport.destroy();
    canvas.remove();
    restoreGraphics();
  };
  const click = (x: number, y: number, keys: { shift?: boolean } = {}): boolean => {
    const taken = wired.light.pointerDown(x, y, event(x, y, keys));
    viewport.emit('pointerup', {} as never);
    return taken;
  };
  return { controller, store, obsApp, eventBus, viewport, ...wired, torch, lantern, click };
}
