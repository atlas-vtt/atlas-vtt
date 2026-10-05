import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { genericLight } from '../mocks/lights';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { fogRectangle } from '../helpers/fogOperations';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import type { LightPointerHandlers } from '../../src/app/pixi/lighting/LightInteraction';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import type { DoorMenuHandlers, TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { SEES_ALL, computeSight, type Sight } from '../../src/app/vision/sight';
import { AssetService } from '../../src/app/services/AssetService';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';
import type { TokenSensesResolver } from '../../src/app/creatures/tokenSensesResolver';
import type { App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const lighting = vi.hoisted(() => ({
  sight: null as unknown,
  deps: null as unknown,
  modeLayer: { visible: false },
  refreshBounds: (): void => {},
}));

vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => {
    lighting.deps = deps;
    lighting.modeLayer = { visible: false };
    lighting.refreshBounds = vi.fn();
    return {
      modeLayer: lighting.modeLayer,
      isEnabled: () => deps.store.getState().lighting.enabled,
      currentSight: () => lighting.sight as Sight,
      lightReaches: () => [],
      ambientLight: () => ({ ambient: 1 }),
      refreshBounds: () => lighting.refreshBounds(),
      resetExplored: vi.fn(),
      editExplored: vi.fn(() => false),
      beforeMapUnload: vi.fn(),
      renderForFrame: (_frame, render) => render(),
      destroy: vi.fn(),
    };
  },
}));

vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));

/** What `LightingController.wire` hands the token renderer's viewport dispatch. */
interface Wired {
  pointerDown: (x: number, y: number, e: FederatedPointerEvent) => boolean;
  pointerMove: (x: number, y: number, e: FederatedPointerEvent) => void;
  pointerUp: () => void;
  doubleClick: () => void;
  light: LightPointerHandlers;
  contextMenu: (x: number, y: number, screenX: number, screenY: number) => void;
  cursor: (x: number, y: number) => string;
  doorClick: (x: number, y: number) => boolean;
  playerSight: () => ((tokenId: string) => string) | undefined;
  playerViewActive?: (() => boolean) | undefined;
  refreshPlayerSight: ReturnType<typeof vi.fn>;
  /** The layer of the sensed tokens' outlines, as the token renderer gives it. */
  sensedOutlines: { visible: boolean };
}

interface Setup {
  controller: LightingController;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  obsApp: App;
  /** Tells the controller a collection's settings changed, as `AssetService` does through the workspace. */
  collectionSettingsChanged: () => void;
  wired: Wired;
  click: (x: number, y: number, keys?: { shift?: boolean }) => boolean;
}

const doorMenu: { current: DoorMenuHandlers | null } = { current: null };
let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

