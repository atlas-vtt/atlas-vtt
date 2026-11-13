// @vitest-environment jsdom
import { Container, Point, type FederatedPointerEvent, type Graphics, type PointData } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

import { areaOutline, fogAreaList, MAX_FOG_AREAS, trimmedAreas, type FogArea } from '../../src/app/fog/fogAreas';
import type { FogShape } from '../../src/app/fog/fogToolChoices';
import { FogGesture } from '../../src/app/pixi/fog/FogGesture';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { showNotice } from '../../src/app/ui/notice';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** A camera that shows the map unscaled, as the gesture reads a viewport. */
class Camera extends Container {
  toWorld(screen: PointData): Point {
    return new Point(screen.x, screen.y);
  }

  toScreen(x: number, y: number): Point {
    return new Point(x, y);
  }
}

interface Keys {
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
}

type Place = readonly [number, number];

interface AreasScene {
  store: ViewAtlasStore;
  gesture: FogGesture;
  /** What the gesture last asked the picture to show on the fog. */
  shown: () => FogOperation | readonly FogOperation[] | undefined;
  press(at: Place, keys?: Keys): void;
  move(at: Place, keys?: Keys): void;
  release(): void;
  click(at: Place, keys?: Keys): void;
  /** A press at the first place, a move to each further one, and a release. */
  drag(places: readonly Place[], keys?: Keys): void;
  /** A key pressed in the map's window; the event as it came back. */
  key(name: string, target?: EventTarget): KeyboardEvent;
  /** The keys the map's own shortcuts heard. */
  shortcuts: ReturnType<typeof vi.fn>;
  areas: () => readonly FogArea[];
  /** How often the scene's fog was written since the scene was made. */
  writes: () => number;
  /** The outline a drag of the selected area shows the GM, as it will be: left, right, top and bottom of its line's middle; null while none shows. */
  previewed: () => number[] | null;
  /** The area a drag holds, as the layer of the areas' outlines is told. */
  held: () => string | null;
  selected: () => string | null;
  undo: () => void;
  steps: () => number;
}

const stops: Array<() => void> = [];
afterEach(() => {
  while (stops.length) stops.pop()!();
  document.body.empty();
  vi.mocked(showNotice).mockClear();
});

/** The fog tool's gesture in Areas mode on a 70 px grid, as the fog's renderer wires it to the store. */
function areasScene(shape: FogShape = 'rectangle', keysBelongToMap?: (event: KeyboardEvent) => boolean): AreasScene {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-areas-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'fog', isMapLoading: false, isGMView: true });
  store.getState().setFogTool({ areas: true, shape });
  const viewport = new Camera();
  const canvas = document.body.createEl('canvas');
  const showStroke = vi.fn();
  let held: string | null = null;
  const gesture = new FogGesture({
    layer: new Container(), viewport: viewport as unknown as Viewport, canvas: () => canvas, store,
    host: { showStroke, showCommitted: vi.fn() },
    areaHeld: (areaId) => { held = areaId; },
    ...(keysBelongToMap && { keysBelongToMap }),
  });
  let writes = 0;
  const stopCounting = store.subscribe((state, previous) => {
    if (state.objects.fog !== previous.objects.fog) writes++;
  });
  const shortcuts = vi.fn();
  window.addEventListener('keydown', shortcuts);
  const stopFollowing = store.subscribe((state, previous) => {
    if (state.fogTool !== previous.fogTool) gesture.follow(state.fogTool);
    if (state.activeTool !== previous.activeTool && state.activeTool !== 'fog' && state.activeTool !== 'eraser') gesture.stop();
  });
  stops.push(() => {
    stopFollowing();
    stopCounting();
    window.removeEventListener('keydown', shortcuts);
    gesture.destroy();
  });
  // The editor's own layer: the outline a drag will leave lies under the handles.
  const [preview] = gesture.areaLayers().map((entry) => entry.layer as Container).find((layer) => layer.children.length === 2)!.children as [Graphics, Graphics];
  const pointer = (type: string, [x, y]: Place, keys: Keys = {}): void => {
    viewport.emit(type, { button: 0, global: { x, y }, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...keys } as unknown as FederatedPointerEvent);
  };
  const history = getHistoryStore(store)!;
  const scene: AreasScene = {
    store, gesture, shortcuts,
    shown: () => showStroke.mock.lastCall?.[0] as FogOperation | readonly FogOperation[] | undefined,
    press: (at, keys) => pointer('pointerdown', at, keys),
    move: (at, keys) => pointer('pointermove', at, keys),
    release: () => pointer('pointerup', [0, 0]),
    click: (at, keys) => {
      scene.press(at, keys);
      scene.release();
    },
    drag: ([first, ...rest], keys) => {
      scene.press(first!, keys);
      for (const place of rest) scene.move(place, keys);
      scene.release();
    },
    key: (name, target = document.body) => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
    areas: () => fogAreaList(store.getState().objects.fog),
    writes: () => writes,
    previewed: () => {
      const bounds = preview.getLocalBounds();
      // The line is 4 px wide with its casing: 2 px to either side of the outline.
      return bounds.width > 0 ? [bounds.minX + 2, bounds.maxX - 2, bounds.minY + 2, bounds.maxY - 2].map(Math.round) : null;
    },
    held: () => held,
    selected: () => store.getState().fogAreaSelected,
    undo: () => history.getState().undo(),
    steps: () => history.getState().pastStates.length,
  };
  return scene;
}

