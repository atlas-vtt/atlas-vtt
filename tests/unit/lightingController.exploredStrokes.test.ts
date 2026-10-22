// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { asked, KEYS, PEEK, setup, teardown, wallCount, type Setup } from './lightingMemoryHarness';
import type { ExploredEdit } from '../../src/app/lighting/exploredEdits';
import { genericLight } from '../mocks/lights';

describe('a stroke in the lighting tool\'s explored-memory mode', () => {
  it('reveals what a brush stroke covers when it is released: one edit, and nothing before', () => {
    const { enterMode, down, move, up } = setup();
    enterMode();
    expect(down(100, 100)).toBe(true);
    move(160, 100);
    move(160, 180);
    expect(asked.edits).toEqual([]);
    up();
    expect(asked.edits).toEqual([{ mode: 'reveal', area: { type: 'brush', brushRadius: 50, points: [{ x: 100, y: 100 }, { x: 160, y: 100 }, { x: 160, y: 180 }] } }]);
    // A release without a stroke does nothing.
    up();
    expect(asked.edits).toHaveLength(1);
  });

  it('forgets, and takes the shape and the brush size the menu chose', () => {
    const { store, enterMode, down, move, up } = setup();
    enterMode();
    store.getState().setExploredBrush({ mode: 'forget' });
    store.getState().setExploredBrush({ brushSize: 20 });
    down(100, 100);
    up();
    store.getState().setExploredBrush({ shape: 'rectangle' });
    down(300, 400);
    move(200, 250);
    up();
    store.getState().setExploredBrush({ mode: 'reveal' });
    store.getState().setExploredBrush({ shape: 'lasso' });
    down(10, 10);
    move(90, 10);
    move(50, 80);
    up();
    expect(asked.edits).toEqual<ExploredEdit[]>([
      { mode: 'forget', area: { type: 'brush', brushRadius: 20, points: [{ x: 100, y: 100 }] } },
      // A rectangle is not snapped to the grid: walls and rooms follow the map's artwork.
      { mode: 'forget', area: { type: 'rectangle', x: 200, y: 250, width: 100, height: 150 } },
      { mode: 'reveal', area: { type: 'lasso', points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 50, y: 80 }] } },
    ]);
  });

  it('applies nothing for a stroke that marks no area', () => {
    const { store, enterMode, down, move, up } = setup();
    enterMode();
    store.getState().setExploredBrush({ shape: 'rectangle' });
    down(300, 400);
    up();
    store.getState().setExploredBrush({ shape: 'lasso' });
    down(10, 10);
    move(90, 10);
    up();
    expect(asked.edits).toEqual([]);
  });

  it('leaves nothing of a stroke that is cancelled: Escape, a lost pointer, the window losing focus, another tool or mode, the players\' view', () => {
    const cancels: [string, (s: Setup) => void][] = [
      ['Escape', ({ controller }) => expect(controller.handleEscape()).toBe(true)],
      ['pointercancel', ({ canvas }) => canvas.dispatchEvent(new Event('pointercancel'))],
      ['blur', () => window.dispatchEvent(new Event('blur'))],
      ['another tool', ({ store }) => store.getState().setActiveTool('select')],
      ['another mode', ({ eventBus }) => eventBus.emit('wall-submode-changed', 'draw')],
      ['session view', ({ store }) => store.getState().setGMView(false)],
      ['a peek', () => window.dispatchEvent(new KeyboardEvent('keydown', PEEK))],
      ['memory switched off', ({ store }) => store.getState().setSceneLighting({ exploredMemory: false })],
      ['lighting switched off', ({ store }) => store.getState().setSceneLighting({ enabled: false })],
      ['another shape', ({ store }) => store.getState().setExploredBrush({ shape: 'lasso' })],
      ['forget instead of reveal', ({ store }) => store.getState().setExploredBrush({ mode: 'forget' })],
      ['another brush size', ({ store }) => store.getState().setExploredBrush({ brushSize: 80 })],
      ['the scene unloading', ({ eventBus }) => eventBus.emit('map-unloading')],
    ];
    for (const [name, cancel] of cancels) {
      const s = setup();
      s.enterMode();
      s.down(100, 100);
      s.move(200, 100);
      cancel(s);
      s.up();
      expect(asked.edits, name).toEqual([]);
      window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
      teardown();
    }
  });

  it('takes no press while the canvas shows the players\' view', () => {
    const { store, enterMode, down, move, up } = setup();
    enterMode();
    store.getState().setGMView(false);
    expect(down(100, 100)).toBe(false);
    move(200, 100);
    up();
    window.dispatchEvent(new KeyboardEvent('keydown', PEEK));
    expect(down(100, 100)).toBe(false);
    up();
    window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
    expect(asked.edits).toEqual([]);
  });

  it('takes every press of the tool: no wall is drawn and no light is opened or moved in the mode', () => {
    const { store, enterMode, down, move, up, light, cursor } = setup();
    const torch = store.getState().addLight({ x: 100, y: 100, emission: genericLight('torch') });
    enterMode();
    expect(light.pointerDown(100, 100, KEYS)).toBe(false);
    expect(light.cursorAt(100, 100)).toBeNull();
    expect(cursor(100, 100)).toBe('crosshair');
    down(100, 100);
    move(300, 300);
    up();
    down(400, 400);
    up();
    expect(wallCount(store)).toBe(0);
    expect(store.getState().lightPopover).toBeNull();
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 100, y: 100 });
    expect(asked.edits).toHaveLength(2);
  });

  it('draws no wall either while the mode is chosen on a scene whose memory cannot be edited', () => {
    const { store, eventBus, down, up } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'explored-memory');
    for (const lighting of [{ enabled: false }, { enabled: true, exploredMemory: false }]) {
      store.getState().setSceneLighting(lighting);
      expect(down(100, 100)).toBe(false);
      up();
      down(300, 100);
      up();
    }
    expect(wallCount(store)).toBe(0);
    expect(asked.edits).toEqual([]);
  });

  it('leaves Escape to the wall editor when no stroke is under way', () => {
    const { controller, enterMode } = setup();
    enterMode();
    expect(controller.handleEscape()).toBe(false);
  });

  it('goes on when the pointer leaves the map and comes back: only the brush\'s ring goes', () => {
    const { enterMode, down, move, up, light } = setup();
    enterMode();
    down(100, 100);
    light.leave();
    move(160, 100);
    up();
    expect(asked.edits).toEqual([{ mode: 'reveal', area: { type: 'brush', brushRadius: 50, points: [{ x: 100, y: 100 }, { x: 160, y: 100 }] } }]);
  });

  it('takes the choices the tool had before it was built: they are the store\'s, not the menu\'s', () => {
    // As when the controller is built anew on a view whose store lives on.
    const { enterMode, down, move, up } = setup((store) => store.getState().setExploredBrush({ mode: 'forget', shape: 'rectangle' }));
    enterMode();
    down(10, 10);
    move(60, 40);
    up();
    expect(asked.edits).toEqual([{ mode: 'forget', area: { type: 'rectangle', x: 10, y: 10, width: 50, height: 30 } }]);
  });
});
