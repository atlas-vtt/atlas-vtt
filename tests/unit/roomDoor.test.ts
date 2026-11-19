// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { RoomEditor } from '../../src/app/pixi/lighting/RoomEditor';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { WallInput, WallSegment } from '../../src/app/types/wallTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

type P = { x: number; y: number };

const CELL = 70;

let cleanup: (() => void) | null = null;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

/** The rooms mode on a square grid, dragging doors as the pointer would. */
function setup(walls: readonly WallInput[], offset: P = { x: 0, y: 0 }): { store: ViewAtlasStore; door: (from: P, to: P, shiftKey?: boolean) => void } {
  const restoreGraphics = stubJsdomGraphics();
  const canvas = document.createElement('canvas');
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events: { domElement: canvas } as unknown as EventSystem });
  const store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `room-door-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setActiveTool('wall');
  store.getState().setGrid({ ...store.getState().grid, type: 'square', size: CELL, offsetX: offset.x, offsetY: offset.y });
  for (const wall of walls) store.getState().addWall(wall);
  const bus = new EventEmitter();
  const editor = new RoomEditor({ viewport, store, eventBus: bus, bounds: () => ({ width: 2000, height: 2000 }), onActiveChange: () => undefined, canvas });
  bus.emit('wall-submode-changed', 'rooms');
  editor.view.visible = true;
  store.getState().setRoomTool({ action: 'door' });
  store.temporal.getState().clear();
  cleanup = () => {
    editor.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const door = (from: P, to: P, shiftKey = true): void => {
    editor.pointerDown(from, { altKey: false, shiftKey });
    editor.pointerMove(to, { altKey: false, shiftKey });
    editor.pointerUp();
  };
  return { store, door };
}

const walls = (store: ViewAtlasStore): WallSegment[] => Object.values(store.getState().objects.walls);
const doors = (store: ViewAtlasStore): WallSegment[] => walls(store).filter((wall) => wall.type === 'door');
const span = ({ p1, p2 }: Pick<WallSegment, 'p1' | 'p2'>): string => [p1, p2].map((p) => `${+p.x.toFixed(3)},${+p.y.toFixed(3)}`).sort().join(' - ');
const at = (o: P, cx: number, cy: number): P => ({ x: o.x + cx * CELL, y: o.y + cy * CELL });

/** An L-shaped room: `length` cells down the left wall, five along the top, on grid lines. */
function lShape(o: P, length: number): WallInput[] {
  return [
    { type: 'solid', p1: at(o, 0, 0), p2: at(o, 5, 0) },
    { type: 'solid', p1: at(o, 0, 0), p2: at(o, 0, length) },
    { type: 'solid', p1: at(o, 0, length), p2: at(o, 2, length) },
  ];
}

describe('a door drawn in the rooms mode', () => {
  for (const offset of [{ x: 0, y: 0 }, { x: 23.4, y: 11.7 }, { x: 0.1, y: 0.3 }]) {
    for (const length of [3, 4]) {
      it(`stays where it was drawn one cell from a corner (${length}-cell wall, offset ${offset.x},${offset.y})`, () => {
        const { store, door } = setup(lShape(offset, length), offset);
        // Drawn along the left wall, one cell below the corner, and along the top wall, one cell right of it.
        door(at(offset, 0, 1), at(offset, 0, 2));
        door(at(offset, 2, 0), at(offset, 1, 0));
        expect(doors(store).map(span).sort()).toEqual([span({ p1: at(offset, 0, 1), p2: at(offset, 0, 2) }), span({ p1: at(offset, 1, 0), p2: at(offset, 2, 0) })].sort());
      });
    }
  }

  it('cuts the wall it is drawn on, so opening it opens the wall', () => {
    const o = { x: 0, y: 0 };
    const { store, door } = setup(lShape(o, 3));
    door(at(o, 0, 1), at(o, 0, 2));
    const solids = walls(store).filter((wall) => wall.type === 'solid').map(span).sort();
    expect(solids).toEqual([
      span({ p1: at(o, 0, 0), p2: at(o, 5, 0) }),
      span({ p1: at(o, 0, 0), p2: at(o, 0, 1) }),
      span({ p1: at(o, 0, 2), p2: at(o, 0, 3) }),
      span({ p1: at(o, 0, 3), p2: at(o, 2, 3) }),
    ].sort());
    // One undo step puts the wall back whole.
    store.temporal.getState().undo();
    expect(walls(store).map(span).sort()).toEqual(lShape(o, 3).map(span).sort());
  });

  it('still reaches a wall it was drawn a few pixels short of', () => {
    const o = { x: 0, y: 0 };
    // An opening between two walls across x = 0..140.
    const { store, door } = setup([
      { type: 'solid', p1: { x: -200, y: 300 }, p2: { x: 0, y: 300 } },
      { type: 'solid', p1: { x: 140, y: 300 }, p2: { x: 340, y: 300 } },
      { type: 'solid', p1: { x: 0, y: 200 }, p2: { x: 0, y: 400 } },
      { type: 'solid', p1: { x: 140, y: 200 }, p2: { x: 140, y: 400 } },
    ], o);
    door({ x: 4, y: 250 }, { x: 134, y: 250 }, false);
    const [placed] = doors(store);
    expect(Math.min(placed!.p1.x, placed!.p2.x)).toBeLessThanOrEqual(0);
    expect(Math.max(placed!.p1.x, placed!.p2.x)).toBeGreaterThanOrEqual(140);
  });
});
