// @vitest-environment jsdom
import { Container, Point, type FederatedPointerEvent, type Graphics, type PointData } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { FogGesture } from '../../src/app/pixi/fog/FogGesture';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation } from '../../src/app/types/fogTypes';
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

interface PolygonScene {
  store: ViewAtlasStore;
  gesture: FogGesture;
  /** What the gesture last asked the picture to show on the fog; undefined for the fog as it is. */
  shown: () => FogOperation | undefined;
  showCommitted: ReturnType<typeof vi.fn>;
  /** Every stroke the gesture asked the picture to show on the fog, which the players see. */
  shownOnFog: () => unknown[];
  /** The ground washed over for the GM alone, as what will be revealed: left, right, top and bottom; null where none is. */
  washed: () => number[] | null;
  /** A click of the primary button at a place on the map. */
  click(x: number, y: number, keys?: Keys): void;
  move(x: number, y: number, keys?: Keys): void;
  /** A key pressed in the map's window; the event as it came back. */
  key(name: string, init?: KeyboardEventInit, target?: EventTarget): KeyboardEvent;
  /** The keys the map's own shortcuts heard. */
  shortcuts: ReturnType<typeof vi.fn>;
  fog: () => FogOperation[];
  undo: () => void;
  steps: () => number;
}

const stops: Array<() => void> = [];
afterEach(() => {
  while (stops.length) stops.pop()!();
  document.body.empty();
});

/** The fog tool's gesture on a 70 px grid, with the Polygon shape chosen. */
function polygonScene(keysBelongToMap?: (event: KeyboardEvent) => boolean): PolygonScene {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-polygon-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'fog', isMapLoading: false, isGMView: true });
  store.getState().setFogTool({ shape: 'polygon' });
  const viewport = new Camera();
  const canvas = document.body.createEl('canvas');
  const showStroke = vi.fn();
  const showCommitted = vi.fn();
  const layer = new Container();
  const gesture = new FogGesture({
    layer, viewport: viewport as unknown as Viewport, canvas: () => canvas, store,
    host: { showStroke, showCommitted },
    ...(keysBelongToMap && { keysBelongToMap }),
  });
  const shortcuts = vi.fn();
  window.addEventListener('keydown', shortcuts);
  const stopFollowing = store.subscribe((state, previous) => {
    if (state.fogTool !== previous.fogTool) gesture.follow(state.fogTool);
  });
  stops.push(() => {
    stopFollowing();
    window.removeEventListener('keydown', shortcuts);
    gesture.destroy();
  });
  const pointer = (type: string, x: number, y: number, keys: Keys, button = 0): void => {
    viewport.emit(type, { button, global: { x, y }, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...keys } as unknown as FederatedPointerEvent);
  };
  const history = getHistoryStore(store)!;
  return {
    store, gesture, showCommitted, shortcuts,
    shown: () => showStroke.mock.lastCall?.[0] as FogOperation | undefined,
    shownOnFog: () => showStroke.mock.calls.map(([stroke]) => stroke as unknown).filter((stroke) => stroke !== undefined),
    washed: () => {
      const bounds = (layer.getChildByLabel('fog-reveal-wash') as Graphics).getLocalBounds();
      return bounds.width > 0 ? [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].map(Math.round) : null;
    },
    click: (x, y, keys = {}) => {
      pointer('pointerdown', x, y, keys);
      pointer('pointerup', x, y, keys);
    },
    move: (x, y, keys = {}) => pointer('pointermove', x, y, keys),
    key: (name, init = {}, target = document.body) => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    },
    fog: () => Object.values(store.getState().objects.fog),
    undo: () => history.getState().undo(),
    steps: () => history.getState().pastStates.length,
  };
}