function setup(extra: Partial<ConstructorParameters<typeof LightingController>[0]> = {}): Setup {
  const restoreGraphics = stubJsdomGraphics();
  lighting.sight = SEES_ALL;
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app: obsApp } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(obsApp, `lighting-session-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/session.atlasmap');
  const eventBus = new EventEmitter();
  const controller = new LightingController({
    viewport,
    app: { canvas: document.createElement('canvas') } as unknown as Application,
    store,
    eventBus,
    obsApp,
    viewId: 'session-view',
    bounds: () => ({ width: 1000, height: 1000 }),
    albedo: () => null,
    ...extra,
  });
  const wired = { refreshPlayerSight: vi.fn(), sensedOutlines: { visible: false } } as Wired;
  controller.wire({
    setWallPointerDownHandler: (fn: Wired['pointerDown']) => { wired.pointerDown = fn; },
    setWallPointerMoveHandler: (fn: Wired['pointerMove']) => { wired.pointerMove = fn; },
    setWallPointerUpHandler: (fn: Wired['pointerUp']) => { wired.pointerUp = fn; },
    setWallDoubleClickHandler: (fn: Wired['doubleClick']) => { wired.doubleClick = fn; },
    setWallContextMenuHandler: (fn: Wired['contextMenu']) => { wired.contextMenu = fn; },
    setWallCursorProvider: (fn: Wired['cursor']) => { wired.cursor = fn; },
    setDoorMenuHandlers: (handlers: DoorMenuHandlers) => { doorMenu.current = handlers; },
    setDoorClickHandler: (fn: Wired['doorClick']) => { wired.doorClick = fn; },
    setLightHandlers: (handlers: LightPointerHandlers) => { wired.light = handlers; },
    setPlayerSightProvider: (fn: Wired['playerSight'], active?: () => boolean) => { wired.playerSight = fn; wired.playerViewActive = active; },
    refreshPlayerSight: wired.refreshPlayerSight,
    getSensedOutlineLayer: () => wired.sensedOutlines,
  } as unknown as TokenRenderer);
  cleanup = () => {
    controller.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const click = (x: number, y: number, keys: { shift?: boolean } = {}): boolean =>
    wired.pointerDown(x, y, { shiftKey: !!keys.shift, ctrlKey: false, metaKey: false } as FederatedPointerEvent);
  const collectionSettingsChanged = (): void => {
    const calls = vi.mocked(obsApp.workspace.on).mock.calls as unknown as [string, (collectionId: string) => void][];
    calls.find(([name]) => name === 'atlas-vtt:collection-settings-changed')?.[1]('dungeon');
  };
  return { controller, store, eventBus, obsApp, collectionSettingsChanged, wired, click };
}

function addWall(store: ViewAtlasStore, x1: number, x2: number): string {
  return store.getState().addWall({ type: 'solid', p1: { x: x1, y: 100 }, p2: { x: x2, y: 100 }, closed: true });
}

function pressPeek(type: 'keydown' | 'keyup'): void {
  window.dispatchEvent(new KeyboardEvent(type, { key: 'h', code: 'KeyH', bubbles: true }));
}

describe('LightingController in session view', () => {
  it('reports existing session and peek activity even on an unlit scene', () => {
    const { store, wired } = setup();
    store.getState().setSceneLighting({ enabled: false });
    expect(wired.playerViewActive?.()).toBe(false);
    expect(wired.playerSight()).toBeUndefined();
    pressPeek('keydown');
    expect(wired.playerViewActive?.()).toBe(true);
    expect(wired.playerSight()).toBeUndefined();
    pressPeek('keyup');
    expect(wired.playerViewActive?.()).toBe(false);
    store.getState().setGMView(false);
    expect(wired.playerViewActive?.()).toBe(true);
  });

  it('removes fogged door hit targets on fog-only changes and restores them after erase', () => {
    let coverage: FogCoverage | null = fogCoverage({});
    const { store, wired, controller } = setup({ fogCoverage: () => coverage });
    store.getState().setSceneLighting({ enabled: true });
    const door = store.getState().addWall({ type: 'door', p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, closed: true });
    store.getState().setGMView(false);
    const paint = fogRectangle({ x: 40, y: 90, width: 20, height: 20 });
    coverage = fogCoverage({ paint });
    store.setState((state) => ({ objects: { ...state.objects, fog: { paint } } }));
    expect(wired.doorClick(50, 100)).toBe(false);
    expect(store.getState().objects.walls[door]?.closed).toBe(true);
    const erase = fogRectangle({ id: 'erase', timestamp: 2, isErasing: true, x: 45, y: 95, width: 10, height: 10 });
    coverage = fogCoverage({ paint, erase });
    store.setState((state) => ({ objects: { ...state.objects, fog: { paint, erase } } }));
    expect(wired.doorClick(50, 100)).toBe(true);
    expect(store.getState().objects.walls[door]?.closed).toBe(false);
    // A map change must refresh the same walls even before their record changes.
    coverage = null;
    store.getState().setMapPath('maps/invalid.atlasmap');
    expect(wired.doorClick(50, 100)).toBe(false);
    store.getState().setGMView(true);
    expect(wired.doorClick(50, 100)).toBe(true);
    expect(controller.gmOverlays().doorBadges.visible).toBe(true);
  });

  it('shows the GM his overlays in GM view', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const { wallEditor, doorBadges, lightMarkers } = controller.gmOverlays();
    expect(lighting.modeLayer.visible).toBe(false);
    expect(wallEditor.visible).toBe(false);
    expect(doorBadges.visible).toBe(true);
    expect(lightMarkers.visible).toBe(true);
    store.getState().setActiveTool('wall');
    expect(wallEditor.visible).toBe(true);
  });

  it('hides in session view exactly what a player frame hides, and switches to the players\' lighting', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setGMView(false);
    const layers = controller.playerLayers();
    // The players' lighting, the outlines of sensed tokens, the players' door badges, and each of the GM's seven overlays.
    expect(layers).toHaveLength(10);
    expect(Object.keys(controller.gmOverlays())).toHaveLength(7);
    for (const { layer, visible } of layers) expect(layer.visible).toBe(visible);
    expect(lighting.modeLayer.visible).toBe(true);
  });

  it('shows the outlines of sensed tokens in session view and while peeking, never in GM view or an unlit scene', () => {
    const { store, wired } = setup();
    store.getState().setSceneLighting({ enabled: true });
    expect(wired.sensedOutlines.visible).toBe(false);
    store.getState().setGMView(false);
    expect(wired.sensedOutlines.visible).toBe(true);
    store.getState().setGMView(true);
    expect(wired.sensedOutlines.visible).toBe(false);
    pressPeek('keydown');
    expect(wired.sensedOutlines.visible).toBe(true);
    pressPeek('keyup');
    expect(wired.sensedOutlines.visible).toBe(false);
    store.getState().setGMView(false);
    store.getState().setSceneLighting({ enabled: false });
    expect(wired.sensedOutlines.visible).toBe(false);
  });

  it('keeps them hidden when lights change, a door opens or the tool changes in session view', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setGMView(false);
    store.getState().addLight({ x: 50, y: 50, emission: genericLight('torch') });
    const door = store.getState().addWall({ type: 'door', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, closed: true });
    store.getState().toggleDoor(door);
    store.getState().setActiveTool('wall');
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
    store.getState().setSceneLighting({ enabled: false });
    for (const layer of Object.values(controller.gmOverlays())) expect(layer.visible).toBe(false);
  });

  it('gives the overlays back with GM view', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    store.getState().setGMView(false);
    store.getState().setGMView(true);
    expect(lighting.modeLayer.visible).toBe(false);
    expect(controller.gmOverlays().doorBadges.visible).toBe(true);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
  });

  it('shows the same while the peek key is held', () => {
    const { controller, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    pressPeek('keydown');
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
    expect(lighting.modeLayer.visible).toBe(true);
    pressPeek('keyup');
    expect(lighting.modeLayer.visible).toBe(false);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
  });

  it('opens a door\'s menu from a right-click on its badge with any tool: to open it, or to lock it; none in the players\' view', () => {
    const { store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const door = store.getState().addWall({ type: 'door', p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, closed: true });
    const handlers = doorMenu.current!;
    expect(handlers.hitTest(50, 100)).toBe(door);
    expect(handlers.hitTest(300, 300)).toBeNull();
    handlers.open(door, 10, 20);
    const [entries, at] = openContextMenuGlobal.mock.calls.at(-1)! as [{ label: string; onClick: () => void }[], { x: number; y: number }];
    expect(at).toEqual({ x: 10, y: 20 });
    expect(entries.map((entry) => entry.label)).toEqual(['Open door', 'Lock door']);
    entries[1]!.onClick();
    expect(store.getState().objects.walls[door]).toMatchObject({ locked: true, closed: true });
    store.getState().setGMView(false);
    expect(handlers.hitTest(50, 100)).toBeNull();
    openContextMenuGlobal.mockReset();
  });

  /** A hero at (50, 50) whose sight a solid wall at y = 200 ends: the door at y = 100 is in it, the one at y = 300 is not. */
  function doorsInAndOutOfSight(): Setup & { seen: string; unseen: string; secret: string } {
    const made = setup();
    const { store } = made;
    store.getState().setSceneLighting({ enabled: true });
    const blocking = [{ id: 'south', kind: 'wall' as const, type: 'solid' as const, p1: { x: -1000, y: 200 }, p2: { x: 1000, y: 200 } }];
    lighting.sight = computeSight([{ tokenId: 'hero', origin: { x: 50, y: 50 }, range: 1000, senses: [] }], blocking);
    const seen = store.getState().addWall({ type: 'door', p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, closed: true });
    const unseen = store.getState().addWall({ type: 'door', p1: { x: 0, y: 300 }, p2: { x: 100, y: 300 }, closed: true });
    const secret = store.getState().addWall({ type: 'secret-door', p1: { x: 200, y: 100 }, p2: { x: 300, y: 100 }, closed: true });
    return { ...made, seen, unseen, secret };
  }

  it('opens and closes a door the players see from its badge in session view and while peeking, in one undo step', () => {
    const { store, wired, seen } = doorsInAndOutOfSight();
    const history = getHistoryStore(store)!;
    history.getState().clear();
    store.getState().setGMView(false);
    expect(wired.doorClick(50, 100)).toBe(true);
    expect(store.getState().objects.walls[seen]?.closed).toBe(false);
    expect(history.getState().pastStates).toHaveLength(1);
    store.getState().setGMView(true);
    pressPeek('keydown');
    expect(wired.doorClick(50, 100)).toBe(true);
    expect(store.getState().objects.walls[seen]?.closed).toBe(true);
    pressPeek('keyup');
  });

  it('opens a door the players see from its badge with the lighting tool too, whose editor the players\' view hides', () => {
    const { store, click, seen, unseen } = doorsInAndOutOfSight();
    store.getState().setActiveTool('wall');
    store.getState().setGMView(false);
    expect(click(50, 100)).toBe(true);
    expect(store.getState().objects.walls[seen]?.closed).toBe(false);
    expect(click(50, 300)).toBe(false);
    expect(store.getState().objects.walls[unseen]?.closed).toBe(true);
  });

  it('opens no door from a badge the players\' view does not show: one out of sight, a secret door', () => {
    const { store, wired, unseen, secret } = doorsInAndOutOfSight();
    store.getState().setGMView(false);
    expect(wired.doorClick(50, 300)).toBe(false);
    expect(wired.doorClick(250, 100)).toBe(false);
    expect(store.getState().objects.walls[unseen]?.closed).toBe(true);
    expect(store.getState().objects.walls[secret]?.closed).toBe(true);
    store.getState().setGMView(true);
    expect(wired.doorClick(50, 300)).toBe(true);
    expect(wired.doorClick(250, 100)).toBe(true);
    expect(store.getState().objects.walls[unseen]?.closed).toBe(false);
    expect(store.getState().objects.walls[secret]?.closed).toBe(false);
  });

  it('keeps a locked door shut in session view too, and opens no door menu there', () => {
    const { store, wired, seen } = doorsInAndOutOfSight();
    store.getState().setDoorLocked(seen, true);
    store.getState().setGMView(false);
    expect(wired.doorClick(50, 100)).toBe(true);
    expect(store.getState().objects.walls[seen]).toMatchObject({ closed: true, locked: true });
    expect(doorMenu.current!.hitTest(50, 100)).toBeNull();
  });

  it('follows the players\' sight: a door shows once they see it, and no longer once they do not', () => {
    const { store, wired, unseen } = doorsInAndOutOfSight();
    store.getState().setGMView(false);
    expect(wired.doorClick(50, 300)).toBe(false);
    lighting.sight = SEES_ALL;
    (lighting.deps as SceneLightingDeps).onSightChange?.();
    expect(wired.doorClick(50, 300)).toBe(true);
    expect(store.getState().objects.walls[unseen]?.closed).toBe(false);
  });

  it('shows no door badge to the players on an unlit scene', () => {
    const { store, wired, controller } = doorsInAndOutOfSight();
    store.getState().setSceneLighting({ enabled: false });
    store.getState().setGMView(false);
    expect(wired.doorClick(50, 100)).toBe(false);
    for (const layer of controller.playerOnlyLayers()) expect(layer.visible).toBe(false);
  });

  it('shows the players\' badges for one captured frame from GM view and puts the GM\'s back', () => {
    const { controller } = doorsInAndOutOfSight();
    const { doorBadges } = controller.gmOverlays();
    const [playerBadges] = controller.playerOnlyLayers();
    expect([doorBadges.visible, playerBadges!.visible]).toEqual([true, false]);
    let captured: boolean[] = [];
    captureWithLayerVisibility(controller.playerLayers(), () => undefined, () => { captured = [doorBadges.visible, playerBadges!.visible]; });
    expect(captured).toEqual([false, true]);
    expect([doorBadges.visible, playerBadges!.visible]).toEqual([true, false]);
  });
});

describe('the lighting tool while its editor is hidden', () => {
  it('draws no wall and places no light', () => {
    const { store, eventBus, click } = setup();
    store.getState().setActiveTool('wall');
    store.getState().setGMView(false);
    expect(click(100, 100)).toBe(false);
    expect(click(300, 100)).toBe(false);
    expect(store.getState().objects.walls).toEqual({});
    eventBus.emit('wall-submode-changed', 'place-light');
    expect(click(200, 200)).toBe(false);
    expect(store.getState().objects.lights).toEqual({});
  });

  it('drags no handle it does not show', () => {
    const { store, wired, click } = setup();
    const wall = addWall(store, 100, 300);
    const light = store.getState().addLight({ x: 500, y: 500, emission: genericLight('torch') });
    store.getState().setActiveTool('wall');
    store.getState().setGMView(false);
    expect(click(100, 100)).toBe(false);
    wired.pointerMove(150, 250, {} as FederatedPointerEvent);
    expect(wired.light.pointerDown(500, 500, { global: { x: 500, y: 500 } } as FederatedPointerEvent)).toBe(false);
    wired.pointerMove(600, 600, {} as FederatedPointerEvent);
    wired.pointerUp();
    expect(wired.light.cursorAt(500, 500)).toBeNull();
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
    expect(store.getState().objects.lights[light]).toMatchObject({ x: 500, y: 500 });
  });

  it('ends a drag that is under way and closes its undo step', () => {
    const { store, wired, click } = setup();
    const wall = addWall(store, 100, 300);
    store.getState().setActiveTool('wall');
    expect(click(100, 100)).toBe(true);
    wired.pointerMove(120, 140, {} as FederatedPointerEvent);
    store.getState().setGMView(false);
    wired.pointerMove(400, 400, {} as FederatedPointerEvent);
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 120, y: 140 });
    getHistoryStore(store).getState().undo();
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
  });

  it('keeps the walls of a chain being drawn and ends the chain', () => {
    const { store, click } = setup();
    store.getState().setActiveTool('wall');
    click(100, 100, { shift: true });
    click(300, 100, { shift: true });
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    pressPeek('keydown');
    pressPeek('keyup');
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    // The chain ended: the next click starts a new one instead of adding a segment.
    click(500, 300);
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
  });

  it('offers no handle cursor, context menu, light settings or keyboard edits', () => {
    const { controller, store, wired } = setup();
    const wall = addWall(store, 100, 300);
    const light = store.getState().addLight({ x: 500, y: 500, emission: genericLight('torch') });
    store.getState().setActiveTool('wall');
    expect(wired.cursor(100, 100)).toBe('grab');
    wired.pointerDown(200, 100, { shiftKey: false, ctrlKey: false, metaKey: false } as FederatedPointerEvent);
    wired.pointerUp();
    store.getState().setGMView(false);
    expect(wired.cursor(100, 100)).toBe('default');
    wired.contextMenu(200, 100, 10, 10);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    wired.doubleClick();
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.handleDelete()).toBe(false);
    expect(controller.handleEscape()).toBe(false);
    expect(store.getState().objects.walls[wall]).toBeDefined();
    expect(store.getState().objects.lights[light]).toBeDefined();
  });

  it('works again in GM view', () => {
    const { store, click } = setup();
    store.getState().setActiveTool('wall');
    store.getState().setGMView(false);
    store.getState().setGMView(true);
    click(100, 100);
    click(300, 100);
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
  });
});

describe('tokens in session view', () => {
  const wall = { id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };

  function scene(): Setup & { lurker: string } {
    const made = setup();
    const { store } = made;
    store.getState().setSceneLighting({ enabled: true });
    store.getState().addToken({ x: 100, y: 100, imagePath: 'h.png', vision: { enabled: true } });
    const lurker = store.getState().addToken({ x: 400, y: 100, imagePath: 'l.png' });
    lighting.sight = computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], [wall]);
    return { ...made, lurker };
  }

  it('hides nothing by sight in GM view', () => {
    const { wired } = scene();
    expect(wired.playerSight()).toBeUndefined();
  });

  it('gives the lighting the sight rules of the map, and works sight out anew only when they differ', async () => {
    const { collectionSettingsChanged, obsApp } = scene();
    const { rules } = lighting.deps as SceneLightingDeps;
    const first = rules?.();
    expect(first).toMatchObject({ definitions: GENERIC_SIGHT_RULES.definitions, conditions: [] });
    expect(rules?.()).toBe(first);
    // Another collection's settings are none of this map's business.
    collectionSettingsChanged();
    await nextFrame();
    expect(lighting.refreshBounds).not.toHaveBeenCalled();

    const assets = AssetService.getInstance(obsApp);
    const collection = vi.spyOn(assets, 'getCollectionForMap').mockReturnValue('dungeon');
    const settings = vi.spyOn(assets, 'getCollectionSettings');
    const prone = { id: 'prone', name: 'Prone', color: '#000000' };
    // Ten saves that change nothing sight goes by: a widget, a renamed condition, a new list of the same conditions.
    for (let save = 0; save < 10; save++) {
      settings.mockReturnValue({ conditions: [{ ...prone, name: `Prone ${save}` }], defaultWidgets: { hpBar: save % 2 === 0 } });
      collectionSettingsChanged();
      await nextFrame();
    }
    expect(lighting.refreshBounds).not.toHaveBeenCalled();
    expect(rules?.()).toBe(first);

    // A condition that now hides its token does.
    settings.mockReturnValue({ conditions: [{ ...prone, effect: 'invisible' }] });
    collectionSettingsChanged();
    expect(lighting.refreshBounds).not.toHaveBeenCalled();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(1);
    expect(rules?.()).not.toBe(first);
    expect(rules?.().conditions).toEqual([{ ...prone, effect: 'invisible' }]);

    // So do other senses, and the same senses in a new list do not.
    const senses = [{ ...GENERIC_SIGHT_RULES.definitions[0]!, id: 'own' }];
    settings.mockReturnValue({ conditions: [{ ...prone, effect: 'invisible' }], senses });
    collectionSettingsChanged();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(2);
    const withSenses = rules?.();
    settings.mockReturnValue({ conditions: [{ ...prone, effect: 'invisible' }], senses: structuredClone(senses) });
    collectionSettingsChanged();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(2);
    expect(rules?.()).toBe(withSenses);
    collection.mockRestore();
    settings.mockRestore();
  });

  it('works sight out anew once per frame, however many statblocks are announced, and no more after it is destroyed', async () => {
    const listeners = new Set<() => void>();
    const senses: TokenSensesResolver = {
      visionOf: () => ({ senses: [], source: 'none', blindBeyond: false, pending: false, key: '' }),
      sensesOf: () => [],
      subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    };
    const { controller } = setup({ senses });
    expect(listeners.size).toBe(1);
    const announce = (): void => listeners.forEach((listener) => listener());
    announce();
    announce();
    announce();
    expect(lighting.refreshBounds).not.toHaveBeenCalled();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(1);
    announce();
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(2);

    announce();
    controller.destroy();
    cleanup = null;
    expect(listeners.size).toBe(0);
    await nextFrame();
    expect(lighting.refreshBounds).toHaveBeenCalledTimes(2);
  });

  it('asks the resolver how each token perceives', () => {
    const visionOf = vi.fn(() => ({ senses: [{ id: 'blindsight', range: 10 }], source: 'statblock' as const, blindBeyond: false, pending: false, key: 'k' }));
    setup({ senses: { visionOf, sensesOf: () => [], subscribe: () => () => undefined } });
    const { rules } = lighting.deps as SceneLightingDeps;
    const token = { id: 't', kind: 'token' as const, imagePath: 't.png', x: 0, y: 0 };
    expect(rules?.().visionOf?.(token)).toMatchObject({ senses: [{ id: 'blindsight', range: 10 }] });
    expect(visionOf).toHaveBeenCalledWith(token);
  });

  it('reads the conditions of the token looked at', async () => {
    const { controller, store, lurker, obsApp, collectionSettingsChanged } = scene();
    store.getState().setGMView(false);
    store.getState().updateToken(lurker, { x: 150, conditions: ['dnd5e-invisible'] });
    expect(controller.playerSight()?.(lurker)).toBe('seen');
    const assets = AssetService.getInstance(obsApp);
    const settings = vi.spyOn(assets, 'getCollectionSettings').mockReturnValue({ conditions: [{ id: 'dnd5e-invisible', name: 'Invisible', color: '#000000' }] });
    const collection = vi.spyOn(assets, 'getCollectionForMap').mockReturnValue('dungeon');
    collectionSettingsChanged();
    await nextFrame();
    expect(controller.playerSight()?.(lurker)).toBe('unseen');
    settings.mockRestore();
    collection.mockRestore();
  });

  it('marks for the GM the tokens the players do not see, follows their sight, and shows none of it in the players\' view', async () => {
    const { controller, store, lurker } = scene();
    const { sightAids } = controller.gmOverlays();
    const { onSightChange } = lighting.deps as SceneLightingDeps;
    const marks = (): unknown[] => controller.sightAids.marks.shown();
    const walled = lighting.sight;
    await nextFrame();
    expect(marks()).toEqual([[lurker, 'unseen']]);
    expect(sightAids.visible).toBe(true);
    // New sight is looked at once, in the next frame.
    lighting.sight = SEES_ALL;
    onSightChange?.();
    onSightChange?.();
    expect(marks()).toHaveLength(1);
    await nextFrame();
    expect(marks()).toEqual([]);
    lighting.sight = walled;
    onSightChange?.();
    await nextFrame();
    expect(marks()).toHaveLength(1);

    expect(controller.playerLayers()).toContainEqual({ layer: sightAids, visible: false });
    store.getState().setGMView(false);
    expect(sightAids.visible).toBe(false);
    expect(marks()).toEqual([]);
    store.getState().setGMView(true);
    expect(sightAids.visible).toBe(true);
    expect(marks()).toHaveLength(1);
    pressPeek('keydown');
    expect(sightAids.visible).toBe(false);
    pressPeek('keyup');
    expect(sightAids.visible).toBe(true);
    store.getState().setSceneLighting({ enabled: false });
    await nextFrame();
    expect(marks()).toEqual([]);
  });

  it('draws the ranges of a selected vision token for the GM alone', async () => {
    const { controller, store } = scene();
    const hero = Object.keys(store.getState().objects.tokens)[0]!;
    store.getState().updateToken(hero, { vision: { enabled: true, range: 30, senses: [{ id: 'darkvision', range: 15 }] } });
    store.getState().setSelection([hero]);
    await nextFrame();
    // A map without a unit counts squares: 30 units are six of five.
    expect(controller.sightAids.rings.labels()).toEqual(['Sight 6 sq', 'Darkvision 3 sq']);
    store.getState().setGMView(false);
    expect(controller.sightAids.rings.labels()).toEqual([]);
  });

  it('hides nothing by sight while the scene has no lighting', () => {
    const { store, wired } = scene();
    store.getState().setSceneLighting({ enabled: false });
    store.getState().setGMView(false);
    expect(wired.playerSight()).toBeUndefined();
  });

  it('tells which tokens the players see, by the player frame\'s own predicate', () => {
    const { controller, store, wired, lurker } = scene();
    store.getState().setGMView(false);
    expect(wired.playerSight()?.(lurker)).toBe('unseen');
    expect(controller.playerSight()?.(lurker)).toBe('unseen');
  });

  it('leaves a dragged vision token out of the players\' frame where the sight that stayed behind does not reach, in a scene that waits for the drop', () => {
    const { controller, store } = scene();
    const hero = Object.keys(store.getState().objects.tokens)[0]!;
    store.getState().setSceneLighting({ sightOnDrop: true });
    holdTokens(store, [hero]);
    expect(controller.playerSight()?.(hero)).toBe('seen');
    store.getState().setTokenPositions([{ id: hero, x: 400, y: 100 }]);
    expect(controller.playerSight()?.(hero)).toBe('unseen');
    // Without the option sight follows the drag, and the token is seen where it is.
    store.getState().setSceneLighting({ sightOnDrop: undefined });
    expect(controller.playerSight()?.(hero)).toBe('seen');
    store.getState().setSceneLighting({ sightOnDrop: true });
    holdTokens(store, []);
    expect(controller.playerSight()?.(hero)).toBe('seen');
  });

  it('follows a token that moves into sight', () => {
    const { store, wired, lurker } = scene();
    store.getState().setGMView(false);
    store.getState().updateToken(lurker, { x: 150, y: 100 });
    expect(wired.playerSight()?.(lurker)).toBe('seen');
  });

  it('shows and hides tokens again whenever sight changes or the view is switched', () => {
    const { store, wired } = scene();
    const { onSightChange } = lighting.deps as SceneLightingDeps;
    wired.refreshPlayerSight.mockClear();
    // In GM view sight hides no token, so its changes are not followed.
    onSightChange?.();
    expect(wired.refreshPlayerSight).not.toHaveBeenCalled();
    store.getState().setGMView(false);
    expect(wired.refreshPlayerSight).toHaveBeenCalledTimes(1);
    onSightChange?.();
    expect(wired.refreshPlayerSight).toHaveBeenCalledTimes(2);
    pressPeek('keydown');
    pressPeek('keyup');
    store.getState().setGMView(true);
    expect(wired.refreshPlayerSight).toHaveBeenCalledTimes(5);
  });
});
