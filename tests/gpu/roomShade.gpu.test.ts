import '../setup/obsidianDom';
import type { EventEmitter as NodeEventEmitter } from 'events';
import { EventEmitter, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it } from 'vitest';
import { RoomEditor } from '../../src/app/pixi/lighting/RoomEditor';
import { copiedPixel, createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP = 400;
const ring = (a: number, b: number): { p1: { x: number; y: number }; p2: { x: number; y: number }; type: 'wall' }[] => {
  const corners = [{ x: a, y: a }, { x: b, y: a }, { x: b, y: b }, { x: a, y: b }];
  return corners.map((p1, i) => ({ p1, p2: corners[(i + 1) % 4]!, type: 'wall' }));
};

/** The rooms mode darkens the rock and leaves the floor as it is, a room within a room too: cut out by a stencil, no filter. */
describe('the rooms mode\'s rock', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  it('darkens outside the rooms, not on their floor', async () => {
    const renderer = await createTestRenderer(MAP);
    const store = createViewAtlasStore(createInMemoryApp().app, `room-shade-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/room.atlasmap' });
    store.getState().setActiveTool('wall');
    store.getState().editWalls([], [...ring(50, 350), ...ring(170, 230)]);
    const viewport = new Viewport({ screenWidth: MAP, screenHeight: MAP, events: renderer.events });
    viewport.addChild(new Graphics().rect(0, 0, MAP, MAP).fill({ color: 0xffffff }));
    const bus = new EventEmitter();
    const editor = new RoomEditor({ viewport, store, eventBus: bus as unknown as NodeEventEmitter, bounds: () => ({ width: MAP, height: MAP }), onActiveChange: () => undefined, canvas: renderer.canvas });
    bus.emit('wall-submode-changed', 'rooms');
    editor.view.visible = true;
    editor.afterVisibilityChange();
    cleanup.push(() => { editor.destroy(); viewport.destroy({ children: true }); renderer.destroy(); });
    renderer.render({ container: viewport });
    const shade = (x: number, y: number): number => copiedPixel(renderer.canvas, x, y)[0]!;
    expect(shade(100, 100)).toBe(255);
    expect(Math.abs(shade(20, 20) - 255 * 0.55)).toBeLessThan(3);
    expect(shade(200, 200)).toBe(255);
  });
});
