// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Graphics, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { levelObjects } from '../../src/app/levels/levelObjects';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { wallSpaces } from '../../src/app/lighting/wallSpaces';
import { RoomEditor } from '../../src/app/pixi/lighting/RoomEditor';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { RoomToolOptions } from '../../src/app/stores/roomsSlice';
import type { WallInput, WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility, pointInPolygon } from '../../src/app/vision/visibility';
import { wallList } from '../../src/app/vision/wallList';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let cleanup: (() => void) | null = null;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

type P = { x: number; y: number };

/** The rooms mode on a map, drawing rectangles as the pointer would. */
function setup(walls: readonly WallInput[] = []): { store: ViewAtlasStore; rect: (from: P, to: P, tool?: Partial<RoomToolOptions>, alt?: boolean) => void } {
  const restoreGraphics = stubJsdomGraphics();
  const canvas = document.createElement('canvas');
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events: { domElement: canvas } as unknown as EventSystem });
  const store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `rooms-as-walls-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setActiveTool('wall');
  for (const wall of walls) store.getState().addWall(wall);
  const bus = new EventEmitter();
  const editor = new RoomEditor({ viewport, store, eventBus: bus, bounds: () => ({ width: 2000, height: 2000 }), onActiveChange: () => undefined, canvas });
  bus.emit('wall-submode-changed', 'rooms');
  editor.view.visible = true;
  store.temporal.getState().clear();
  cleanup = () => {
    editor.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const rect = (from: P, to: P, tool: Partial<RoomToolOptions> = {}, alt = false): void => {
    store.getState().setRoomTool({ action: 'carve', shape: 'rectangle', ...tool });
    editor.pointerDown(from, { altKey: alt });
    editor.pointerMove(to, { altKey: alt });
    editor.pointerUp();
  };
  return { store, rect };
}

const walls = (store: ViewAtlasStore): WallSegment[] => Object.values(store.getState().objects.walls);
const spans = (store: ViewAtlasStore): string[] => walls(store).map(({ p1, p2 }) => [[p1.x, p1.y], [p2.x, p2.y]].map((p) => p.join(',')).sort().join(' - ')).sort();
const rooms = (store: ViewAtlasStore): number => wallSpaces(levelObjects(store.getState()).walls).length;
/** Whether `to` is seen from `from` past the map's walls. */
function sees(store: ViewAtlasStore, from: P, to: P): boolean {
  return pointInPolygon(to, computeVisibility(from, 5000, sealedWalls(wallList(levelObjects(store.getState()).walls), 2), undefined, 'sight'));
}

describe('a room carved with the rooms mode', () => {
  it('is four walls like any others, in one chain and one undo step', () => {
    const { store, rect } = setup();
    rect({ x: 100, y: 100 }, { x: 400, y: 300 });
    expect(spans(store)).toEqual(['100,100 - 100,300', '100,100 - 400,100', '100,300 - 400,300', '400,100 - 400,300']);
    expect(walls(store).every((wall) => wall.kind === 'wall' && wall.type === 'solid')).toBe(true);
    expect(new Set(walls(store).map((wall) => wall.chainId)).size).toBe(1);
    expect(store.getState().objects).not.toHaveProperty('rooms');
    expect(rooms(store)).toBe(1);
    expect(sees(store, { x: 250, y: 200 }, { x: 600, y: 200 })).toBe(false);
    store.temporal.getState().undo();
    expect(walls(store)).toEqual([]);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it('opens into the room it is carved into, and the two are one', () => {
    const { store, rect } = setup();
    rect({ x: 100, y: 100 }, { x: 300, y: 300 });
    rect({ x: 250, y: 150 }, { x: 500, y: 250 });
    expect(rooms(store)).toBe(1);
    expect(sees(store, { x: 150, y: 200 }, { x: 450, y: 200 })).toBe(true);
    expect(sees(store, { x: 150, y: 200 }, { x: 600, y: 200 })).toBe(false);
    // The first room's wall stands above and below the opening, and nothing is left inside the second.
    expect(spans(store)).toContain('300,100 - 300,150');
    expect(spans(store)).toContain('300,250 - 300,300');
    expect(spans(store)).not.toContain('250,150 - 250,250');
  });

  it('stands beside a room it only touches, the wall between them the one wall there is', () => {
    const { store, rect } = setup();
    rect({ x: 100, y: 100 }, { x: 300, y: 300 });
    rect({ x: 300, y: 100 }, { x: 500, y: 300 });
    expect(rooms(store)).toBe(2);
    expect(spans(store).filter((span) => span === '300,100 - 300,300')).toHaveLength(1);
    expect(sees(store, { x: 200, y: 200 }, { x: 400, y: 200 })).toBe(false);
    // Joining is deleting the wall between, as with any wall.
    const between = walls(store).find(({ p1, p2 }) => p1.x === 300 && p2.x === 300)!;
    store.getState().deleteWalls([between.id]);
    expect(rooms(store)).toBe(1);
    expect(sees(store, { x: 200, y: 200 }, { x: 400, y: 200 })).toBe(true);
  });

  it('extends a room drawn with walls, and takes the walls it covers', () => {
    const side = (x1: number, y1: number, x2: number, y2: number): WallInput => ({ type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, closed: true });
    const { store, rect } = setup([side(100, 100, 300, 100), side(300, 100, 300, 300), side(300, 300, 100, 300), side(100, 300, 100, 100), side(180, 150, 180, 250)]);
    rect({ x: 150, y: 120 }, { x: 450, y: 280 });
    expect(rooms(store)).toBe(1);
    // The wall that stood free inside the carved shape is gone.
    expect(spans(store)).not.toContain('180,150 - 180,250');
    expect(sees(store, { x: 120, y: 200 }, { x: 430, y: 200 })).toBe(true);
    expect(sees(store, { x: 120, y: 200 }, { x: 600, y: 200 })).toBe(false);
  });

  it('keeps the part of a door or a wall of a kind that the shape leaves standing', () => {
    const { store, rect } = setup([{ type: 'door', p1: { x: 0, y: 200 }, p2: { x: 200, y: 200 }, closed: true }, { type: 'solid', p1: { x: 0, y: 260 }, p2: { x: 200, y: 260 }, blocks: 'sight' }]);
    rect({ x: 100, y: 100 }, { x: 400, y: 300 });
    const door = walls(store).find((wall) => wall.type === 'door')!;
    expect([door.p1, door.p2]).toEqual([{ x: 0, y: 200 }, { x: 100, y: 200 }]);
    const curtain = walls(store).find((wall) => wall.blocks === 'sight')!;
    expect([curtain.p1, curtain.p2]).toEqual([{ x: 0, y: 260 }, { x: 100, y: 260 }]);
  });
});

describe('the rock around the rooms', () => {
  it('is darkened in the rooms mode, all of the map but the floor walls close in, and follows what is carved', () => {
    const { store, rect } = setup();
    const filled: string[] = [];
    const proto = Graphics.prototype;
    const [rectOf, polyOf, fillOf] = [proto.rect, proto.poly, proto.fill];
    let shape = '';
    proto.rect = function (this: Graphics, x: number, y: number, w: number, h: number): Graphics { shape = `rect ${x},${y} ${w}x${h}`; return this; };
    proto.poly = function (this: Graphics, points: number[]): Graphics { shape = `poly ${points.length / 2}`; return this; } as never;
    proto.fill = function (this: Graphics): Graphics { filled.push(shape); return this; } as never;
    try {
      rect({ x: 100, y: 100 }, { x: 400, y: 300 });
      // The whole map as rock, then the room's four corners cut out of it.
      expect(filled).toContain('rect 0,0 2000x2000');
      expect(filled[filled.length - 1]).toBe('poly 4');
      filled.length = 0;
      store.temporal.getState().undo();
      vi.advanceTimersByTime(200);
      expect(filled).toEqual(['rect 0,0 2000x2000']);
    } finally {
      Object.assign(proto, { rect: rectOf, poly: polyOf, fill: fillOf });
    }
  });
});

describe('rock filled back in', () => {
  it('walls a room off where the shape cuts into it, and takes a room it covers away whole', () => {
    const { store, rect } = setup();
    rect({ x: 100, y: 100 }, { x: 400, y: 300 });
    rect({ x: 300, y: 50 }, { x: 500, y: 350 }, { action: 'fill' });
    expect(rooms(store)).toBe(1);
    expect(spans(store)).toEqual(['100,100 - 100,300', '100,100 - 300,100', '100,300 - 300,300', '300,100 - 300,300']);
    rect({ x: 50, y: 50 }, { x: 450, y: 350 }, { action: 'fill' });
    expect(walls(store)).toEqual([]);
  });

  it('is what Alt does while carving, and stands as a block inside a room', () => {
    const { store, rect } = setup();
    rect({ x: 100, y: 100 }, { x: 500, y: 500 });
    rect({ x: 250, y: 250 }, { x: 350, y: 350 }, {}, true);
    expect(walls(store)).toHaveLength(8);
    expect(sees(store, { x: 150, y: 300 }, { x: 450, y: 300 })).toBe(false);
    expect(sees(store, { x: 150, y: 300 }, { x: 150, y: 450 })).toBe(true);
  });

  it('writes nothing where there is nothing to fill', () => {
    const { store, rect } = setup();
    rect({ x: 100, y: 100 }, { x: 200, y: 200 }, { action: 'fill' });
    expect(walls(store)).toEqual([]);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });
});