/** The corners of an outline in an order that does not depend on where it starts or which way it runs. */
const corners = (area: FogArea | undefined): string[] => (area ? areaOutline(area) : []).map((point) => `${point.x},${point.y}`).sort();
const at = (...points: Place[]): string[] => points.map(([x, y]) => `${x},${y}`).sort();
const box = (x: number, y: number, width: number, height: number): string[] => at([x, y], [x + width, y], [x + width, y + height], [x, y + height]);

/** The hall, from 70 to 210 both ways. */
function withHall(s: AreasScene): string {
  return s.store.getState().addFogArea({ type: 'rectangle', x: 70, y: 70, width: 140, height: 140 })!;
}

/** The hall as an outline of four corners, which a dragged corner leaves free. */
function withLassoHall(s: AreasScene): string {
  return s.store.getState().addFogArea({ type: 'lasso', points: [{ x: 70, y: 70 }, { x: 210, y: 70 }, { x: 210, y: 210 }, { x: 70, y: 210 }] })!;
}

describe('drawing in Areas mode', () => {
  it('makes a hidden area of a dragged rectangle, in one undo step, shown as the fog it will be', () => {
    const s = areasScene();
    s.press([70, 70]);
    s.move([210, 210]);
    expect(s.shown()).toMatchObject({ type: 'rectangle', isErasing: false, x: 70, y: 70, width: 140, height: 140 });
    expect(s.areas()).toEqual([]);
    s.release();
    expect(s.areas()).toEqual([expect.objectContaining({ type: 'rectangle', isErasing: false, x: 70, y: 70, width: 140, height: 140, area: {} })]);
    expect(s.steps()).toBe(1);
    // Drawing selects nothing: the next room is drawn at once.
    expect(s.selected()).toBeNull();
    s.undo();
    expect(s.areas()).toEqual([]);
  });

  it('is no shape while the pointer has not left the place it was pressed at', () => {
    const s = areasScene();
    s.press([70, 70]);
    s.move([72, 71]);
    expect(s.gesture.active).toBe(false);
    s.release();
    expect(s.areas()).toEqual([]);
    expect(s.steps()).toBe(0);
  });

  it('fits a second area to its neighbour, so the two never overlap', () => {
    const s = areasScene();
    const hall = withHall(s);
    // Begun beside the hall, drawn across its corner.
    s.drag([[350, 70], [140, 280]]);
    const [first, second] = s.areas();
    const added = first!.id === hall ? second! : first!;
    expect(s.areas()).toHaveLength(2);
    expect(added.type).toBe('lasso');
    expect(corners(added)).toEqual(at([210, 70], [350, 70], [350, 280], [140, 280], [140, 210], [210, 210]));
    // The hall covers nothing of it.
    expect(trimmedAreas([areaOutline(added)], [areaOutline(s.store.getState().objects.fog[hall] as FogArea)])).toEqual([undefined]);
    expect(s.steps()).toBe(2);
  });

  it('adds a shape begun inside an area to that area, in one undo step', () => {
    const s = areasScene();
    const hall = withHall(s);
    s.drag([[140, 140], [280, 280]]);
    expect(s.areas()).toHaveLength(1);
    expect(corners(s.areas()[0])).toEqual(at([70, 70], [210, 70], [210, 140], [280, 140], [280, 280], [140, 280], [140, 210], [70, 210]));
    expect(s.areas()[0]!.id).toBe(hall);
    expect(s.steps()).toBe(2);
    s.undo();
    expect(corners(s.areas()[0])).toEqual(box(70, 70, 140, 140));
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('refuses to add a shape that would enclose a gap, and says so', () => {
    const s = areasScene('lasso');
    withHall(s);
    // A band that leaves the hall, turns round and comes back to it.
    s.drag([[200, 80], [300, 80], [300, 200], [200, 200], [200, 190], [290, 190], [290, 90], [200, 90]]);
    expect(corners(s.areas()[0])).toEqual(box(70, 70, 140, 140));
    expect(s.steps()).toBe(1);
    expect(showNotice).toHaveBeenCalledExactlyOnceWith('That shape does not make one area with this one.');
  });

  it('takes a shape begun inside an area with Alt away from every area it covers, in one undo step', () => {
    const s = areasScene();
    const hall = withHall(s);
    const cellar = s.store.getState().addFogArea({ type: 'rectangle', x: 280, y: 70, width: 140, height: 140 })!;
    s.drag([[140, 140], [350, 280]], { altKey: true });
    const fog = s.store.getState().objects.fog;
    expect(corners(fog[hall] as FogArea)).toEqual(at([70, 70], [210, 70], [210, 140], [140, 140], [140, 210], [70, 210]));
    expect(corners(fog[cellar] as FogArea)).toEqual(at([280, 70], [420, 70], [420, 210], [350, 210], [350, 140], [280, 140]));
    expect(s.areas()).toHaveLength(2);
    expect(s.steps()).toBe(3);
    s.undo();
    expect(corners(s.store.getState().objects.fog[hall] as FogArea)).toEqual(box(70, 70, 140, 140));
    expect(corners(s.store.getState().objects.fog[cellar] as FogArea)).toEqual(box(280, 70, 140, 140));
  });

  it('leaves an area a shape would pierce as it is, with one notice', () => {
    const s = areasScene();
    withHall(s);
    s.drag([[105, 105], [175, 175]], { altKey: true, ctrlKey: true });
    expect(corners(s.areas()[0])).toEqual(box(70, 70, 140, 140));
    expect(s.steps()).toBe(1);
    expect(showNotice).toHaveBeenCalledExactlyOnceWith('An area cannot be split or pierced. It stays as it is.');
  });

  it('makes a new area of a shape begun outside every area, with Alt too', () => {
    const s = areasScene();
    withHall(s);
    s.drag([[420, 70], [560, 210]], { altKey: true });
    expect(s.areas()).toHaveLength(2);
  });

  it('makes an area of a polygon, whose first click on the empty map places a corner', () => {
    const s = areasScene('polygon');
    s.click([280, 70]);
    expect(s.gesture.active).toBe(true);
    s.click([420, 70]);
    s.click([420, 210]);
    s.key('Enter');
    expect(s.areas()).toEqual([expect.objectContaining({ type: 'lasso', isErasing: false, points: [{ x: 280, y: 70 }, { x: 420, y: 70 }, { x: 420, y: 210 }] })]);
    expect(s.steps()).toBe(1);
  });

  it('selects with a polygon\'s first click inside an area, and begins the polygon there once the area is selected', () => {
    const s = areasScene('polygon');
    const hall = withHall(s);
    s.click([140, 140], { ctrlKey: true });
    expect(s.selected()).toBe(hall);
    expect(s.gesture.active).toBe(false);
    s.click([140, 140], { ctrlKey: true });
    expect(s.gesture.active).toBe(true);
    s.click([280, 140]);
    s.click([280, 280]);
    s.key('Enter');
    // Begun inside the hall: added to it.
    expect(s.areas()).toHaveLength(1);
    expect(areaOutline(s.areas()[0]!).length).toBeGreaterThan(4);
  });

  it('tells the GM where the map holds as many areas as it can, and adds none', () => {
    const s = areasScene();
    const fog: Record<string, FogOperation> = {};
    for (let index = 0; index < MAX_FOG_AREAS; index++) {
      const id = `area-${String(index).padStart(3, '0')}`;
      fog[id] = { id, kind: 'fog', timestamp: index, isErasing: false, type: 'rectangle', x: 2000 + index * 20, y: 2000, width: 10, height: 10, area: {} };
    }
    s.store.setState((state) => ({ objects: { ...state.objects, fog } }));
    const before = s.steps();
    s.drag([[70, 70], [210, 210]]);
    expect(Object.keys(s.store.getState().objects.fog)).toHaveLength(MAX_FOG_AREAS);
    expect(s.steps()).toBe(before);
    expect(showNotice).toHaveBeenCalledExactlyOnceWith('This map has as many areas as it can hold. Delete one to draw another.');
  });

  it('drops a shape under way when the tool leaves Areas', () => {
    const s = areasScene();
    s.press([70, 70]);
    s.move([210, 210]);
    expect(s.gesture.active).toBe(true);
    s.store.getState().setFogTool({ areas: false });
    expect(s.gesture.active).toBe(false);
    s.release();
    expect(s.store.getState().objects.fog).toEqual({});
  });
});

describe('selecting an area', () => {
  it('selects the area clicked in, and lets go on a click on the empty map; neither is an undo step', () => {
    const s = areasScene();
    const hall = withHall(s);
    const before = s.steps();
    s.click([140, 140]);
    expect(s.selected()).toBe(hall);
    s.click([400, 400]);
    expect(s.selected()).toBeNull();
    expect(s.steps()).toBe(before);
    expect(s.areas()).toHaveLength(1);
  });

  it('lets go with Escape, which the map\'s shortcuts never hear', () => {
    const s = areasScene();
    withHall(s);
    s.click([140, 140]);
    const event = s.key('Escape');
    expect(s.selected()).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(s.shortcuts).not.toHaveBeenCalled();
    // With nothing selected the key is the map's again.
    s.key('Escape');
    expect(s.shortcuts).toHaveBeenCalledTimes(1);
  });

  it.each(['Delete', 'Backspace'])('deletes the selected area with %s, in one undo step, and the key never reaches the map\'s shortcuts', (name) => {
    const s = areasScene();
    withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    const event = s.key(name);
    expect(s.areas()).toEqual([]);
    expect(s.selected()).toBeNull();
    expect(s.steps()).toBe(before + 1);
    expect(event.defaultPrevented).toBe(true);
    expect(s.shortcuts).not.toHaveBeenCalled();
    s.undo();
    expect(s.areas()).toHaveLength(1);
  });

  it('leaves the keys alone that are typed into a field, or are not the map\'s', () => {
    let maps = true;
    const s = areasScene('rectangle', () => maps);
    withHall(s);
    s.click([140, 140]);
    const field = document.body.createEl('input');
    expect(s.key('Delete', field).defaultPrevented).toBe(false);
    maps = false;
    expect(s.key('Delete').defaultPrevented).toBe(false);
    expect(s.key('Escape').defaultPrevented).toBe(false);
    expect(s.areas()).toHaveLength(1);
    expect(s.selected()).not.toBeNull();
    expect(s.shortcuts).toHaveBeenCalledTimes(3);
  });

  it('ends when the tool leaves Areas mode, another tool is taken, the players\' view shows, a scene loads, another level is shown or the area goes', () => {
    const s = areasScene();
    const hall = withHall(s);
    const select = (): void => {
      s.click([140, 140]);
      expect(s.selected()).toBe(hall);
    };
    select();
    s.store.getState().setFogTool({ areas: false });
    expect(s.selected()).toBeNull();
    s.store.getState().setFogTool({ areas: true });

    select();
    s.store.getState().setActiveTool('eraser');
    expect(s.selected()).toBeNull();
    s.store.getState().setActiveTool('fog');
    s.store.getState().setFogTool({ areas: true });

    select();
    s.store.getState().setActiveTool('move');
    expect(s.selected()).toBeNull();
    s.store.getState().setActiveTool('fog');

    select();
    s.store.getState().setGMView(false);
    expect(s.selected()).toBeNull();
    // Nothing is selected there.
    s.click([140, 140]);
    expect(s.selected()).toBeNull();
    s.store.getState().setGMView(true);

    select();
    s.store.setState({ isMapLoading: true });
    expect(s.selected()).toBeNull();
    s.store.setState({ isMapLoading: false });

    // Another level, where the hall is not.
    select();
    s.store.setState({
      levels: [
        { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
        { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
      ],
      viewedLevel: 'upper',
    });
    expect(s.selected()).toBeNull();
    s.store.setState({ levels: undefined, viewedLevel: null });

    select();
    s.store.getState().deleteFogAreas([hall]);
    expect(s.selected()).toBeNull();
  });
});

describe('editing the selected area', () => {
  it('drags a corner of a rectangle, which stays a rectangle: the two edges at the corner follow, in one undo step', () => {
    const s = areasScene();
    withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    s.drag([[210, 210], [250, 300], [280, 350]]);
    expect(s.areas()[0]).toMatchObject({ type: 'rectangle', x: 70, y: 70, width: 210, height: 280 });
    expect(s.steps()).toBe(before + 1);
    // Past the corner opposite it turns over.
    s.drag([[70, 70], [350, 420]]);
    expect(s.areas()[0]).toMatchObject({ type: 'rectangle', x: 280, y: 350, width: 70, height: 70 });
    expect(s.steps()).toBe(before + 2);
    s.undo();
    s.undo();
    expect(s.areas()[0]).toMatchObject({ type: 'rectangle', x: 70, y: 70, width: 140, height: 140 });
  });

  it('places a dragged corner on the grid and on other areas, on nothing of its own area, and freely with Ctrl', () => {
    const s = areasScene();
    withLassoHall(s);
    const cellar = s.store.getState().addFogArea({ type: 'rectangle', x: 300, y: 100, width: 100, height: 100 })!;
    s.click([140, 140]);
    s.drag([[210, 210], [270, 290]]);
    expect(corners(s.areas().find((area) => area.id !== cellar))).toEqual(at([70, 70], [210, 70], [280, 280], [70, 210]));
    s.drag([[280, 280], [273, 291]], { ctrlKey: true });
    expect(corners(s.areas().find((area) => area.id !== cellar))).toEqual(at([70, 70], [210, 70], [273, 291], [70, 210]));

    // Without the grid: a corner of the cellar close by takes it, its own outline never does.
    s.store.setState((state) => ({ grid: { ...state.grid, snapToGrid: false } }));
    s.drag([[273, 291], [296, 204]]);
    expect(corners(s.areas().find((area) => area.id !== cellar))).toEqual(at([70, 70], [210, 70], [300, 200], [70, 210]));
    // A few pixels on it still lies on the cellar's corner.
    s.drag([[300, 200], [304, 196]]);
    // A few pixels from where it lay, and from the edges that meet at it: its own outline holds it nowhere.
    s.drag([[210, 70], [214, 73]]);
    expect(corners(s.areas().find((area) => area.id !== cellar))).toEqual(at([70, 70], [214, 73], [300, 200], [70, 210]));
  });

  it('puts a dragged corner back on Escape and leaves no undo step', () => {
    const s = areasScene();
    const hall = withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    const was = s.store.getState().objects.fog[hall];
    const writes = s.writes();
    s.press([210, 210]);
    s.move([280, 350]);
    expect(s.previewed()).toEqual([70, 280, 70, 350]);
    const event = s.key('Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(s.previewed()).toBeNull();
    expect(s.held()).toBeNull();
    // The area stays selected, and the release that follows changes nothing.
    expect(s.selected()).toBe(hall);
    s.move([350, 350]);
    s.release();
    expect(s.previewed()).toBeNull();
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    expect(s.steps()).toBe(before);
    // Nothing of it was ever the scene's: no write to take back.
    expect(s.writes()).toBe(writes);
  });

  it('refuses a corner dragged to where the outline would cross itself: it springs back, and no undo step is left', () => {
    const s = areasScene();
    const hall = withLassoHall(s);
    s.click([140, 140]);
    const before = s.steps();
    const was = s.store.getState().objects.fog[hall];
    const writes = s.writes();
    s.press([70, 70], { ctrlKey: true });
    s.move([150, 100], { ctrlKey: true });
    expect(s.previewed()).toEqual([70, 210, 70, 210]);
    expect(s.held()).toBe(hall);
    // Past the edge on the right: the outline shown is the area's own again.
    s.move([300, 140], { ctrlKey: true });
    expect(s.previewed()).toBeNull();
    expect(s.held()).toBeNull();
    s.release();
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    expect(s.steps()).toBe(before);
    expect(s.writes()).toBe(writes);
    // Back where the outline is one, the corner follows again.
    s.press([70, 70], { ctrlKey: true });
    s.move([300, 140], { ctrlKey: true });
    s.move([100, 90], { ctrlKey: true });
    s.release();
    expect(corners(s.areas()[0])).toEqual(at([100, 90], [210, 70], [210, 210], [70, 210]));
    expect(s.steps()).toBe(before + 1);
  });

  it('adds a corner where an edge is pressed and drags it, in one undo step: the rectangle becomes an outline of corners', () => {
    const s = areasScene();
    withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    s.drag([[140, 72], [140, 20], [140, 0]]);
    expect(s.areas()[0]!.type).toBe('lasso');
    expect(areaOutline(s.areas()[0]!)).toEqual([{ x: 70, y: 70 }, { x: 140, y: 0 }, { x: 210, y: 70 }, { x: 210, y: 210 }, { x: 70, y: 210 }]);
    expect(s.steps()).toBe(before + 1);
    s.undo();
    expect(s.areas()[0]).toMatchObject({ type: 'rectangle', x: 70, y: 70, width: 140, height: 140 });
  });

  it('adds a corner on a click on an edge, which a cancelled drag takes back', () => {
    const s = areasScene();
    const hall = withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    const was = s.store.getState().objects.fog[hall];
    s.press([140, 70]);
    // The corner is the scene's only once the pointer is released.
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    s.move([140, 0]);
    expect(s.previewed()).toEqual([70, 210, 0, 210]);
    s.key('Escape');
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    expect(s.steps()).toBe(before);
    s.release();
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    s.click([140, 70]);
    expect(areaOutline(s.areas()[0]!)).toHaveLength(5);
    expect(s.steps()).toBe(before + 1);
  });

  it('removes a corner on a double click, in one undo step, and never the third', () => {
    const s = areasScene();
    withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    s.click([210, 210]);
    expect(s.steps()).toBe(before);
    s.click([210, 210]);
    expect(areaOutline(s.areas()[0]!)).toEqual([{ x: 70, y: 70 }, { x: 210, y: 70 }, { x: 70, y: 210 }]);
    expect(s.steps()).toBe(before + 1);
    s.click([70, 70]);
    s.click([70, 70]);
    expect(areaOutline(s.areas()[0]!)).toHaveLength(3);
    expect(s.steps()).toBe(before + 1);
  });

  it('moves the area by a drag inside it, in one undo step, a rectangle staying one', () => {
    const s = areasScene();
    const hall = withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    s.drag([[150, 150], [200, 165], [250, 180]]);
    expect(s.areas()[0]).toMatchObject({ type: 'rectangle', x: 170, y: 100, width: 140, height: 140 });
    expect(s.steps()).toBe(before + 1);
    expect(s.selected()).toBe(hall);
    s.undo();
    expect(s.areas()[0]).toMatchObject({ x: 70, y: 70 });
  });

  it('moves an outline of corners alike, and puts it back on Escape', () => {
    const s = areasScene();
    const hall = withLassoHall(s);
    s.click([140, 140]);
    const before = s.steps();
    const was = s.store.getState().objects.fog[hall];
    const writes = s.writes();
    s.press([150, 150]);
    s.move([250, 180]);
    expect(s.previewed()).toEqual([170, 310, 100, 240]);
    s.key('Escape');
    expect(s.previewed()).toBeNull();
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    expect(s.steps()).toBe(before);
    expect(s.writes()).toBe(writes);
    // Dragged again and let go, it lies where it was shown.
    s.drag([[150, 150], [250, 180]]);
    expect(corners(s.areas()[0])).toEqual(box(170, 100, 140, 140));
    expect(s.steps()).toBe(before + 1);
  });

  it('takes a shape away with Alt from the selected area too, where a drag would move it', () => {
    const s = areasScene();
    withHall(s);
    s.click([140, 140]);
    s.drag([[140, 140], [280, 280]], { altKey: true });
    expect(corners(s.areas()[0])).toEqual(at([70, 70], [210, 70], [210, 140], [140, 140], [140, 210], [70, 210]));
  });

  it('puts a drag back when the pointer is cancelled or the window loses focus', () => {
    const s = areasScene();
    const hall = withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    const was = s.store.getState().objects.fog[hall];
    s.press([210, 210]);
    s.move([280, 350]);
    document.body.querySelector('canvas')!.dispatchEvent(new Event('pointercancel'));
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    s.press([150, 150]);
    s.move([250, 180]);
    window.dispatchEvent(new Event('blur'));
    expect(s.store.getState().objects.fog[hall]).toBe(was);
    expect(s.steps()).toBe(before);
    expect(s.previewed()).toBeNull();
    // The release that comes late writes nothing either.
    s.release();
    expect(s.store.getState().objects.fog[hall]).toBe(was);
  });

  it('writes a drag of a corner, of an added corner or of the whole area once, at the release, as one undo step: until then the scene holds the area as it was', () => {
    for (const [what, places, left] of [
      ['a corner', [[210, 210], [250, 300], [280, 350], [350, 350]], box(70, 70, 280, 280)],
      ['an added corner', [[140, 70], [140, 30], [150, 10], [140, 0]], at([70, 70], [140, 0], [210, 70], [210, 210], [70, 210])],
      ['the area', [[150, 150], [200, 165], [230, 170], [250, 180]], box(170, 100, 140, 140)],
    ] as const) {
      const s = areasScene();
      const hall = withHall(s);
      s.click([140, 140]);
      const before = s.steps();
      const writes = s.writes();
      const was = s.store.getState().objects.fog[hall];
      const [first, ...rest] = places;
      s.press(first);
      for (const place of rest) {
        s.move(place);
        expect([what, s.store.getState().objects.fog[hall]]).toEqual([what, was]);
        expect([what, s.store.getState().objects.fog[hall] === was]).toEqual([what, true]);
      }
      // The GM sees the outline as it will be, and the one the area has is not drawn beside it.
      expect([what, s.previewed()]).not.toEqual([what, null]);
      expect([what, s.held()]).toEqual([what, hall]);
      expect([what, s.writes(), s.steps()]).toEqual([what, writes, before]);
      s.release();
      expect([what, corners(s.areas()[0])]).toEqual([what, left]);
      expect([what, s.writes(), s.steps()]).toEqual([what, writes + 1, before + 1]);
      expect([what, s.previewed(), s.held()]).toEqual([what, null, null]);
      s.undo();
      expect([what, corners(s.areas()[0])]).toEqual([what, box(70, 70, 140, 140)]);
    }
  });

  it('drops a drag when another level is shown: no level\'s fog is touched, and no undo step is left open', () => {
    const s = areasScene();
    s.store.setState({
      levels: [
        { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
        { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
      ],
      viewedLevel: 'ground',
    });
    const hall = withHall(s);
    s.click([140, 140]);
    const before = s.steps();
    const writes = s.writes();
    const fog = s.store.getState().objects.fog;
    s.press([210, 210]);
    s.move([280, 350]);
    s.store.getState().setViewedLevel('upper');
    expect(s.selected()).toBeNull();
    expect(s.previewed()).toBeNull();
    expect(s.held()).toBeNull();
    // The pointer is still down: what it does until its release is no drag's.
    s.move([300, 400]);
    s.release();
    expect(s.store.getState().objects.fog).toBe(fog);
    expect(s.store.getState().objects.fog[hall]).toMatchObject({ x: 70, y: 70, width: 140, height: 140 });
    expect([s.writes(), s.steps()]).toEqual([writes, before]);
    // No transaction is left open: the next edit is a step of its own, and undo takes back that edit alone.
    const cellar = s.store.getState().addFogArea({ type: 'rectangle', x: 300, y: 300, width: 70, height: 70 })!;
    expect(s.steps()).toBe(before + 1);
    s.undo();
    expect(s.store.getState().objects.fog[cellar]).toBeUndefined();
    expect(s.store.getState().objects.fog).toEqual(fog);
  });

  it('drops a drag when the area it holds changes under it: an undo takes the area back, and the release writes nothing over it', () => {
    const s = areasScene();
    const hall = withHall(s);
    s.click([140, 140]);
    s.drag([[210, 210], [280, 280]]);
    expect(s.areas()[0]).toMatchObject({ width: 210, height: 210 });
    s.press([280, 280]);
    s.move([350, 350]);
    expect(s.previewed()).toEqual([70, 350, 70, 350]);
    s.undo();
    expect(s.previewed()).toBeNull();
    const undone = s.store.getState().objects.fog[hall];
    expect(undone).toMatchObject({ width: 140, height: 140 });
    s.release();
    expect(s.store.getState().objects.fog[hall]).toBe(undone);
  });

  it('says what a press on the selected area would do: grab on a corner, move inside it, and nothing of its own on an edge or beside it', () => {
    const s = areasScene();
    const hall = withHall(s);
    const cursor = (x: number, y: number): string | null => s.gesture.cursorAt({ x, y });
    // Nothing is selected: a press in the hall selects it.
    expect(cursor(140, 140)).toBeNull();
    s.click([140, 140]);
    expect(s.selected()).toBe(hall);
    const state = s.store.getState();
    expect(cursor(140, 140)).toBe('move');
    expect(cursor(210, 210)).toBe('grab');
    expect(cursor(74, 68)).toBe('grab');
    // A press on an edge adds a corner, one beside the hall begins a shape.
    expect(cursor(140, 70)).toBeNull();
    expect(cursor(300, 300)).toBeNull();
    // Asking writes nothing.
    expect(s.store.getState()).toBe(state);

    // While it is held: the corner, then the area.
    s.press([210, 210]);
    s.move([250, 260]);
    expect(cursor(250, 260)).toBe('grabbing');
    s.release();
    s.press([140, 140]);
    s.move([160, 160]);
    expect(cursor(400, 400)).toBe('move');
    s.release();

    // A shape under way has the pointer.
    s.press([400, 400]);
    s.move([450, 450]);
    expect(cursor(140, 140)).toBeNull();
    s.release();
    s.key('Escape');
    expect(s.selected()).toBeNull();
    expect(cursor(140, 140)).toBeNull();
  });

  it('keeps its handles and a stroke\'s outlines out of every picture of the scene', () => {
    const s = areasScene();
    withHall(s);
    s.click([140, 140]);
    const layers = s.gesture.areaLayers();
    expect(layers).toHaveLength(2);
    expect(layers.every((entry) => entry.visible === false)).toBe(true);
    // The handles show on the GM's canvas.
    expect(layers.some((entry) => entry.layer.visible)).toBe(true);
    for (const entry of layers) expect(s.gesture.playerLayers()).toContainEqual(entry);
  });
});
