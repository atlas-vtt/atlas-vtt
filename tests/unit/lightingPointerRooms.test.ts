// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { WallEditor } from '../../src/app/pixi/lighting/WallEditor';
import { wireLightingPointer } from '../../src/app/pixi/lighting/lightingPointer';
import type { LightingModes } from '../../src/app/pixi/lighting/LightingModes';
import type { LightInteraction } from '../../src/app/pixi/lighting/LightInteraction';
import type { DoorIcons } from '../../src/app/pixi/lighting/DoorIcons';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

type Keys = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
type Handler = (...args: never[]) => unknown;

const keys = (changes: Partial<Keys> = {}): Keys => ({ shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...changes });

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** The pointer as the token renderer hands it on, with the lighting tool in a mode that takes its own presses (rooms, or zones). */
function setup(mode: 'rooms' | 'zones') {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const store: ViewAtlasStore = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `rooms-pointer-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setActiveTool('wall');
  const wall = store.getState().addWall({ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 }, closed: true });
  const editor = new WallEditor(viewport, store, new EventEmitter(), () => undefined, () => []);
  editor.layer.visible = true;
  const rooms = { active: mode === 'rooms', busy: false };
  const modes = {
    active: true,
    rooms,
    pointerDown: vi.fn(() => true),
    pointerMove: vi.fn(),
    pointerUp: vi.fn(),
    pointerLeft: vi.fn(),
    doubleClick: vi.fn(),
    cursorAt: vi.fn(() => 'crosshair'),
  };
  const handlers: Record<string, Handler> = {};
  const tokens = new Proxy({}, { get: (_target, name: string) => (handler: Handler) => { handlers[name] = handler; } }) as unknown as TokenRenderer;
  const wallMenu = vi.fn();
  wireLightingPointer(tokens, {
    lights: {} as LightInteraction,
    editor,
    modes: modes as unknown as LightingModes,
    doors: { hitTest: () => null, gmHitTest: () => null, toggle: () => undefined } as unknown as DoorIcons,
    wallMenu,
    doorMenu: () => undefined,
  });
  cleanup = () => {
    editor.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const call = <R>(name: string, ...args: unknown[]): R => (handlers[name] as unknown as (...a: unknown[]) => R)(...args);
  return {
    store, wall, editor, modes, rooms, wallMenu,
    down: (x: number, y: number, k: Partial<Keys> = {}): boolean => call('setWallPointerDownHandler', x, y, keys(k)),
    move: (x: number, y: number, k: Partial<Keys> = {}): void => call('setWallPointerMoveHandler', x, y, keys(k)),
    up: (): void => call('setWallPointerUpHandler'),
    menu: (x: number, y: number): void => call('setWallContextMenuHandler', x, y, 0, 0),
    cursor: (x: number, y: number): string | null => call('setWallCursorProvider', x, y),
  };
}

describe('the walls in the lighting tool\'s rooms mode', () => {
  it('drags a wall\'s end as the walls mode does, and leaves the press to the rooms beside the walls', () => {
    const { store, wall, modes, down, move, up, cursor } = setup('rooms');
    expect(cursor(100, 100)).toBe('grab');
    expect(cursor(200, 101)).toBe('pointer');
    expect(cursor(200, 300)).toBe('crosshair');
    expect(down(100, 100)).toBe(true);
    move(140, 160);
    up();
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 140, y: 160 });
    expect(modes.pointerDown).not.toHaveBeenCalled();
    expect(modes.pointerMove).not.toHaveBeenCalled();
    down(200, 300);
    move(260, 360);
    expect(modes.pointerDown).toHaveBeenCalledTimes(1);
    expect(modes.pointerMove).toHaveBeenCalledTimes(1);
  });

  it('selects a wall with a press and lets it go with a press beside it', () => {
    const { wall, editor, down, up } = setup('rooms');
    down(200, 101);
    up();
    expect(editor.walls.getSelectedWallIds()).toEqual([wall]);
    down(200, 300);
    up();
    expect(editor.walls.getSelectedWallIds()).toEqual([]);
  });

  it('opens the wall menu on a wall, unless a room\'s shape is under way', () => {
    const { rooms, wallMenu, menu } = setup('rooms');
    menu(200, 101);
    expect(wallMenu).toHaveBeenCalledTimes(1);
    rooms.busy = true;
    menu(200, 101);
    expect(wallMenu).toHaveBeenCalledTimes(1);
  });

  it('gives a room\'s shape under way every press, and Shift\'s press to the rooms too', () => {
    const { store, wall, modes, rooms, down, cursor } = setup('rooms');
    down(100, 100, { shiftKey: true });
    expect(modes.pointerDown).toHaveBeenCalledTimes(1);
    rooms.busy = true;
    expect(cursor(100, 100)).toBe('crosshair');
    down(100, 100);
    expect(modes.pointerDown).toHaveBeenCalledTimes(2);
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
  });

  it('leaves the walls out of reach in the other modes that take every press', () => {
    const { modes, wallMenu, down, menu } = setup('zones');
    down(100, 100);
    menu(200, 101);
    expect(modes.pointerDown).toHaveBeenCalledTimes(1);
    expect(wallMenu).not.toHaveBeenCalled();
  });
});
