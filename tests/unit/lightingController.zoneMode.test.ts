// @vitest-environment jsdom
// The harness first: it mocks what the controller imports.
import { event, setup, type Setup } from './lightingControllerHarness';
import { describe, expect, it, vi } from 'vitest';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';
import { getHistoryStore } from '../../src/app/stores/history';

describe('the lighting tool\'s zone mode', () => {
  it('shows the zones\' layer only with the lighting tool in that mode, never in the players\' view or a picture of the scene', () => {
    const { controller, store, eventBus } = setup();
    const shown = (): boolean => controller.gmOverlays().lightZones.visible;
    eventBus.emit('wall-submode-changed', 'light-zone');
    expect(shown()).toBe(false);
    store.getState().setActiveTool('wall');
    expect(shown()).toBe(true);
    expect(captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: controller }, { x: 0, y: 0, resolution: 0.5 }, shown)).toBe(false);
    store.getState().setGMView(false);
    expect(shown()).toBe(false);
    store.getState().setGMView(true);
    eventBus.emit('wall-submode-changed', 'draw');
    expect(shown()).toBe(false);
  });

  it('draws a zone with clicks that pass the lights and walls beneath them, closes it with Enter and edits it in its popover until the tool is left', () => {
    const { controller, store, eventBus, light, wallDown } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'light-zone');
    // The first corner lands on the torch's marker: the zone tool takes the press, not the light.
    for (const [x, y] of [[400, 300], [700, 300], [700, 500]] as const) {
      expect(light.pointerDown(x, y, event(x, y))).toBe(false);
      expect(wallDown(x, y, event(x, y))).toBe(true);
    }
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.handleEnter()).toBe(true);
    const [zone] = Object.values(store.getState().objects.lightZones ?? {});
    expect(zone?.polygon).toHaveLength(3);
    expect(store.getState().lightZonePopover).toBe(zone!.id);
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(0);
    store.getState().setActiveTool('select');
    expect(store.getState().lightZonePopover).toBeNull();
    // With nothing to close Enter is not the lighting's.
    expect(controller.handleEnter()).toBe(false);
  });

  it('deletes the zone whose popover is open with Delete, and closes the popover with Escape', () => {
    const { controller, store, eventBus } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'light-zone');
    const id = store.getState().addLightZone({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], ambient: 0 });
    store.getState().openLightZonePopover(id);
    expect(controller.handleEscape()).toBe(true);
    expect(store.getState().lightZonePopover).toBeNull();
    store.getState().openLightZonePopover(id);
    expect(controller.handleDelete()).toBe(true);
    expect(store.getState().objects.lightZones).toEqual({});
  });
});

describe('closing the zone popover', () => {
  /** The lighting tool in zone mode with one zone, its popover open. */
  function open(): Setup & { zone: string } {
    const made = setup();
    made.store.getState().setActiveTool('wall');
    made.eventBus.emit('wall-submode-changed', 'light-zone');
    getHistoryStore(made.store)!.getState().clear();
    const zone = made.store.getState().addLightZone({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], ambient: 0 });
    made.store.getState().openLightZonePopover(zone);
    return { ...made, zone };
  }

  it('closes when undo takes its zone away, and stays closed when redo brings the zone back', () => {
    const { store, zone } = open();
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.lightZones?.[zone]).toBeUndefined();
    expect(store.getState().lightZonePopover).toBeNull();
    getHistoryStore(store)!.getState().redo();
    expect(store.getState().objects.lightZones?.[zone]).toBeDefined();
    expect(store.getState().lightZonePopover).toBeNull();
  });

  it('closes when the lighting tool leaves its zone mode, and Escape is then no longer the zone tool\'s', () => {
    const { controller, store, eventBus } = open();
    eventBus.emit('wall-submode-changed', 'draw');
    expect(store.getState().lightZonePopover).toBeNull();
    expect(controller.handleEscape()).toBe(false);
  });

  it('closes when a peek at the players\' view starts, and stays closed when it ends', () => {
    const { store } = open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(store.getState().lightZonePopover).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(store.getState().lightZonePopover).toBeNull();
  });

  it('closes in session view', () => {
    const { store } = open();
    store.getState().setGMView(false);
    expect(store.getState().lightZonePopover).toBeNull();
  });

  it('closes when another Obsidian tab becomes active', () => {
    const { store, zone, obsApp } = open();
    const onLeafChange = vi.mocked(obsApp.workspace.on).mock.calls.find(([name]) => name === 'active-leaf-change')![1] as (leaf: unknown) => void;
    const ownLeaf = { view: { viewId: 'popover-view' } };
    vi.mocked(obsApp.workspace.getLeavesOfType).mockReturnValue([ownLeaf] as never);
    onLeafChange(ownLeaf);
    expect(store.getState().lightZonePopover).toBe(zone);
    onLeafChange({ view: { viewId: 'a-note' } });
    expect(store.getState().lightZonePopover).toBeNull();
  });

  it('closes when the scene changes', () => {
    const { store, eventBus, zone } = open();
    eventBus.emit('map-unloading');
    expect(store.getState().lightZonePopover).toBeNull();
    store.getState().openLightZonePopover(zone);
    store.getState().setMapLoading(true);
    expect(store.getState().lightZonePopover).toBeNull();
  });

  it('does not open for a zone that is not there', () => {
    const { store } = open();
    store.getState().openLightZonePopover('gone');
    expect(store.getState().lightZonePopover).toBeNull();
  });
});