describe('the fog tool\'s polygon', () => {
  it('places a corner at every click, shows the fog it will leave, and closes on Enter into one lasso, one undo step', () => {
    const s = polygonScene();
    s.click(2, 3);
    expect(s.gesture.active).toBe(true);
    s.click(138, 4);
    // Two corners are no area: the fog as it is.
    expect(s.shown()).toBeUndefined();
    // The pointer is the next corner.
    s.move(72, 139);
    expect(s.shown()).toMatchObject({ type: 'lasso', isErasing: false, points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 70, y: 140 }] });
    s.click(72, 139);
    expect(s.fog()).toEqual([]);

    const enter = s.key('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(s.shortcuts).not.toHaveBeenCalled();
    expect(s.gesture.active).toBe(false);
    expect(s.fog()).toMatchObject([{ kind: 'fog', type: 'lasso', isErasing: false, points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 70, y: 140 }] }]);
    expect(s.steps()).toBe(1);
    s.undo();
    expect(s.fog()).toEqual([]);
    // No polygon: Enter is the map's again.
    s.key('Enter');
    expect(s.shortcuts).toHaveBeenCalledTimes(1);
  });

  it('closes on a click on its first corner and on a double click, and reveals with the revealing tool', () => {
    const s = polygonScene();
    s.store.getState().setActiveTool('eraser');
    s.click(0, 0);
    s.click(140, 0);
    s.click(140, 140);
    // Near the first corner the pointer shows the polygon closed: what it will reveal, to the GM
    // alone. Nothing of it is on the fog's picture, which the players see.
    s.move(6, 5);
    expect(s.washed()).toEqual([0, 140, 0, 140]);
    expect(s.shownOnFog()).toEqual([]);
    s.click(6, 5);
    expect(s.gesture.active).toBe(false);
    expect(s.washed()).toBeNull();
    expect(s.shownOnFog()).toEqual([]);
    expect(s.fog()).toMatchObject([{ type: 'lasso', isErasing: true, points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }] }]);

    s.click(210, 0);
    s.click(280, 0);
    // The second press of a double click places no corner of its own.
    s.click(280, 70);
    s.click(280, 70);
    expect(s.gesture.active).toBe(false);
    expect(s.fog()).toHaveLength(2);
    expect(s.fog()[1]).toMatchObject({ points: [{ x: 210, y: 0 }, { x: 280, y: 0 }, { x: 280, y: 70 }] });
  });

  it('drops a polygon that would reveal without a trace: the fog\'s picture never held anything of it', () => {
    const s = polygonScene();
    s.store.getState().setActiveTool('eraser');
    s.click(0, 0);
    s.click(140, 0);
    s.move(140, 140);
    expect(s.washed()).toEqual([0, 140, 0, 140]);
    s.key('Escape');
    expect(s.gesture.active).toBe(false);
    expect(s.washed()).toBeNull();
    expect(s.shownOnFog()).toEqual([]);
    expect(s.fog()).toEqual([]);
  });

  it('shows what will be revealed on the GM\'s own view only: a canvas in session view gets no wash, and its fog no stroke', () => {
    const s = polygonScene();
    s.store.getState().setActiveTool('eraser');
    s.store.setState({ isGMView: false });
    s.click(0, 0);
    s.click(140, 0);
    s.move(140, 140);
    expect(s.gesture.active).toBe(true);
    expect(s.washed()).toBeNull();
    expect(s.shownOnFog()).toEqual([]);
  });

  it('makes nothing of fewer than three corners or corners on one line, and goes on', () => {
    const s = polygonScene();
    s.click(0, 0);
    s.click(140, 0);
    s.key('Enter');
    expect(s.gesture.active).toBe(true);
    s.click(280, 0);
    s.key('Enter');
    // A double click on the line closes nothing either.
    s.click(280, 0);
    expect(s.fog()).toEqual([]);
    expect(s.gesture.active).toBe(true);
    s.click(280, 140);
    s.key('Enter');
    expect(s.fog()).toMatchObject([{ points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 280, y: 0 }, { x: 280, y: 140 }] }]);
  });

  it('takes its last corner back on Backspace, and is gone with its only one', () => {
    const s = polygonScene();
    s.click(0, 0);
    s.click(140, 0);
    s.click(140, 140);
    s.move(70, 210);
    expect(s.shown()).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }, { x: 70, y: 210 }] });
    const back = s.key('Backspace');
    expect(back.defaultPrevented).toBe(true);
    expect(s.shortcuts).not.toHaveBeenCalled();
    // The pointer is the third corner again.
    expect(s.shown()).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 70, y: 210 }] });
    // A key held down repeats without taking more corners, and stays the polygon's.
    s.key('Backspace', { repeat: true });
    expect(s.gesture.active).toBe(true);
    expect(s.shortcuts).not.toHaveBeenCalled();
    s.key('Backspace');
    expect(s.showCommitted).not.toHaveBeenCalled();
    s.key('Backspace');
    expect(s.gesture.active).toBe(false);
    expect(s.showCommitted).toHaveBeenCalledTimes(1);
    s.key('Backspace');
    expect(s.shortcuts).toHaveBeenCalledTimes(1);
    expect(s.fog()).toEqual([]);
  });

  it('takes its last corner back on the map\'s undo key, which undoes no fog while a polygon is under way', () => {
    const s = polygonScene();
    s.store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 70, height: 70 });
    s.click(0, 0);
    s.click(140, 0);
    s.click(140, 140);
    for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
      const undo = s.key('z', init);
      expect(undo.defaultPrevented).toBe(true);
    }
    expect(s.shortcuts).not.toHaveBeenCalled();
    expect(s.gesture.active).toBe(true);
    // Two corners went: the next two make a triangle with the first.
    s.click(210, 0);
    s.click(210, 210);
    s.key('Enter');
    expect(s.fog()).toHaveLength(2);
    expect(s.fog()[1]).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 210 }] });
    // Redo is no undo: it stays the map's. So does undo once no polygon is under way.
    s.click(0, 0);
    s.key('z', { ctrlKey: true, shiftKey: true });
    expect(s.shortcuts).toHaveBeenCalledTimes(1);
    expect(s.gesture.active).toBe(true);
    s.key('z', { ctrlKey: true });
    expect(s.gesture.active).toBe(false);
    s.key('z', { ctrlKey: true });
    expect(s.shortcuts).toHaveBeenCalledTimes(2);
  });

  it('asks whether a key is the undo the GM has bound, where it is told how', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `fog-polygon-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'fog', isMapLoading: false, isGMView: true });
    store.getState().setFogTool({ shape: 'polygon' });
    const viewport = new Camera();
    const canvas = document.body.createEl('canvas');
    const gesture = new FogGesture({
      layer: new Container(), viewport: viewport as unknown as Viewport, canvas: () => canvas, store,
      host: { showStroke: vi.fn(), showCommitted: vi.fn() },
      isUndoKey: (event) => event.key === 'u',
    });
    stops.push(() => gesture.destroy());
    const press = (x: number): void => viewport.emit('pointerdown', { button: 0, global: { x, y: 0 } } as unknown as FederatedPointerEvent);
    const key = (name: string, init: KeyboardEventInit = {}): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
      document.body.dispatchEvent(event);
      return event;
    };
    press(0);
    press(140);
    // The default key is not the GM's undo here.
    expect(key('z', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(gesture.active).toBe(true);
    expect(key('u').defaultPrevented).toBe(true);
    expect(key('u').defaultPrevented).toBe(true);
    expect(gesture.active).toBe(false);
  });

  it('drops on Escape, when the bar chooses another shape and when another tool is taken up', () => {
    const s = polygonScene();
    s.click(0, 0);
    s.click(140, 0);
    s.click(140, 140);
    expect(s.key('Escape').defaultPrevented).toBe(true);
    expect(s.shortcuts).not.toHaveBeenCalled();
    expect(s.gesture.active).toBe(false);
    expect(s.showCommitted).toHaveBeenCalledTimes(1);

    s.click(0, 0);
    s.click(140, 0);
    s.store.getState().setFogTool({ shape: 'rectangle' });
    expect(s.gesture.active).toBe(false);
    expect(s.showCommitted).toHaveBeenCalledTimes(2);

    s.store.getState().setFogTool({ shape: 'polygon' });
    s.click(0, 0);
    s.gesture.stop();
    expect(s.gesture.active).toBe(false);
    s.key('Enter');
    expect(s.fog()).toEqual([]);
    expect(s.shortcuts).toHaveBeenCalledTimes(1);
  });

  it('holds an edge to eighths of a turn with Shift, places freely with Ctrl, and turns around with Alt', () => {
    const s = polygonScene();
    s.click(0, 0);
    // Almost level: held level, and on the grid's corner along that line.
    s.click(100, 8, { shiftKey: true });
    s.move(150, 60, { shiftKey: true });
    // From (70, 0) the diagonal nearest the pointer, and the grid's corner on it.
    expect(s.shown()).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 140, y: 70 }] });
    // Shift let go while the pointer rests: the corner is the pointer's again, on the grid.
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    expect(s.shown()).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 140, y: 70 }] });
    s.move(150, 93);
    expect(s.shown()).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 140, y: 70 }] });
    s.move(151, 93, { ctrlKey: true });
    expect(s.shown()).toMatchObject({ isErasing: false, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 151, y: 93 }] });
    // Alt turns it around: what it hid on the fog's picture goes, and what it will reveal shows to the GM alone.
    expect(s.washed()).toBeNull();
    s.key('Alt');
    expect(s.shown()).toBeUndefined();
    expect(s.washed()).toEqual([0, 151, 0, 93]);
    s.click(151, 93, { ctrlKey: true, altKey: true });
    s.key('Enter', { altKey: true });
    expect(s.fog()).toMatchObject([{ isErasing: true, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 151, y: 93 }] }]);
  });

  it('places no corner with the right button, which pans the map', () => {
    const s = polygonScene();
    s.click(0, 0);
    const camera = s.gesture as unknown as { deps: { viewport: Container } };
    camera.deps.viewport.emit('pointerdown', { button: 2, global: { x: 140, y: 0 } } as unknown as FederatedPointerEvent);
    s.click(140, 140);
    s.click(0, 140);
    s.key('Enter');
    expect(s.fog()).toMatchObject([{ points: [{ x: 0, y: 0 }, { x: 140, y: 140 }, { x: 0, y: 140 }] }]);
  });

  it('leaves a key typed into a field alone, and drops for a key that is not the map\'s', () => {
    let maps = true;
    const s = polygonScene(() => maps);
    s.click(0, 0);
    s.click(140, 0);
    s.click(140, 140);
    const field = document.body.createEl('input');
    expect(s.key('Enter', {}, field).defaultPrevented).toBe(false);
    expect(s.gesture.active).toBe(true);
    expect(s.shortcuts).toHaveBeenCalledTimes(1);
    // A dialog over the map: its Enter is its own, and the polygon goes.
    maps = false;
    expect(s.key('Enter').defaultPrevented).toBe(false);
    expect(s.shortcuts).toHaveBeenCalledTimes(2);
    expect(s.gesture.active).toBe(false);
    expect(s.fog()).toEqual([]);
  });

  it('keeps its outline and the snapping guide out of the players\' picture', () => {
    const s = polygonScene();
    s.click(0, 0);
    s.move(138, 4);
    const layers = s.gesture.playerLayers();
    // The ring, the outline, the guide and the wash over what will be revealed.
    expect(layers).toHaveLength(4);
    expect(layers.every((entry) => entry.visible === false)).toBe(true);
    // The guide shows on the GM's canvas where the next corner lands.
    expect(layers.some((entry) => entry.layer.visible && entry.layer.position.x === 140 && entry.layer.position.y === 0)).toBe(true);
  });

  it('drops when the map\'s window loses focus', () => {
    const s = polygonScene();
    s.click(0, 0);
    s.click(140, 0);
    window.dispatchEvent(new Event('blur'));
    expect(s.gesture.active).toBe(false);
    expect(s.showCommitted).toHaveBeenCalledTimes(1);
  });
});

describe('the fog tool\'s cells', () => {
  it('hide the cells of a drag that encloses a hole as several shapes in one undo step', () => {
    const s = polygonScene();
    s.store.getState().setFogTool({ shape: 'cells' });
    const camera = (s.gesture as unknown as { deps: { viewport: Container } }).deps.viewport;
    const pointer = (type: string, x: number, y: number): void => {
      camera.emit(type, { button: 0, global: { x, y } } as unknown as FederatedPointerEvent);
    };
    pointer('pointerdown', 35, 35);
    for (const [x, y] of [[175, 35], [175, 175], [35, 175], [35, 105]] as const) pointer('pointermove', x, y);
    expect(s.fog()).toEqual([]);
    pointer('pointerup', 35, 105);
    expect(s.fog()).toHaveLength(4);
    expect(s.fog().every((operation) => operation.type === 'lasso' && !operation.isErasing && !('area' in operation))).toBe(true);
    // They act in the order given, each a tick after the one before.
    const times = s.fog().map((operation) => operation.timestamp);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(4);
    // Fog that touches is one: the eight cells are one body, and the cell in their middle is not in it.
    const fog = fogCoverage(s.store.getState().objects.fog);
    expect([fog.covers({ x: 35, y: 35 }), fog.covers({ x: 175, y: 105 }), fog.covers({ x: 105, y: 105 })]).toEqual([true, true, false]);
    expect(s.steps()).toBe(1);
    s.undo();
    expect(s.fog()).toEqual([]);
  });
});
