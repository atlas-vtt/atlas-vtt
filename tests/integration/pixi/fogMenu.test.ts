// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Point, Sprite, Texture, type Application, type EventSystem, type FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { FogOfWarRenderer } from '../../../src/app/pixi/fog/FogOfWarRenderer';
import { captureWithLayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
import { isHandled } from '../../../src/app/pixi/utils/handledEvents';
import { fogAreaList } from '../../../src/app/fog/fogAreas';
import type { FogShape } from '../../../src/app/fog/fogToolChoices';
import { AssetService } from '../../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

const openContextMenuGlobal = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));
// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({ createLucideIconTexture: vi.fn(async () => new Texture()) }));

const GOBLIN_IMAGE = 'atlas-vtt/collections/default/tokens/goblin.png';
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
/** Two rooms hidden with a shape each, side by side, and a blob of brushed fog apart from them. */
const HALL = { type: 'rectangle', x: 0, y: 0, width: 210, height: 210 } as const;
const VAULT = { type: 'rectangle', x: 210, y: 0, width: 210, height: 210 } as const;
const IN_HALL = { x: 105, y: 105 };
const IN_VAULT = { x: 315, y: 105 };
const IN_BLOB = { x: 600, y: 400 };
const OPEN = { x: 700, y: 100 };

type ViewStore = ReturnType<typeof createViewAtlasStore>;
type Place = { x: number; y: number };

/** A pointer event at screen position (x, y); the viewport is unzoomed, so screen = world. */
const pointerEvent = ({ x, y }: Place, button = 0, keys: { altKey?: boolean } = {}): FederatedPointerEvent =>
  ({ button, pointerId: 1, pointerType: 'mouse', global: new Point(x, y), clientX: x + 300, clientY: y + 40, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...keys, stopPropagation: vi.fn(), preventDefault: vi.fn() }) as unknown as FederatedPointerEvent;

