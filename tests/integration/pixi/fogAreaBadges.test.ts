// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Point, Texture, type Application, type EventSystem, type FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { FogOfWarRenderer } from '../../../src/app/pixi/fog/FogOfWarRenderer';
import { captureWithLayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
import { isHandled } from '../../../src/app/pixi/utils/handledEvents';
import { AssetService } from '../../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));
// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({ createLucideIconTexture: vi.fn(async () => new Texture()) }));

const GOBLIN_IMAGE = 'atlas-vtt/collections/default/tokens/goblin.png';
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
/** The hall's badge sits in its middle, where a token stands too. */
const HALL = { type: 'rectangle', x: 0, y: 0, width: 210, height: 210 } as const;
const BADGE = { x: 105, y: 105 };
const BESIDE = { x: 600, y: 400 };

type ViewStore = ReturnType<typeof createViewAtlasStore>;

/** A pointer event at screen position (x, y); the viewport is unzoomed, so screen = world. */
const pointerEvent = ({ x, y }: { x: number; y: number }, button = 0): FederatedPointerEvent =>
  ({ button, pointerId: 1, pointerType: 'mouse', global: new Point(x, y), clientX: x + 300, clientY: y + 40, stopPropagation: vi.fn(), preventDefault: vi.fn() }) as unknown as FederatedPointerEvent;

describe('the badges of fog areas on the map', () => {
  let viewport: Viewport;
  let store: ViewStore;
  let tokens: TokenRenderer;
  let fog: FogOfWarRenderer;
  let restoreGraphics: () => void;
  let hall: string;

  const layer = (): Container => fog.getContainer().getChildByLabel('fog-areas') as Container;
  const outlines = (): Graphics => layer().getChildAt(0);
  const name = (): Container | null => layer().getChildByLabel('fog-area-name');
  const area = (): { isErasing: boolean } => store.getState().objects.fog[hall]!;
  const steps = (): number => getHistoryStore(store)!.getState().pastStates.length;
  const click = (at: { x: number; y: number }, button = 0): FederatedPointerEvent => {
    const press = pointerEvent(at, button);
    viewport.emit('pointerdown', press);
    viewport.emit('pointerup', pointerEvent(at, button));
    return press;
  };
  const menu = (): ContextMenuEntry[] => openContextMenuGlobal.mock.calls[openContextMenuGlobal.mock.calls.length - 1]![0] as ContextMenuEntry[];
  const choose = (label: string): void => {
    const entry = menu().find((candidate) => candidate.type === 'item' && candidate.label === label);
    if (entry?.type === 'item') entry.onClick();
  };

  beforeEach(async () => {
    restoreGraphics = stubJsdomGraphics();
    (AssetService as unknown as { instance: AssetService | null }).instance = null;
    const { app } = createInMemoryApp({ files: { [GOBLIN_IMAGE]: 'goblin-bytes' } });
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
    store = createViewAtlasStore(app, 'fog-badges-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/test.atlasmap');
    const eventBus = new EventEmitter();
    const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / 70) * 70 + 35, y: Math.floor(y / 70) * 70 + 35 });
    const grid = { getOptions: () => ({ type: 'square', size: 70, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap, snapTokenCenter: snap } as unknown as GridSystem;
    tokens = new TokenRenderer(app, viewport, grid, vi.fn(), store, eventBus, 'fog-badges-view');
    const canvas = document.createElement('canvas');
    tokens.setPixiApp({ ticker: { add: vi.fn(), remove: vi.fn(), lastTime: 0 }, canvas, renderer: { generateTexture: vi.fn(() => new Texture()) } } as unknown as Application);

    fog = new FogOfWarRenderer(viewport, { canvas } as unknown as Application, eventBus as never, store, () => null);
    viewport.addChild(fog.getContainer());
    fog.reorderViewportListeners();
    // As the view wires them (`PixiRendererOrchestrator.wireFogAreas`).
    tokens.setFogAreaHandlers(fog.areaPointer());
    fog.showsPlayers = () => tokens.playersSeeOnCanvas() !== null;
    tokens.onPlayersViewChange(() => fog.refreshVisibility());

    hall = store.getState().addFogArea(HALL, 'Hall')!;
    store.getState().addToken({ id: 'goblin', ...BADGE, size: 1, imagePath: GOBLIN_IMAGE, layer: 0, isHidden: false, rotation: 0 });
    await vi.waitFor(() => expect(tokens.getTokenSprites().goblin).toBeInstanceOf(Container));
    openContextMenuGlobal.mockClear();
  });

  afterEach(() => {
    fog.destroy();
    tokens.destroy();
    viewport.destroy();
    restoreGraphics();
    vi.restoreAllMocks();
  });

  it('shows a badge in the middle of the area, in the GM\'s view', () => {
    expect(layer().visible).toBe(true);
    expect(fog.areaBadgeSpot(hall)).toEqual({ x: expect.closeTo(105, 0), y: expect.closeTo(105, 0) });
    expect(fog.areaPointer().hitTest(BADGE.x, BADGE.y)).toBe(hall);
    expect(fog.areaPointer().hitTest(BADGE.x + 13, BADGE.y)).toBe(hall);
    expect(fog.areaPointer().hitTest(BADGE.x + 16, BADGE.y)).toBeNull();
  });

  it.each(['select', 'move', 'measure', 'draw', 'wall', 'note-pin'] as const)('flips the area on a click on its badge with the %s tool, in one undo step, and the click reaches no token', (tool) => {
    store.getState().setActiveTool(tool);
    const before = steps();
    const press = click(BADGE);
    expect(area().isErasing).toBe(true);
    expect(isHandled(press)).toBe(true);
    expect(steps()).toBe(before + 1);
    expect(store.getState().selectedIds).toEqual([]);
    click(BADGE);
    expect(area().isErasing).toBe(false);
    expect(steps()).toBe(before + 2);
  });

  it.each(['fog', 'eraser'] as const)('flips the area on a click on its badge with the fog tool (%s) too, and starts no stroke', (tool) => {
    store.getState().setActiveTool(tool);
    click(BADGE);
    expect(area().isErasing).toBe(true);
    expect(Object.keys(store.getState().objects.fog)).toEqual([hall]);
    // Beside the badge the tool draws as ever.
    viewport.emit('pointerdown', pointerEvent(BESIDE));
    viewport.emit('pointermove', pointerEvent({ x: BESIDE.x + 40, y: BESIDE.y }));
    viewport.emit('pointerup', pointerEvent({ x: BESIDE.x + 40, y: BESIDE.y }));
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(2);
  });

  it('gives a click beside the badge to the token under it', () => {
    store.getState().setActiveTool('select');
    click({ x: BADGE.x + 20, y: BADGE.y });
    expect(area().isErasing).toBe(false);
    expect(store.getState().selectedIds).toEqual(['goblin']);
  });

  it('opens the badge\'s menu on a right-click released in place: Reveal or Hide, Rename, and Delete last', () => {
    const press = click(BADGE, 2);
    // The press stays the map's, so a right-drag still pans.
    expect(isHandled(press)).toBe(false);
    expect(openContextMenuGlobal).toHaveBeenCalledExactlyOnceWith(expect.any(Array), { x: BADGE.x + 300, y: BADGE.y + 40 });
    expect(menu().map((entry) => (entry.type === 'item' ? [entry.label, entry.destructive === true] : null))).toEqual([['Reveal', false], ['Rename', false], ['Delete', true]]);

    choose('Reveal');
    expect(area().isErasing).toBe(true);
    click(BADGE, 2);
    expect(menu().map((entry) => (entry.type === 'item' ? entry.label : null))).toEqual(['Hide', 'Rename', 'Delete']);

    choose('Rename');
    expect(store.getState().fogAreaPopover).toBe(hall);

    const before = steps();
    choose('Delete');
    expect(store.getState().objects.fog).toEqual({});
    expect(steps()).toBe(before + 1);
    // Its renaming ends with it.
    expect(store.getState().fogAreaPopover).toBeNull();
    expect(layer().visible).toBe(false);
  });

  it('opens no menu when the right button drags the map away', () => {
    viewport.emit('pointerdown', pointerEvent(BADGE, 2));
    viewport.emit('pointermove', pointerEvent({ x: BADGE.x + 60, y: BADGE.y + 30 }, 2));
    viewport.emit('pointerup', pointerEvent({ x: BADGE.x + 60, y: BADGE.y + 30 }, 2));
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('lights the badge the pointer is on, with the area\'s name and outline, and lets go when it leaves', () => {
    store.getState().setActiveTool('select');
    expect(outlines().context.instructions).toHaveLength(0);
    viewport.emit('pointermove', pointerEvent(BADGE));
    expect(viewport.cursor).toBe('pointer');
    expect(outlines().context.instructions.length).toBeGreaterThan(0);
    expect(name()?.visible).toBe(true);
    // No token under the badge is hovered with it.
    viewport.emit('pointermove', pointerEvent(BESIDE));
    expect(outlines().context.instructions).toHaveLength(0);
    expect(name()?.visible).toBe(false);
  });

  it('shows every area\'s outline while the fog tool is chosen, and none with another tool', () => {
    store.getState().setActiveTool('fog');
    expect(outlines().context.instructions.length).toBeGreaterThan(0);
    store.getState().setActiveTool('eraser');
    expect(outlines().context.instructions.length).toBeGreaterThan(0);
    store.getState().setActiveTool('move');
    expect(outlines().context.instructions).toHaveLength(0);
  });

  it('shows no name beside a badge whose area has none', () => {
    store.getState().updateFogArea(hall, { name: '' });
    viewport.emit('pointermove', pointerEvent(BADGE));
    expect(name()?.visible ?? false).toBe(false);
  });

  it('leaves the layer out of the players\' frame and of a picture of the scene', () => {
    for (const layers of [fog.getPlayerViewLayers(), fog.getGmViewLayers()]) {
      expect(layers).toContainEqual({ layer: layer(), visible: false });
      let during: boolean | null = null;
      captureWithLayerVisibility(layers, () => undefined, () => { during = layer().visible; });
      expect(during).toBe(false);
      expect(layer().visible).toBe(true);
    }
  });

  it('shows no badge, and takes no click, while the canvas shows the players\' view', () => {
    store.getState().setActiveTool('select');
    store.getState().setGMView(false);
    expect(layer().visible).toBe(false);
    click(BADGE);
    expect(area().isErasing).toBe(false);
    // A right-click there is the token's.
    click(BADGE, 2);
    expect(menu().some((entry) => entry.type === 'item' && (entry.label === 'Reveal' || entry.label === 'Rename'))).toBe(false);
    store.getState().setGMView(true);
    expect(layer().visible).toBe(true);

    // A peek: the store still says the GM's view.
    let peeking = true;
    tokens.setPlayerSightProvider(() => undefined, () => peeking);
    tokens.refreshPlayerSight();
    expect(layer().visible).toBe(false);
    expect(fog.areaPointer().hitTest(BADGE.x, BADGE.y)).toBeNull();
    peeking = false;
    tokens.refreshPlayerSight();
    expect(layer().visible).toBe(true);
    expect(fog.areaPointer().hitTest(BADGE.x, BADGE.y)).toBe(hall);
  });

  it('shows only the areas of the level shown', () => {
    store.setState({ levels: LEVELS, viewedLevel: 'upper' });
    expect(fog.areaPointer().hitTest(BADGE.x, BADGE.y)).toBeNull();
    expect(layer().visible).toBe(false);
    const above = store.getState().addFogArea({ type: 'rectangle', x: 400, y: 200, width: 100, height: 100 })!;
    expect(fog.areaPointer().hitTest(450, 250)).toBe(above);
    store.getState().setViewedLevel('ground');
    expect(fog.areaPointer().hitTest(450, 250)).toBeNull();
    expect(fog.areaPointer().hitTest(BADGE.x, BADGE.y)).toBe(hall);
  });

  it('ends an area\'s renaming when the area goes, the level changes, the players\' view shows or the map loads', () => {
    const renaming = (): string | null => store.getState().fogAreaPopover;
    const open = (): void => {
      store.getState().openFogAreaPopover(hall);
      expect(renaming()).toBe(hall);
    };
    open();
    store.getState().setGMView(false);
    expect(renaming()).toBeNull();
    store.getState().setGMView(true);

    open();
    store.setState({ levels: LEVELS, viewedLevel: 'upper' });
    expect(renaming()).toBeNull();
    store.setState({ levels: undefined, viewedLevel: null });

    open();
    store.setState({ isMapLoading: true });
    expect(renaming()).toBeNull();
    store.setState({ isMapLoading: false });

    // An area that undo takes away.
    const fresh = store.getState().addFogArea({ type: 'rectangle', x: 500, y: 300, width: 50, height: 50 })!;
    store.getState().openFogAreaPopover(fresh);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.fog[fresh]).toBeUndefined();
    expect(renaming()).toBeNull();
  });

  it('keeps badges the size they are on screen when the map is zoomed', () => {
    const badge = (layer().getChildByLabel('fog-area-badges') as Container).getChildAt(0);
    expect(badge.scale.x).toBe(1);
    viewport.scale.set(2);
    viewport.emit('zoomed', { viewport, type: 'wheel' });
    expect(badge.scale.x).toBe(0.5);
    // Twice as near on the map as the pointer is on screen.
    expect(fog.areaPointer().hitTest(BADGE.x + 6, BADGE.y)).toBe(hall);
    expect(fog.areaPointer().hitTest(BADGE.x + 8, BADGE.y)).toBeNull();
  });
});
