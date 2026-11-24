// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { RoomEditor } from '../../src/app/pixi/lighting/RoomEditor';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { pulled } from '../../src/app/tools/stabilizer';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

describe('Stabilization', () => {
  it('leaves the brush where it is within the rope, and drags it the rope\'s length behind beyond', () => {
    expect(pulled({ x: 0, y: 0 }, { x: 30, y: 40 }, 50)).toEqual({ x: 0, y: 0 });
    expect(pulled({ x: 0, y: 0 }, { x: 60, y: 80 }, 50)).toEqual({ x: 30, y: 40 });
  });

  it('trails the rooms brush twice its size behind the pointer while drawing, and is remembered on the device', () => {
    const restore = stubJsdomGraphics();
    const canvas = document.createElement('canvas');
    const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events: { domElement: canvas } as unknown as EventSystem });
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `steady-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setActiveTool('wall');
    store.getState().setRoomTool({ shape: 'brush', brushSize: 25, stabilize: true });
    const bus = new EventEmitter();
    const editor = new RoomEditor({ viewport, store, eventBus: bus, bounds: () => ({ width: 2000, height: 2000 }), onActiveChange: () => undefined, canvas, mapImage: () => null });
    cleanup = () => { editor.destroy(); viewport.destroy(); restore(); };
    bus.emit('wall-submode-changed', 'rooms');
    editor.view.visible = true;
    const ring = editor.view.children[2]!;

    editor.pointerDown({ x: 100, y: 100 }, { altKey: false });
    editor.pointerMove({ x: 130, y: 100 }, { altKey: false });
    expect(ring.position).toMatchObject({ x: 100, y: 100 });
    editor.pointerMove({ x: 300, y: 100 }, { altKey: false });
    expect(ring.position).toMatchObject({ x: 250, y: 100 });
    editor.pointerUp();
    expect(ring.position).toMatchObject({ x: 300, y: 100 });

    const again = createViewAtlasStore(app, `steady-${Math.random()}`);
    expect(again.getState().roomTool).toMatchObject({ stabilize: true });
  });
});