describe('the fog\'s menu on the map', () => {
  let viewport: Viewport;
  let store: ViewStore;
  let tokens: TokenRenderer;
  let fog: FogOfWarRenderer;
  let restoreGraphics: () => void;
  let hall: string;
  let vault: string;

  const layer = (): Container => fog.getContainer().getChildByLabel('fog-areas') as Container;
  const outlines = (): Graphics => layer().getChildByLabel('fog-area-outlines') as Graphics;
  const target = (): Graphics => layer().getChildByLabel('fog-menu-target') as Graphics;
  const piece = (id: string): FogOperation => store.getState().objects.fog[id]!;
  const covers = (place: Place): boolean => fog.getCommittedCoverage()!.covers(place);
  const steps = (): number => getHistoryStore(store)!.getState().pastStates.length;
  const press = (at: Place, button = 0, keys?: { altKey?: boolean }): FederatedPointerEvent => {
    const down = pointerEvent(at, button, keys);
    viewport.emit('pointerdown', down);
    return down;
  };
  const release = (at: Place, button = 0): void => { viewport.emit('pointerup', pointerEvent(at, button)); };
  const drag = (from: Place, to: Place, button = 0, keys?: { altKey?: boolean }): void => {
    press(from, button, keys);
    viewport.emit('pointermove', pointerEvent(to, button, keys));
    release(to, button);
  };
  const rightClick = (at: Place): FederatedPointerEvent => {
    const down = press(at, 2);
    release(at, 2);
    return down;
  };
  const calls = (): unknown[][] => openContextMenuGlobal.mock.calls as unknown[][];
  const menu = (): ContextMenuEntry[] => calls()[calls().length - 1]![0] as ContextMenuEntry[];
  const labels = (): Array<string | null> => menu().map((entry) => (entry.type === 'item' ? entry.label : null));
  const choose = (): void => {
    const [entry] = menu();
    if (entry?.type === 'item') entry.onClick();
    closeMenu();
  };
  /** The menu closes, as it does on a choice, on Escape and on a press beside it. */
  const closeMenu = (): void => (calls()[calls().length - 1]![2] as { onClose?: () => void } | undefined)?.onClose?.();

  beforeEach(async () => {
    restoreGraphics = stubJsdomGraphics();
    (AssetService as unknown as { instance: AssetService | null }).instance = null;
    const { app } = createInMemoryApp({ files: { [GOBLIN_IMAGE]: 'goblin-bytes' } });
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
    store = createViewAtlasStore(app, 'fog-menu-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/test.atlasmap');
    const eventBus = new EventEmitter();
    const snap = (x: number, y: number): Place => ({ x: Math.floor(x / 70) * 70 + 35, y: Math.floor(y / 70) * 70 + 35 });
    const grid = { getOptions: () => ({ type: 'square', size: 70, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap, snapTokenCenter: snap } as unknown as GridSystem;
    tokens = new TokenRenderer(app, viewport, grid, vi.fn(), store, eventBus, 'fog-menu-view');
    const canvas = document.createElement('canvas');
    tokens.setPixiApp({ ticker: { add: vi.fn(), remove: vi.fn(), lastTime: 0 }, canvas, renderer: { generateTexture: vi.fn(() => new Texture()) } } as unknown as Application);

    fog = new FogOfWarRenderer(viewport, { canvas } as unknown as Application, eventBus as never, store, () => null);
    viewport.addChild(fog.getContainer());
    fog.reorderViewportListeners();
    // As the view wires them (`PixiRendererOrchestrator.wireFogMenu`).
    tokens.setFogMenuHandlers(fog.menuPointer());
    fog.showsPlayers = () => tokens.playersSeeOnCanvas() !== null;
    tokens.onPlayersViewChange(() => fog.refreshVisibility());

    hall = store.getState().addFogArea(HALL)!;
    vault = store.getState().addFogArea(VAULT)!;
    store.getState().addFogOperation({ type: 'brush', isErasing: false, points: [IN_BLOB], brushRadius: 40 });
    store.getState().setActiveTool('select');
    openContextMenuGlobal.mockClear();
  });

  afterEach(() => {
    fog.destroy();
    tokens.destroy();
    viewport.destroy();
    restoreGraphics();
    vi.restoreAllMocks();
  });

  it.each(['select', 'move', 'fog', 'eraser'] as const)('offers Reveal on fog that was hidden with a shape, with the %s tool, and reveals that piece alone in one undo step', (tool) => {
    store.getState().setActiveTool(tool);
    const before = steps();
    const fogBefore = Object.keys(store.getState().objects.fog);
    const down = rightClick(IN_HALL);
    // The press stays the map's, so a right-drag still pans, and the menu opens where the pointer is in the window.
    expect(isHandled(down)).toBe(false);
    expect(openContextMenuGlobal).toHaveBeenCalledExactlyOnceWith(expect.any(Array), { x: IN_HALL.x + 300, y: IN_HALL.y + 40 }, expect.any(Object));
    expect(labels()).toEqual(['Reveal']);
    // Nothing is written before the entry is chosen, and the fog tool draws nothing for the click.
    expect(Object.keys(store.getState().objects.fog)).toEqual(fogBefore);
    expect(steps()).toBe(before);

    choose();
    expect(piece(hall)).toMatchObject({ isErasing: true });
    expect(piece(vault)).toMatchObject({ isErasing: false });
    expect([covers(IN_HALL), covers(IN_VAULT), covers(IN_BLOB)]).toEqual([false, true, true]);
    expect(Object.keys(store.getState().objects.fog)).toEqual(fogBefore);
    expect(steps()).toBe(before + 1);
  });

  it('offers Hide on the open ground of a piece that was revealed, and hides it again', () => {
    store.getState().flipFogArea(hall);
    const before = steps();
    rightClick(IN_HALL);
    expect(labels()).toEqual(['Hide']);
    choose();
    expect(piece(hall)).toMatchObject({ isErasing: false });
    expect(covers(IN_HALL)).toBe(true);
    expect(steps()).toBe(before + 1);
    // And Reveal again, on the same place.
    rightClick(IN_HALL);
    expect(labels()).toEqual(['Reveal']);
  });

  it('reveals the body of loose fog under the pointer, and nothing else, in one undo step', () => {
    // A second blob apart from the first, and one that runs from the first into the hall.
    store.getState().addFogOperation({ type: 'brush', isErasing: false, points: [{ x: 600, y: 100 }], brushRadius: 30 });
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 100, y: 380, width: 500, height: 40 });
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 100, y: 150, width: 40, height: 250 });
    const before = steps();
    const count = Object.keys(store.getState().objects.fog).length;
    rightClick(IN_BLOB);
    expect(labels()).toEqual(['Reveal']);
    choose();
    expect(steps()).toBe(before + 1);
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(count + 1);
    // The blob and what hangs on it are gone, up to the hall, which still counts as hidden and stays whole.
    expect([covers(IN_BLOB), covers({ x: 300, y: 400 }), covers({ x: 120, y: 300 })]).toEqual([false, false, false]);
    expect([covers(IN_HALL), covers({ x: 120, y: 180 }), covers(IN_VAULT), covers({ x: 600, y: 100 })]).toEqual([true, true, true, true]);
    getHistoryStore(store)!.getState().undo();
    expect([covers(IN_BLOB), covers({ x: 300, y: 400 })]).toEqual([true, true]);
  });

  it('offers nothing on open ground that no piece holds, and nothing once Reveal all has forgotten the pieces', () => {
    rightClick(OPEN);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    store.getState().flipFogArea(hall);
    store.getState().clearFog();
    expect(fogAreaList(store.getState().objects.fog)).toEqual([]);
    for (const place of [IN_HALL, IN_VAULT, IN_BLOB]) rightClick(place);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('opens no menu when the right button drags the map away', () => {
    const down = press(IN_HALL, 2);
    viewport.emit('pointermove', pointerEvent({ x: IN_HALL.x + 60, y: IN_HALL.y + 30 }, 2));
    release({ x: IN_HALL.x + 60, y: IN_HALL.y + 30 }, 2);
    expect(isHandled(down)).toBe(false);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('leaves the right-click to a token or a pin under the pointer', async () => {
    store.getState().addToken({ id: 'goblin', ...IN_HALL, size: 1, imagePath: GOBLIN_IMAGE, layer: 0, isHidden: false, rotation: 0 });
    await vi.waitFor(() => expect(tokens.getTokenSprites().goblin).toBeInstanceOf(Container));
    rightClick(IN_HALL);
    // The token's own menu, not the fog's one entry.
    expect(openContextMenuGlobal).toHaveBeenCalledTimes(1);
    expect(labels()).not.toEqual(['Reveal']);
    expect(piece(hall)).toMatchObject({ isErasing: false });
    // With the fog tool no token is taken: the fog's menu opens over it.
    store.getState().setActiveTool('fog');
    rightClick(IN_HALL);
    expect(labels()).toEqual(['Reveal']);

    openContextMenuGlobal.mockClear();
    const pinMenu = vi.fn();
    tokens.setPinHitTestProvider((x, y) => (Math.hypot(x - IN_VAULT.x, y - IN_VAULT.y) < 20 ? 'pin' : null));
    tokens.setPinClickHandler(pinMenu);
    const down = rightClick(IN_VAULT);
    expect(pinMenu).toHaveBeenCalledExactlyOnceWith('pin', down);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it.each(['wall', 'measure', 'draw', 'note-pin'] as const)('opens no menu with the %s tool', (tool) => {
    store.getState().setActiveTool(tool);
    rightClick(IN_HALL);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('opens no menu while the canvas shows the players\' view, a peek included, or the scene loads', () => {
    store.getState().setGMView(false);
    rightClick(IN_HALL);
    store.getState().setGMView(true);
    let peeking = true;
    tokens.setPlayerSightProvider(() => undefined, () => peeking);
    tokens.refreshPlayerSight();
    rightClick(IN_HALL);
    expect(fog.menuPointer().menuAt(IN_HALL.x, IN_HALL.y)).toBe(false);
    peeking = false;
    tokens.refreshPlayerSight();
    store.setState({ isMapLoading: true });
    rightClick(IN_HALL);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    store.setState({ isMapLoading: false });
    rightClick(IN_HALL);
    expect(labels()).toEqual(['Reveal']);
  });

  it('opens no menu while a polygon waits for its next corner', () => {
    store.getState().setFogTool({ shape: 'polygon' });
    store.getState().setActiveTool('fog');
    press(OPEN);
    release(OPEN);
    rightClick(IN_HALL);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('reads the fog of the level shown alone', () => {
    store.setState({ levels: LEVELS, viewedLevel: 'upper' });
    rightClick(IN_HALL);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    const above = store.getState().addFogArea({ type: 'rectangle', x: 400, y: 200, width: 100, height: 100 })!;
    rightClick({ x: 450, y: 250 });
    choose();
    expect(piece(above)).toMatchObject({ isErasing: true });
    store.getState().setViewedLevel('ground');
    rightClick({ x: 450, y: 250 });
    expect(calls()).toHaveLength(1);
  });

  it('outlines what the entry will act on while the menu is open, with any tool, and lets go when it closes', () => {
    const drawn = (g: Graphics): number => g.context.instructions.length;
    expect(layer().visible).toBe(false);
    rightClick(IN_HALL);
    expect(layer().visible).toBe(true);
    expect(drawn(target())).toBeGreaterThan(0);
    // The pieces themselves are outlined with the fog tool alone.
    expect(drawn(outlines())).toBe(0);
    closeMenu();
    expect(layer().visible).toBe(false);
    // A body of loose fog is outlined as well, and the mark goes with the fog it was opened on.
    rightClick(IN_BLOB);
    expect(layer().visible).toBe(true);
    store.getState().addFogOperation({ type: 'brush', isErasing: true, points: [OPEN], brushRadius: 10 });
    expect(layer().visible).toBe(false);
  });

  it('outlines the remembered pieces while the fog tool is chosen, and marks nothing on the map with another tool', () => {
    expect(layer().visible).toBe(false);
    for (const tool of ['fog', 'eraser'] as const) {
      store.getState().setActiveTool(tool);
      expect(layer().visible).toBe(true);
      expect(outlines().context.instructions.length).toBeGreaterThan(0);
    }
    for (const tool of ['move', 'select', 'measure'] as const) {
      store.getState().setActiveTool(tool);
      expect(layer().visible).toBe(false);
    }
    // Nothing in the layer but outlines: no badge, no name.
    expect(layer().children.every((child) => child instanceof Graphics)).toBe(true);
    // Without a piece there is nothing to outline.
    store.getState().clearFog();
    store.getState().setActiveTool('fog');
    expect(layer().visible).toBe(false);
  });

  it('leaves the outlines out of the players\' frame and of a picture of the scene, and hides them in session view and a peek', () => {
    store.getState().setActiveTool('fog');
    for (const layers of [fog.getPlayerViewLayers(), fog.getGmViewLayers()]) {
      expect(layers).toContainEqual({ layer: layer(), visible: false });
      let during: boolean | null = null;
      captureWithLayerVisibility(layers, () => undefined, () => { during = layer().visible; });
      expect(during).toBe(false);
      expect(layer().visible).toBe(true);
    }
    store.getState().setGMView(false);
    expect(layer().visible).toBe(false);
    store.getState().setGMView(true);
    expect(layer().visible).toBe(true);
    let peeking = true;
    tokens.setPlayerSightProvider(() => undefined, () => peeking);
    tokens.refreshPlayerSight();
    expect(layer().visible).toBe(false);
    peeking = false;
    tokens.refreshPlayerSight();
    expect(layer().visible).toBe(true);
  });

  it('shows the fog as opaque as the players see it while the peek is held, on a scene without lighting too, and as the GM chose it once it is let go', () => {
    const picture = fog.getContainer().children.find((child) => child instanceof Sprite)!;
    store.getState().setSceneLighting({ enabled: false });
    const chosen = picture.alpha;
    expect(chosen).toBeLessThan(1);
    let peeking = true;
    tokens.setPlayerSightProvider(() => undefined, () => peeking);
    tokens.refreshPlayerSight();
    expect(picture.alpha).toBe(1);
    // A picture of the scene stays the GM's
    expect(fog.getGmViewLayers()).toContainEqual({ layer: picture, visible: picture.visible, alpha: chosen });
    peeking = false;
    tokens.refreshPlayerSight();
    expect(picture.alpha).toBe(chosen);
  });

  it('hides the fog tool\'s ring, outline and guide while the peek is held, and not in session view, where the tool still paints', () => {
    // The outline of what is under way, the brush's ring and the snapping guide lie above the pieces' outlines.
    const above = (zIndex: number): Container => fog.getContainer().children.find((child) => child instanceof Graphics && child.zIndex === zIndex)!;
    const marks = [above(1001), above(1002), above(1003)];
    const shown = (): boolean[] => marks.map((mark) => mark.renderable);
    store.getState().setActiveTool('fog');
    viewport.emit('pointermove', pointerEvent(OPEN));
    const ring = marks[1]!;
    expect(ring.visible).toBe(true);
    expect(shown()).toEqual([true, true, true]);

    let peeking = true;
    tokens.setPlayerSightProvider(() => undefined, () => peeking);
    tokens.refreshPlayerSight();
    expect(shown()).toEqual([false, false, false]);
    // The ring keeps its place, and is back when the key is let go.
    expect(ring.visible).toBe(true);
    peeking = false;
    tokens.refreshPlayerSight();
    expect(shown()).toEqual([true, true, true]);

    store.getState().setGMView(false);
    expect(shown()).toEqual([true, true, true]);
  });

  describe('a shape drawn to hide', () => {
    const FROM = { x: 500, y: 20 };
    const TO = { x: 700, y: 160 };
    const added = (): FogOperation[] => Object.values(store.getState().objects.fog).slice(3);

    it.each(['rectangle', 'lasso', 'cells'] as const satisfies readonly FogShape[])('is fog that is remembered as one piece with the %s, in one undo step', (shape) => {
      store.getState().setFogTool({ shape });
      store.getState().setActiveTool('fog');
      const before = steps();
      press(FROM);
      viewport.emit('pointermove', pointerEvent({ x: TO.x, y: FROM.y }));
      viewport.emit('pointermove', pointerEvent(TO));
      release(TO);
      expect(added()).toEqual([expect.objectContaining({ isErasing: false, area: {} })]);
      expect(fogAreaList(store.getState().objects.fog)).toHaveLength(3);
      expect(steps()).toBe(before + 1);
      // A right-click on it reveals it, and nothing of the rooms beside it.
      store.getState().setActiveTool('select');
      rightClick({ x: 690, y: 30 });
      expect(labels()).toEqual(['Reveal']);
      choose();
      expect(added()[0]).toMatchObject({ isErasing: true });
      expect([covers({ x: 690, y: 30 }), covers(IN_HALL), covers(IN_VAULT)]).toEqual([false, true, true]);
    });

    it('is one with the polygon, closed on its first corner', () => {
      store.getState().setFogTool({ shape: 'polygon' });
      store.getState().setActiveTool('fog');
      // Corners on the grid, where they land: the last click is on the first again.
      for (const corner of [{ x: 490, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 140 }, { x: 490, y: 0 }]) {
        press(corner);
        release(corner);
      }
      expect(added()).toEqual([expect.objectContaining({ type: 'lasso', isErasing: false, area: {} })]);
    });

    it('is plain fog with the brush, and plain erasing while Alt is held or with the revealing tool', () => {
      store.getState().setFogTool({ shape: 'brush' });
      store.getState().setActiveTool('fog');
      drag(FROM, TO);
      store.getState().setFogTool({ shape: 'rectangle' });
      drag(FROM, TO, 0, { altKey: true });
      store.getState().setActiveTool('eraser');
      drag(FROM, TO);
      expect(added().map((operation) => [operation.type, operation.isErasing, 'area' in operation])).toEqual([['brush', false, false], ['rectangle', true, false], ['rectangle', true, false]]);
      expect(fogAreaList(store.getState().objects.fog)).toHaveLength(2);
      // With the revealing tool Alt hides, and what a shape hides is remembered.
      drag(FROM, TO, 0, { altKey: true });
      expect(added()[3]).toMatchObject({ type: 'rectangle', isErasing: false, area: {} });
    });

    it('is added to the hidden piece it begins in, which is then revealed as one', () => {
      store.getState().setFogTool({ shape: 'rectangle' });
      store.getState().setActiveTool('fog');
      const before = steps();
      // From inside the vault out to its right.
      drag({ x: 350, y: 70 }, { x: 490, y: 140 });
      expect(added()).toEqual([]);
      expect(fogAreaList(store.getState().objects.fog)).toHaveLength(2);
      expect(steps()).toBe(before + 1);
      expect(covers({ x: 470, y: 100 })).toBe(true);
      rightClick({ x: 470, y: 100 });
      choose();
      expect(piece(vault)).toMatchObject({ isErasing: true });
      expect([covers({ x: 470, y: 100 }), covers(IN_VAULT), covers(IN_HALL)]).toEqual([false, false, true]);
    });

    it('ends where the hidden pieces beside it begin, so revealing it opens nothing of them', () => {
      store.getState().setFogTool({ shape: 'rectangle' });
      store.getState().setActiveTool('fog');
      // From open ground into the vault.
      drag({ x: 490, y: 70 }, { x: 350, y: 140 });
      expect(added()).toHaveLength(1);
      rightClick({ x: 470, y: 100 });
      choose();
      expect(added()[0]).toMatchObject({ isErasing: true });
      expect([covers({ x: 470, y: 100 }), covers({ x: 400, y: 100 }), covers(IN_VAULT)]).toEqual([false, true, true]);
    });
  });
});
