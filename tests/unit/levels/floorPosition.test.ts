// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { floorAlignment, movedFloorAlignment, referenceFloor, snapToCells } from '../../../src/app/levels/floorPosition';
import { levelImagePlacement } from '../../../src/app/levels/levelAlignment';
import { FloorPositioning } from '../../../src/app/react/components/levels/floorPositioning';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import type { GridState } from '../../../src/app/types/gridTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const level = (id: string): SceneLevel => ({ id, name: id, elevation: { bottom: 0, top: 10 }, background: null });
const LEVELS = [level('cellar'), level('ground'), level('upper')];
const SQUARE: GridState = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, type: 'square' };

describe('placing a floor by whole cells', () => {
  it('moves a square grid\'s floor to the nearest whole cell', () => {
    expect(snapToCells({ x: 110, y: -40 }, SQUARE)).toEqual({ x: 140, y: -70 });
    expect(snapToCells({ x: 20, y: 30 }, SQUARE)).toEqual({ x: 0, y: 0 });
  });

  it('moves a hex grid\'s floor only by shifts that lay the hexes on themselves', () => {
    for (const type of ['hex-vertical', 'hex-horizontal'] as const) {
      const grid = { ...SQUARE, type };
      for (const delta of [{ x: 33, y: 61 }, { x: -120, y: 250 }, { x: 400, y: -17 }]) {
        const snapped = snapToCells(delta, grid);
        // Every lattice point lies a whole number of hex rows (or columns) and steps along them from the origin
        const along = type === 'hex-vertical' ? snapped.y / (70 * Math.sqrt(3) / 2) : snapped.x / (70 * Math.sqrt(3) / 2);
        expect(Math.abs(along - Math.round(along))).toBeLessThan(1e-9);
        const across = type === 'hex-vertical' ? snapped.x - Math.round(along) * 35 : snapped.y - Math.round(along) * 35;
        expect(Math.abs(across / 70 - Math.round(across / 70))).toBeLessThan(1e-9);
        // and is the nearest such place: never more than a hex away
        expect(Math.hypot(snapped.x - delta.x, snapped.y - delta.y)).toBeLessThanOrEqual(70);
      }
    }
  });

  it('draws a floor without an alignment of its own exactly as the frame does, at the corner', () => {
    const grid = { ...SQUARE, mapStretch: { x: 1.1, y: 1 } };
    const scene = { levels: LEVELS, grid };
    const alignment = floorAlignment(scene, 'cellar');
    expect(levelImagePlacement({ ...scene, levelAlignments: { cellar: alignment } }, 'cellar')).toEqual(levelImagePlacement(scene, 'cellar'));
  });

  it('stops at the world\'s edge on the grid, and says it stopped', () => {
    const scene = { levels: LEVELS, grid: SQUARE };
    const from = { offset: { x: 140, y: 70 }, scale: 1, stretch: { x: 1, y: 1 } };
    expect(movedFloorAlignment(scene, from, { x: 75, y: -65 }, false)).toEqual({ alignment: { ...from, offset: { x: 210, y: 0 } }, stopped: false });
    expect(movedFloorAlignment(scene, from, { x: -300, y: 0 }, false)).toEqual({ alignment: { ...from, offset: { x: 0, y: 70 } }, stopped: true });
    // Alt places it freely
    expect(movedFloorAlignment(scene, from, { x: 3.5, y: -2 }, true).alignment.offset).toEqual({ x: 143.5, y: 68 });
  });

  it('stops a floor on a hex grid at the world\'s edge where it lies, never on the far side of where it was going', () => {
    const from = { offset: { x: 0, y: 0 }, scale: 1, stretch: { x: 1, y: 1 } };
    const row = 70 * Math.sqrt(3) / 2;
    // Pointy-top hexes: a row up from the top edge stays; up and right goes right along the row.
    const pointy = { levels: LEVELS, grid: { ...SQUARE, type: 'hex-vertical' as const } };
    expect(movedFloorAlignment(pointy, from, { x: 0, y: -row }, false)).toEqual({ alignment: from, stopped: true });
    expect(movedFloorAlignment(pointy, from, { x: 105, y: -row }, false)).toEqual({ alignment: { ...from, offset: { x: 70, y: 0 } }, stopped: true });
    // Flat-top hexes: a column left from the left edge stays.
    const flat = { levels: LEVELS, grid: { ...SQUARE, type: 'hex-horizontal' as const } };
    expect(movedFloorAlignment(flat, from, { x: -row, y: 0 }, false)).toEqual({ alignment: from, stopped: true });
    // A floor a row down moves up to the edge and no further.
    const below = { ...from, offset: { x: 35, y: Math.round(row * 1e4) / 1e4 } };
    expect(movedFloorAlignment(pointy, below, { x: -35, y: -3 * row }, false).alignment.offset).toEqual({ x: 0, y: 0 });
  });

  it('places a floor against the one below it, else the one above', () => {
    expect(referenceFloor(LEVELS, 'ground')).toBe('cellar');
    expect(referenceFloor(LEVELS, 'cellar')).toBe('ground');
    expect(referenceFloor([level('only')], 'only')).toBeNull();
  });
});

