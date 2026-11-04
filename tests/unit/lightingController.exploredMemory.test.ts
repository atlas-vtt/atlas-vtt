// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { asked, overlay, PEEK, setup, told } from './lightingMemoryHarness';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';

describe('the lighting tool\'s explored-memory mode', () => {
  it('shows what is explored only with the lighting tool in that mode, on a lit scene that remembers', () => {
    const { controller, store, eventBus } = setup();
    expect(overlay(controller).visible).toBe(false);
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'explored-memory');
    // Unlit: there is no memory to edit.
    expect(overlay(controller).visible).toBe(false);
    store.getState().setSceneLighting({ enabled: true });
    expect(overlay(controller).visible).toBe(true);

    store.getState().setSceneLighting({ exploredMemory: false });
    expect(overlay(controller).visible).toBe(false);
    store.getState().setSceneLighting({ exploredMemory: true });
    expect(overlay(controller).visible).toBe(true);

    eventBus.emit('wall-submode-changed', 'draw');
    expect(overlay(controller).visible).toBe(false);
    eventBus.emit('wall-submode-changed', 'explored-memory');
    store.getState().setActiveTool('select');
    expect(overlay(controller).visible).toBe(false);
  });

  it('never shows it to the players: not in session view, during a peek, in their frame or in a thumbnail', () => {
    const { controller, store, enterMode } = setup();
    enterMode();
    expect(overlay(controller).visible).toBe(true);

    expect(controller.playerLayers()).toContainEqual({ layer: overlay(controller), visible: false });
    const inThumbnail = captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: controller }, { x: 0, y: 0, resolution: 0.5 }, () => overlay(controller).visible);
    expect(inThumbnail).toBe(false);
    expect(overlay(controller).visible).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', PEEK));
    expect(overlay(controller).visible).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
    expect(overlay(controller).visible).toBe(true);

    store.getState().setGMView(false);
    expect(overlay(controller).visible).toBe(false);
  });

  it('marks all areas explored and forgets them from the menu\'s actions', () => {
    const { eventBus } = setup();
    eventBus.emit('lighting-reveal-explored');
    expect(asked.edits).toEqual([{ mode: 'reveal', area: 'everything' }]);
    eventBus.emit('lighting-reset-explored');
    expect(asked.resets).toBe(1);
  });

  it('tells the GM of an undo or redo of a memory edit unless the canvas shows the memory', () => {
    const { store, enterMode } = setup();
    // The engine's memory reports to the mode's overlay.
    asked.watcher!.memoryTravelled(true);
    expect(told).toEqual([true]);
    enterMode();
    asked.watcher!.memoryTravelled(true);
    asked.watcher!.memoryTravelled(false);
    expect(told).toEqual([true]);
    store.getState().setGMView(false);
    asked.watcher!.memoryTravelled(false);
    expect(told).toEqual([true, false]);
  });
});
