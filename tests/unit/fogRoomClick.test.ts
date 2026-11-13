// @vitest-environment jsdom
import { Container, Graphics, Point, type FederatedPointerEvent, type PointData } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

import { areaOutline, fogAreaList, type FogArea } from '../../src/app/fog/fogAreas';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import { FogGesture } from '../../src/app/pixi/fog/FogGesture';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogLassoFill, FogOperation } from '../../src/app/types/fogTypes';
import type { WallInput } from '../../src/app/types/wallTypes';
import { showNotice } from '../../src/app/ui/notice';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** A camera that shows the map unscaled, as the gesture reads a viewport. */
class Camera extends Container {
  toWorld(screen: PointData): Point {
    return new Point(screen.x, screen.y);
  }
}

type Place = readonly [number, number];
interface Keys { altKey?: boolean }

interface RoomScene {
  store: ViewAtlasStore;
  gesture: FogGesture;
  /** Where the room under the pointer is outlined. */
  outline: Graphics;
  press(at: Place, keys?: Keys): void;
  move(at: Place, keys?: Keys): void;
  release(): void;
  click(at: Place, keys?: Keys): void;
  fog: () => FogOperation[];
  areas: () => readonly FogArea[];
  steps: () => number;
  undo: () => void;
}

const MAP: MapRect = { x: 0, y: 0, width: 1400, height: 1050 };
/** The hall, 140 to 420 both ways, and the vault beside it, which share the wall at 420. */
const HALL = ['140,140', '140,420', '420,140', '420,420'];
const VAULT = ['420,140', '420,420', '700,140', '700,420'];
const WALLS: WallInput[] = [
  { type: 'solid', p1: { x: 140, y: 140 }, p2: { x: 700, y: 140 } },
  { type: 'solid', p1: { x: 700, y: 140 }, p2: { x: 700, y: 420 } },
  { type: 'solid', p1: { x: 700, y: 420 }, p2: { x: 140, y: 420 } },
  { type: 'solid', p1: { x: 140, y: 420 }, p2: { x: 140, y: 140 } },
  { type: 'door', closed: false, p1: { x: 420, y: 140 }, p2: { x: 420, y: 420 } },
];

const stops: Array<() => void> = [];
afterEach(() => {
  while (stops.length) stops.pop()!();
  document.body.empty();
  vi.mocked(showNotice).mockClear();
});

/** The fog tool's gesture with the Room shape on a walled map, as the fog's renderer wires it to the store. */
function roomScene(what: 'hide' | 'reveal' | 'areas' = 'hide', mapRect: MapRect | null = MAP): RoomScene {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-room-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: what === 'reveal' ? 'eraser' : 'fog', isMapLoading: false, isGMView: true });
  store.getState().setFogTool({ areas: what === 'areas', shape: 'room' });
  for (const wall of WALLS) store.getState().addWall(wall);
  store.temporal.getState().clear();
  const viewport = new Camera();
  const layer = new Container();
  const gesture = new FogGesture({
    layer, viewport: viewport as unknown as Viewport, canvas: () => document.body.createEl('canvas'), store,
    host: { showStroke: vi.fn(), showCommitted: vi.fn() },
    mapRect: () => mapRect,
  });
  const stopFollowing = store.subscribe((state, previous) => {
    if (state.fogTool !== previous.fogTool) gesture.follow(state.fogTool);
  });
  stops.push(() => {
    stopFollowing();
    gesture.destroy();
  });
  const pointer = (type: string, [x, y]: Place, keys: Keys = {}): void => {
    viewport.emit(type, { button: 0, global: { x, y }, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...keys } as unknown as FederatedPointerEvent);
  };
  const history = getHistoryStore(store)!;
  const scene: RoomScene = {
    store, gesture,
    // The outline of what is under way is the layer's first child.
    outline: layer.children[0] as Graphics,
    press: (at, keys) => pointer('pointerdown', at, keys),
    move: (at, keys) => pointer('pointermove', at, keys),
    release: () => pointer('pointerup', [0, 0]),
    click: (at, keys) => {
      scene.press(at, keys);
      scene.release();
    },
    fog: () => Object.values(store.getState().objects.fog),
    areas: () => fogAreaList(store.getState().objects.fog),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
  };
  return scene;
}

const corners = (points: readonly { x: number; y: number }[]): string[] => points.map(({ x, y }) => `${x},${y}`).sort();
const lasso = (operation: FogOperation | undefined): string[] => corners((operation as FogLassoFill | undefined)?.points ?? []);

