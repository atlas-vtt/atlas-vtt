// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, expect, it } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { RoomEditor } from '../../src/app/pixi/lighting/RoomEditor';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

it('keeps both of the bucket\'s rings under a pointer at rest while the camera pans and zooms', () => {
  const restore = stubJsdomGraphics();
  const canvas = document.createElement('canvas');
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events: { domElement: canvas } as unknown as EventSystem });
  const store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `rings-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setActiveTool('wall');
  store.getState().setRoomTool({ shape: 'bucket' });
  const bus = new EventEmitter();
  const editor = new RoomEditor({ viewport, store, eventBus: bus, bounds: () => ({ width: 2000, height: 2000 }), onActiveChange: () => undefined, canvas });
  cleanup = () => { editor.destroy(); viewport.destroy(); restore(); };
  bus.emit('wall-submode-changed', 'rooms');
  editor.view.visible = true;
  editor.pointerMove({ x: 500, y: 400 }, { altKey: false });
  const ring = editor.view.children[2]!;
  // The inner ring (the brush) is drawn into the preview at the pointer's place.
  const inner = (): { x: number; y: number } => {
    const { x, y, width, height } = editor.view.children[1]!.getLocalBounds();
    return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  };

  viewport.x -= 120;
  viewport.emit('moved', { viewport, type: 'clamp-x' });
  expect(ring.position).toMatchObject({ x: 620, y: 400 });
  expect(inner()).toEqual({ x: 620, y: 400 });
  viewport.scale.set(2);
  viewport.emit('zoomed', { viewport, type: 'wheel' });
  const under = viewport.toWorld(500, 400);
  expect(ring.position).toMatchObject(under);
  expect(inner()).toEqual({ x: Math.round(under.x), y: Math.round(under.y) });
});