const token = (id: string, x: number, lvl?: string): TokenEntity => ({ id, x, y: 35, size: 1, imagePath: 'a.png', ...(lvl && { level: lvl }) } as TokenEntity);
const wall = (id: string, levels: string[] | 'all'): WallSegment => ({ id, p1: { x: 0, y: 0 }, p2: { x: 70, y: 0 }, levels } as WallSegment);

/** A store of three floors showing the cellar, with a token on each floor and a wall on all of them. */
function threeFloors(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `floor-position-${Math.random()}`);
  store.setState({
    persistenceEnabled: false,
    levels: LEVELS,
    viewedLevel: 'cellar',
    grid: SQUARE,
    objects: {
      ...store.getState().objects,
      tokens: { down: token('down', 35, 'cellar'), up: token('up', 35, 'ground') },
      walls: { shared: wall('shared', 'all'), own: wall('own', ['cellar']) },
    },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

const VIEW_ID = 'floor-view';

/** A map view in the active leaf: its canvas inside the element that holds it. */
function mountCanvas(): HTMLCanvasElement {
  document.body.empty();
  const leaf = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  const view = leaf.createDiv({ attr: { 'data-view-id': VIEW_ID } });
  return view.createDiv({ cls: 'host' }).createEl('canvas');
}

function pointer(target: EventTarget, type: string, clientX: number, clientY: number, altKey = false): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, altKey });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}

function key(name: string, shiftKey = false, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, repeat, bubbles: true, cancelable: true }));
}

function keyUp(name: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { key: name, bubbles: true, cancelable: true }));
}

/** A key pressed and let go. */
function tap(name: string, shiftKey = false): void {
  key(name, shiftKey);
  keyUp(name);
}

