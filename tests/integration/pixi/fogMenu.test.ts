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
/** A hall and a vault painted side by side, which touch, and a blob of brushed fog apart from them. */
const HALL = { type: 'rectangle', isErasing: false, x: 0, y: 0, width: 210, height: 210 } as const;
const VAULT = { type: 'rectangle', isErasing: false, x: 210, y: 0, width: 210, height: 210 } as const;
const IN_HALL = { x: 105, y: 105 };
const IN_VAULT = { x: 315, y: 105 };
const IN_BLOB = { x: 600, y: 400 };
const OPEN = { x: 700, y: 100 };
/** What the menu offers on fog, whatever painted it, and on the open ground of fog that was revealed. */
const ON_FOG = ['Reveal', 'Delete'];
const ON_REVEALED = ['Hide', 'Delete'];

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
  const layer = (): Graphics => fog.getContainer().getChildByLabel('fog-menu-target') as Graphics;
  const shape = (): unknown => fog.getCommittedCoverage()!.shape;
  const remembered = (): number => fogAreaList(store.getState().objects.fog).length;
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
  /** Chooses the entry named `label`: the menu's first where none is named. */
  const choose = (label?: string): void => {
    const entry = menu().find((candidate) => candidate.type === 'item' && (label === undefined || candidate.label === label));
    expect(entry).toBeDefined();
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

    store.getState().addFogOperation(HALL);
    store.getState().addFogOperation(VAULT);
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

  it.each(['select', 'move', 'fog', 'eraser'] as const)('offers Reveal and Delete on fog with the %s tool, and writes nothing until one is chosen', (tool) => {
    store.getState().setActiveTool(tool);
    const before = steps();
    const fogBefore = store.getState().objects.fog;
    const down = rightClick(IN_HALL);
    // The press stays the map's, so a right-drag still pans, and the menu opens where the pointer is in the window.
    expect(isHandled(down)).toBe(false);
    expect(openContextMenuGlobal).toHaveBeenCalledExactlyOnceWith(expect.any(Array), { x: IN_HALL.x + 300, y: IN_HALL.y + 40 }, expect.any(Object));
    expect(labels()).toEqual(ON_FOG);
    // Delete comes last and is told apart as what it is.
    expect(menu().map((entry) => entry.type === 'item' && entry.destructive === true)).toEqual([false, true]);
    // The fog tool draws nothing for the click.
    expect(store.getState().objects.fog).toBe(fogBefore);
    expect(steps()).toBe(before);
  });

  describe('fog that touches', () => {
    it('is one object: Delete on either shape removes both for good, in one undo step, and the blob apart from them stays', () => {
      for (const place of [IN_HALL, IN_VAULT]) {
        const before = steps();
        const fogBefore = shape();
        rightClick(place);
        choose('Delete');
        expect(steps()).toBe(before + 1);
        expect([covers(IN_HALL), covers(IN_VAULT), covers(IN_BLOB)]).toEqual([false, false, true]);
        // Nothing is remembered, and the ground has no menu.
        expect(remembered()).toBe(0);
        openContextMenuGlobal.mockClear();
        for (const ground of [IN_HALL, IN_VAULT]) rightClick(ground);
        expect(openContextMenuGlobal).not.toHaveBeenCalled();
        getHistoryStore(store)!.getState().undo();
        expect(shape()).toEqual(fogBefore);
        rightClick(place);
        expect(labels()).toEqual(ON_FOG);
      }
    });

    it('is one object: Reveal on either takes both away, and Hide on their ground brings both back as they were', () => {
      for (const [place, ground] of [[IN_HALL, IN_VAULT], [IN_VAULT, IN_HALL]] as const) {
        const before = steps();
        const fogBefore = shape();
        rightClick(place);
        choose('Reveal');
        expect(steps()).toBe(before + 1);
        expect([covers(IN_HALL), covers(IN_VAULT), covers(IN_BLOB)]).toEqual([false, false, true]);
        expect(remembered()).toBe(1);

        rightClick(ground);
        expect(labels()).toEqual(ON_REVEALED);
        choose('Hide');
        expect(steps()).toBe(before + 2);
        expect(shape()).toEqual(fogBefore);
        // It is plain fog again: nothing is remembered, and no operation carries a mark.
        expect(remembered()).toBe(0);
        expect(Object.values(store.getState().objects.fog).some((operation) => 'area' in operation)).toBe(false);
        rightClick(ground);
        expect(labels()).toEqual(ON_FOG);
      }
    });

    it('is two objects where it does not touch: the blob goes alone, and the rooms alone', () => {
      rightClick(IN_BLOB);
      choose('Delete');
      expect([covers(IN_HALL), covers(IN_VAULT), covers(IN_BLOB)]).toEqual([true, true, false]);
      getHistoryStore(store)!.getState().undo();
      rightClick(IN_BLOB);
      choose('Reveal');
      expect([covers(IN_HALL), covers(IN_VAULT), covers(IN_BLOB)]).toEqual([true, true, false]);
      // Fog painted between them makes one of the three.
      store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 400, y: 100, width: 220, height: 280 });
      rightClick(IN_HALL);
      choose('Delete');
      expect([covers(IN_HALL), covers(IN_VAULT), covers({ x: 500, y: 300 })]).toEqual([false, false, false]);
    });
  });

  describe('on the open ground of fog that was revealed', () => {
    beforeEach(() => {
      rightClick(IN_HALL);
      choose('Reveal');
      openContextMenuGlobal.mockClear();
    });

    it('Delete forgets it, in one undo step: the ground stays open and has no menu, and undo brings the menu back', () => {
      const before = steps();
      rightClick(IN_VAULT);
      expect(labels()).toEqual(ON_REVEALED);
      expect(menu().map((entry) => entry.type === 'item' && entry.destructive === true)).toEqual([false, true]);
      choose('Delete');
      expect(steps()).toBe(before + 1);
      expect(remembered()).toBe(0);
      expect([covers(IN_HALL), covers(IN_VAULT)]).toEqual([false, false]);
      openContextMenuGlobal.mockClear();
      for (const ground of [IN_HALL, IN_VAULT]) rightClick(ground);
      expect(openContextMenuGlobal).not.toHaveBeenCalled();
      getHistoryStore(store)!.getState().undo();
      rightClick(IN_HALL);
      expect(labels()).toEqual(ON_REVEALED);
    });

    it('offers Reveal and Delete again where fog was painted over it since, and Hide on what is still open', () => {
      store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 100, height: 100 });
      rightClick({ x: 50, y: 50 });
      expect(labels()).toEqual(ON_FOG);
      rightClick(IN_VAULT);
      expect(labels()).toEqual(ON_REVEALED);
    });

    it('is forgotten when the map is covered, and gone with all the fog when it is deleted', () => {
      store.getState().coverAllFog({ x: 0, y: 0, width: 800, height: 600 });
      expect(remembered()).toBe(0);
      rightClick(IN_HALL);
      expect(labels()).toEqual(ON_FOG);
      store.getState().clearFog();
      openContextMenuGlobal.mockClear();
      for (const place of [IN_HALL, IN_VAULT, IN_BLOB, OPEN]) rightClick(place);
      expect(openContextMenuGlobal).not.toHaveBeenCalled();
    });
  });

  it('offers nothing on open ground', () => {
    rightClick(OPEN);
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
    // The token's own menu, not the fog's.
    expect(openContextMenuGlobal).toHaveBeenCalledTimes(1);
    expect(labels()).not.toEqual(ON_FOG);
    expect(covers(IN_HALL)).toBe(true);
    // With the fog tool no token is taken: the fog's menu opens over it.
    store.getState().setActiveTool('fog');
    rightClick(IN_HALL);
    expect(labels()).toEqual(ON_FOG);

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
    expect(labels()).toEqual(ON_FOG);
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
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 400, y: 200, width: 100, height: 100 });
    rightClick({ x: 450, y: 250 });
    choose('Reveal');
    expect(covers({ x: 450, y: 250 })).toBe(false);
    // What was revealed above is remembered above: on the ground the place is open ground, and the hall is whole.
    store.getState().setViewedLevel('ground');
    rightClick({ x: 450, y: 250 });
    expect(calls()).toHaveLength(1);
    expect(covers(IN_HALL)).toBe(true);
    store.getState().setViewedLevel('upper');
    rightClick({ x: 450, y: 250 });
    expect(labels()).toEqual(ON_REVEALED);
  });

  it('outlines what the menu acts on while it is open, the whole object or the revealed ground, and lets go when it closes or the fog changes', () => {
    const drawn = (): number => layer().context.instructions.length;
    expect(layer().visible).toBe(false);
    rightClick(IN_HALL);
    expect(layer().visible).toBe(true);
    expect(drawn()).toBeGreaterThan(0);
    // The hall and the vault are one object: the outline runs round both.
    const bounds = layer().getLocalBounds();
    expect([Math.round(bounds.minX), Math.round(bounds.maxX)]).toEqual([-2, 422]);
    closeMenu();
    expect(layer().visible).toBe(false);
    expect(drawn()).toBe(0);
    // The mark goes with the fog it was opened on.
    rightClick(IN_BLOB);
    expect(layer().visible).toBe(true);
    store.getState().addFogOperation({ type: 'brush', isErasing: true, points: [OPEN], brushRadius: 10 });
    expect(layer().visible).toBe(false);
    // On revealed ground it is the ground that Hide brings back.
    rightClick(IN_HALL);
    choose('Reveal');
    expect(layer().visible).toBe(false);
    rightClick(IN_VAULT);
    expect(layer().visible).toBe(true);
    closeMenu();
  });

  it.each(['fog', 'eraser', 'move', 'select', 'measure'] as const)('marks nothing on the map with the %s tool: no outline of fog, painted or revealed', (tool) => {
    rightClick(IN_HALL);
    choose('Reveal');
    store.getState().setActiveTool(tool);
    // Of the fog's layer only its picture and, with the fog tool, the brush's ring may show: no other mark holds anything.
    const marks = fog.getContainer().children.filter((child): child is Graphics => child instanceof Graphics && child.zIndex !== 1002);
    expect(marks.filter((mark) => mark.visible && mark.getLocalBounds().width > 0)).toEqual([]);
    expect(layer().visible).toBe(false);
  });

  it('leaves the menu\'s mark out of the players\' frame and of a picture of the scene, and drops it in session view and a peek', () => {
    rightClick(IN_HALL);
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
    expect(layer().visible).toBe(false);
    rightClick(IN_HALL);
    expect(layer().visible).toBe(true);
    tokens.setPlayerSightProvider(() => undefined, () => true);
    tokens.refreshPlayerSight();
    expect(layer().visible).toBe(false);
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
    // The outline of what is under way, the brush's ring and the snapping guide lie above the fog.
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

  describe('a shape drawn with the fog tool', () => {
    const FROM = { x: 500, y: 20 };
    const TO = { x: 700, y: 160 };
    const added = (): FogOperation[] => Object.values(store.getState().objects.fog).slice(3);
    const plain = (): boolean => !Object.values(store.getState().objects.fog).some((operation) => 'area' in operation);

    it.each(['brush', 'rectangle', 'lasso', 'cells'] as const satisfies readonly FogShape[])('is plain fog with the %s, in one undo step: nothing carries a mark', (chosen) => {
      store.getState().setFogTool({ shape: chosen });
      store.getState().setActiveTool('fog');
      const before = steps();
      press(FROM);
      viewport.emit('pointermove', pointerEvent({ x: TO.x, y: FROM.y }));
      viewport.emit('pointermove', pointerEvent(TO));
      release(TO);
      expect(added().length).toBeGreaterThan(0);
      expect(added().every((operation) => !operation.isErasing)).toBe(true);
      expect(plain()).toBe(true);
      expect(remembered()).toBe(0);
      expect(steps()).toBe(before + 1);
      // Apart from the rooms, it is an object of its own.
      store.getState().setActiveTool('select');
      rightClick({ x: 690, y: 30 });
      expect(labels()).toEqual(ON_FOG);
      choose('Delete');
      expect([covers({ x: 690, y: 30 }), covers(IN_HALL), covers(IN_VAULT)]).toEqual([false, true, true]);
    });

    it('is plain fog with the polygon, closed on its first corner', () => {
      store.getState().setFogTool({ shape: 'polygon' });
      store.getState().setActiveTool('fog');
      // Corners on the grid, where they land: the last click is on the first again.
      for (const corner of [{ x: 490, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 140 }, { x: 490, y: 0 }]) {
        press(corner);
        release(corner);
      }
      expect(added()).toEqual([expect.objectContaining({ type: 'lasso', isErasing: false })]);
      expect(plain()).toBe(true);
    });

    it('erases plainly with the eraser and with Alt, and adds fog with the eraser and Alt: nothing is remembered of a stroke', () => {
      store.getState().setFogTool({ shape: 'rectangle' });
      store.getState().setActiveTool('fog');
      drag(FROM, TO, 0, { altKey: true });
      store.getState().setActiveTool('eraser');
      drag(FROM, TO);
      drag(FROM, TO, 0, { altKey: true });
      expect(added().map((operation) => [operation.type, operation.isErasing])).toEqual([['rectangle', true], ['rectangle', true], ['rectangle', false]]);
      expect(plain()).toBe(true);
    });

    it('is one object with the fog it touches: drawn out of the vault, it goes with both rooms', () => {
      store.getState().setFogTool({ shape: 'rectangle' });
      store.getState().setActiveTool('fog');
      drag({ x: 350, y: 70 }, { x: 490, y: 140 });
      expect(added()).toEqual([expect.objectContaining({ type: 'rectangle', isErasing: false, x: 350, y: 70, width: 140, height: 70 })]);
      rightClick({ x: 470, y: 100 });
      choose('Delete');
      expect([covers({ x: 470, y: 100 }), covers(IN_VAULT), covers(IN_HALL), covers(IN_BLOB)]).toEqual([false, false, false, true]);
    });

    it('leaves nothing on the map but the fog once the eraser has passed: no mark, and nothing remembered', () => {
      store.getState().setFogTool({ shape: 'rectangle' });
      store.getState().setActiveTool('eraser');
      drag({ x: 70, y: 70 }, { x: 350, y: 140 });
      expect(covers({ x: 200, y: 100 })).toBe(false);
      expect(remembered()).toBe(0);
      expect(plain()).toBe(true);
      const marks = fog.getContainer().children.filter((child): child is Graphics => child instanceof Graphics);
      expect(marks.filter((mark) => mark.visible && mark.getLocalBounds().width > 0)).toEqual([]);
      // What it left open is open ground: no menu there.
      openContextMenuGlobal.mockClear();
      store.getState().setActiveTool('select');
      rightClick({ x: 200, y: 100 });
      expect(openContextMenuGlobal).not.toHaveBeenCalled();
    });
  });
});