describe('a click with the Room shape', () => {
  it('hides the room the walls enclose around it, as one fog shape and one undo step', () => {
    const s = roomScene('hide');
    s.click([200, 200]);
    expect(s.fog()).toEqual([expect.objectContaining({ type: 'lasso', isErasing: false })]);
    expect(lasso(s.fog()[0])).toEqual(HALL);
    expect(s.fog()[0]).not.toHaveProperty('area');
    expect(s.steps()).toBe(1);
    // The room on the other side of the door, open as it is, is another.
    s.click([600, 300]);
    expect(lasso(s.fog()[1])).toEqual(VAULT);
    expect(s.steps()).toBe(2);
    s.undo();
    expect(s.fog()).toHaveLength(1);
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('reveals with the revealing tool, and does the other thing while Alt is held', () => {
    const reveal = roomScene('reveal');
    reveal.click([200, 200]);
    expect(reveal.fog()).toEqual([expect.objectContaining({ type: 'lasso', isErasing: true })]);
    reveal.click([600, 300], { altKey: true });
    expect(reveal.fog()[1]).toMatchObject({ isErasing: false });
    const hide = roomScene('hide');
    hide.click([200, 200], { altKey: true });
    expect(hide.fog()).toEqual([expect.objectContaining({ isErasing: true })]);
    expect(lasso(hide.fog()[0])).toEqual(HALL);
  });

  it('does nothing but say so where the walls enclose no room: outside them, in a wall, and on a scene without a map', () => {
    const s = roomScene('hide');
    s.click([900, 800]);
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenLastCalledWith('The walls here do not enclose a room.');
    s.click([300, 140]);
    expect(showNotice).toHaveBeenCalledTimes(2);
    expect(s.fog()).toEqual([]);
    expect(s.steps()).toBe(0);
    const bare = roomScene('hide', null);
    bare.click([200, 200]);
    expect(bare.fog()).toEqual([]);
    expect(showNotice).toHaveBeenCalledTimes(3);
  });

  it('is a click only where the press is released in place, with the primary button', () => {
    const s = roomScene('hide');
    s.press([200, 200]);
    s.move([230, 215]);
    s.release();
    expect(s.fog()).toEqual([]);
    // A move of a pixel or two is still a click.
    s.press([200, 200]);
    s.move([202, 201]);
    s.release();
    expect(s.fog()).toHaveLength(1);
    // The right button pans the map.
    const before = s.fog().length;
    (s.gesture as unknown as { deps: { viewport: Container } }).deps.viewport.emit('pointerdown', { button: 2, global: { x: 600, y: 300 } } as unknown as FederatedPointerEvent);
    s.release();
    expect(s.fog()).toHaveLength(before);
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('takes no press once another shape is chosen, and leaves the room\'s outline', () => {
    const s = roomScene('hide');
    s.move([200, 200]);
    s.press([200, 200]);
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.release();
    expect(s.fog()).toEqual([]);
  });
});

describe('the room under the pointer', () => {
  it('is outlined while the pointer is in it, drawn anew only for another room, and not outside the walls', () => {
    const s = roomScene('hide');
    const clear = vi.spyOn(s.outline, 'clear');
    const stroke = vi.spyOn(s.outline, 'stroke');
    s.move([200, 200]);
    // A casing and a line.
    expect(stroke).toHaveBeenCalledTimes(2);
    const bounds = s.outline.getLocalBounds();
    expect([Math.round(bounds.minX), Math.round(bounds.maxX), Math.round(bounds.minY), Math.round(bounds.maxY)]).toEqual([138, 422, 138, 422]);
    s.move([250, 330]);
    s.move([400, 160]);
    expect(stroke).toHaveBeenCalledTimes(2);
    s.move([500, 300]);
    expect(stroke).toHaveBeenCalledTimes(4);
    expect(Math.round(s.outline.getLocalBounds().minX)).toBe(418);
    // Outside the walls nothing is outlined.
    clear.mockClear();
    s.move([900, 800]);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(s.outline.getLocalBounds().width).toBe(0);
    s.move([950, 820]);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('is the GM\'s alone: no picture for the players has the outline', () => {
    const s = roomScene('hide');
    s.move([200, 200]);
    expect(s.gesture.playerLayers()).toContainEqual({ layer: s.outline, visible: false });
  });
});

describe('a click with the Room shape in Areas mode', () => {
  it('makes the room an area, hidden, in one undo step', () => {
    const s = roomScene('areas');
    s.click([200, 200]);
    expect(s.areas()).toHaveLength(1);
    expect(corners(areaOutline(s.areas()[0]!))).toEqual(HALL);
    expect(s.areas()[0]).toMatchObject({ isErasing: false, area: {} });
    expect(s.steps()).toBe(1);
    s.undo();
    expect(s.areas()).toEqual([]);
  });

  it('selects the area a room already is instead of making a second one', () => {
    const s = roomScene('areas');
    s.click([200, 200]);
    const [hall] = s.areas();
    s.click([300, 300]);
    expect(s.areas()).toHaveLength(1);
    expect(s.store.getState().fogAreaSelected).toBe(hall!.id);
    expect(s.steps()).toBe(1);
    // One drawn by hand a little inside the walls is that room too: a click beside it, in the room, selects it.
    const drawn = roomScene('areas');
    const vault = drawn.store.getState().addFogArea({ type: 'rectangle', x: 429, y: 141, width: 270, height: 278 })!;
    drawn.click([426, 300]);
    expect(drawn.areas()).toHaveLength(1);
    expect(drawn.store.getState().fogAreaSelected).toBe(vault);
  });

  it('fits a room to the areas that lie in it, like any new area', () => {
    const s = roomScene('areas');
    // An area over the hall's left half.
    s.store.getState().addFogArea({ type: 'rectangle', x: 100, y: 100, width: 180, height: 360 });
    const before = s.steps();
    s.click([350, 300]);
    expect(s.areas()).toHaveLength(2);
    const room = s.areas().find((area) => area.type === 'lasso')!;
    expect(corners(areaOutline(room))).toEqual(['280,140', '280,420', '420,140', '420,420']);
    expect(s.steps()).toBe(before + 1);
  });

  it('says so where the walls enclose no room, and lets go of the selection', () => {
    const s = roomScene('areas');
    s.click([200, 200]);
    s.click([200, 200]);
    expect(s.store.getState().fogAreaSelected).not.toBeNull();
    s.click([900, 800]);
    expect(showNotice).toHaveBeenLastCalledWith('The walls here do not enclose a room.');
    expect(s.store.getState().fogAreaSelected).toBeNull();
    expect(s.areas()).toHaveLength(1);
  });
});