describe('Position floor on the map', () => {
  let positioning: FloorPositioning | null = null;
  afterEach(() => {
    positioning?.destroy();
    positioning = null;
  });

  /** What the map image was drawn with while a move lasted: offsets, null for the scene's own placement. */
  type Previews = ({ x: number; y: number } | null)[];

  function start(store: ViewAtlasStore, zoom = 1): { canvas: HTMLCanvasElement; done: { count: number }; previews: Previews } {
    const canvas = mountCanvas();
    const done = { count: 0 };
    const previews: Previews = [];
    positioning = new FloorPositioning({
      store, viewId: VIEW_ID, canvas, zoom: () => zoom,
      preview: (placement) => previews.push(placement ? placement.offset ?? { x: 0, y: 0 } : null),
      onStopped: () => {}, onDone: () => { done.count++; },
    });
    return { canvas, done, previews };
  }

  it('drags the floor shown by whole cells with what stands on it alone, in one undo step', () => {
    const store = threeFloors();
    const before = store.getState().objects;
    const { canvas, previews } = start(store, 2);

    pointer(canvas, 'pointerdown', 100, 100);
    pointer(window, 'pointermove', 200, 120);
    pointer(window, 'pointermove', 210, 125);
    pointer(window, 'pointermove', 400, 240);
    // While it lasts the drag only draws the map image, once per cell it reaches: the scene is written at the release
    expect(store.getState().objects).toBe(before);
    expect(store.getState().levelAlignments).toBeUndefined();
    expect(previews).toEqual([{ x: 70, y: 0 }, { x: 140, y: 70 }]);
    pointer(window, 'pointerup', 400, 240);
    expect(previews.at(-1)).toBeNull();

    // 300 × 140 screen pixels at zoom 2 are 150 × 70 world pixels: two cells and one
    const state = store.getState();
    expect(state.levelAlignments?.cellar?.offset).toEqual({ x: 140, y: 70 });
    expect(state.objects.tokens.down).toMatchObject({ x: 175, y: 105 });
    expect(state.objects.tokens.up).toMatchObject({ x: 35, y: 35 });
    expect(state.objects.walls.own?.p1).toEqual({ x: 140, y: 70 });
    expect(state.objects.walls.shared?.p1).toEqual({ x: 0, y: 0 });

    store.temporal.getState().undo();
    expect(store.getState().levelAlignments?.cellar).toBeUndefined();
    expect(store.getState().objects.tokens.down).toMatchObject({ x: 35, y: 35 });
  });

  it('puts the floor back where it lay when the drag is cancelled with Escape, leaving no step', () => {
    const store = threeFloors();
    const before = store.getState().objects;
    const { canvas, done, previews } = start(store);

    pointer(canvas, 'pointerdown', 0, 0);
    pointer(window, 'pointermove', 300, 0);
    key('Escape');
    expect(previews).toEqual([{ x: 280, y: 0 }, null]);

    expect(store.getState().objects).toBe(before);
    expect(store.getState().levelAlignments).toBeUndefined();
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    // That Escape only cancelled the drag; the next one ends Position floor
    expect(done.count).toBe(0);
    key('Escape');
    expect(done.count).toBe(1);
  });

  it('moves the floor a cell with an arrow key, five with Shift, each one undo step', () => {
    const store = threeFloors();
    start(store);

    tap('ArrowRight');
    tap('ArrowDown', true);

    expect(store.getState().levelAlignments?.cellar?.offset).toEqual({ x: 70, y: 350 });
    expect(store.temporal.getState().pastStates).toHaveLength(2);
  });

  it('draws a held arrow key\'s moves and writes them once, when it is let go', () => {
    const store = threeFloors();
    const { previews } = start(store);

    key('ArrowRight');
    key('ArrowRight', false, true);
    key('ArrowRight', false, true);
    expect(store.getState().levelAlignments).toBeUndefined();
    expect(previews).toEqual([{ x: 70, y: 0 }, { x: 140, y: 0 }, { x: 210, y: 0 }]);

    keyUp('ArrowRight');
    expect(store.getState().levelAlignments?.cellar?.offset).toEqual({ x: 210, y: 0 });
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it('leaves the arrow keys and Enter to a control that uses them, such as a slider', () => {
    const store = threeFloors();
    const { canvas, done } = start(store);
    const slider = canvas.parentElement!.createDiv({ attr: { role: 'slider', tabindex: '0' } });

    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(store.getState().levelAlignments).toBeUndefined();
    expect(done.count).toBe(0);
  });

  it('leaves the right button to the map, which pans with it', () => {
    const store = threeFloors();
    const { canvas } = start(store);
    let reached = false;
    canvas.addEventListener('pointerdown', () => { reached = true; });

    const right = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 2 });
    canvas.dispatchEvent(right);
    expect(reached).toBe(true);

    reached = false;
    pointer(canvas, 'pointerdown', 0, 0);
    expect(reached).toBe(false);
    pointer(window, 'pointerup', 0, 0);
  });
});
