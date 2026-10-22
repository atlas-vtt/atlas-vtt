// @vitest-environment jsdom
// The harness first: it mocks what the controller imports.
import { event, setup } from './lightingControllerHarness';
import { describe, expect, it } from 'vitest';
import type { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';
import { getHistoryStore } from '../../src/app/stores/history';

describe('the range rings', () => {
  it('are one of the GM overlays the players\' view hides', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    const { rangeRings } = controller.gmOverlays();
    expect(rangeRings.visible).toBe(true);
    expect(controller.playerLayers()).toContainEqual({ layer: rangeRings, visible: false });
  });

  it('go with the popover when a peek starts, and stay away when it ends', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.gmOverlays().rangeRings.visible).toBe(false);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(controller.gmOverlays().rangeRings.visible).toBe(false);
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('resize the open light from the map, as one undo step', () => {
    const { store, light, viewport, torch } = setup();
    store.getState().openLightPopover(torch);
    expect(light.cursorAt(400, 20)).toBe('ns-resize');
    expect(light.pointerDown(400, 20, event(400, 20))).toBe(true);
    viewport.emit('pointermove', event(400, 90) as never);
    viewport.emit('pointermove', event(400, 160) as never);
    viewport.emit('pointerup', {} as never);
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(10);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });
});

describe('a picture of the scene (a thumbnail)', () => {
  const FRAME = { x: 0, y: 0, resolution: 0.5 };
  const PEEK = { key: 'h', code: 'KeyH', bubbles: true };

  /** The GM overlays' visibility: on the canvas before, in the picture, and on the canvas after. */
  function picture(controller: LightingController): Record<'before' | 'during' | 'after', Record<string, boolean>> {
    const shown = (): Record<string, boolean> => Object.fromEntries(Object.entries(controller.gmOverlays()).map(([name, layer]) => [name, layer.visible]));
    const before = shown();
    const during = captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: controller }, FRAME, shown);
    return { before, during, after: shown() };
  }
  const NONE = { wallEditor: false, lightZones: false, exploredMemory: false, doorBadges: false, lightMarkers: false, rangeRings: false, sightAids: false };

  it('leaves the GM overlays out in GM view and has them back', () => {
    const { controller } = setup();
    const { before, during, after } = picture(controller);
    expect(before).toEqual({ wallEditor: false, lightZones: false, exploredMemory: false, doorBadges: true, lightMarkers: true, rangeRings: false, sightAids: true });
    expect(during).toEqual(NONE);
    expect(after).toEqual(before);
  });

  it('leaves the wall editor out with the lighting tool', () => {
    const { controller, store } = setup();
    store.getState().setActiveTool('wall');
    const { before, during, after } = picture(controller);
    expect(before).toEqual({ wallEditor: true, lightZones: false, exploredMemory: false, doorBadges: true, lightMarkers: true, rangeRings: false, sightAids: true });
    expect(during).toEqual(NONE);
    expect(after).toEqual(before);
  });

  it('leaves the range rings out while a light\'s popover is open, and has them back', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    const { before, during, after } = picture(controller);
    expect(before.rangeRings).toBe(true);
    expect(during).toEqual(NONE);
    expect(after).toEqual(before);
    expect(store.getState().lightPopover).toBe(torch);
  });

  it('shows none of them in session view, and leaves the canvas in session view', () => {
    const { controller, store } = setup();
    store.getState().setGMView(false);
    const { before, during, after } = picture(controller);
    expect(before).toEqual(NONE);
    expect(during).toEqual(NONE);
    expect(after).toEqual(NONE);
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
  });

  it('shows none of them during a peek, and leaves the canvas in the players\' view', () => {
    const { controller } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', PEEK));
    const { during, after } = picture(controller);
    expect(during).toEqual(NONE);
    expect(after).toEqual(NONE);
    for (const { layer, visible } of controller.playerLayers()) expect(layer.visible).toBe(visible);
    window.dispatchEvent(new KeyboardEvent('keyup', PEEK));
    expect(controller.gmOverlays().lightMarkers.visible).toBe(true);
  });
});
