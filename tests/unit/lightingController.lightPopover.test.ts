// @vitest-environment jsdom
// The harness first: it mocks what the controller imports.
import { contextMenuOpened, event, setup } from './lightingControllerHarness';
import { describe, expect, it, vi } from 'vitest';
import { genericLight } from '../mocks/lights';
import { getHistoryStore } from '../../src/app/stores/history';

describe('opening a light', () => {
  it('opens its popover on a click on its marker, with the select tool', () => {
    const { store, torch, click } = setup();
    expect(click(400, 300)).toBe(true);
    expect(store.getState().lightPopover).toBe(torch);
  });

  it('moves the one popover to another light that is clicked', () => {
    const { store, lantern, click } = setup();
    click(400, 300);
    click(600, 300);
    expect(store.getState().lightPopover).toBe(lantern);
  });

  it('opens from the lighting tool\'s context menu, which a right-click keeps', () => {
    const { store, torch, contextMenu } = setup();
    store.getState().setActiveTool('wall');
    contextMenu(400, 300, 10, 10);
    const entries = contextMenuOpened.mock.calls[0]![0] as { label: string; onClick: () => void }[];
    entries.find((entry) => entry.label === 'Configure light…')!.onClick();
    expect(store.getState().lightPopover).toBe(torch);
  });

  it('does not place another light on a marker with the lighting tool, and opens it instead', () => {
    const { store, eventBus, torch, click, wallDown } = setup();
    store.getState().setActiveTool('wall');
    eventBus.emit('wall-submode-changed', 'place-light');
    expect(click(400, 300)).toBe(true);
    expect(Object.keys(store.getState().objects.lights)).toHaveLength(2);
    expect(store.getState().lightPopover).toBe(torch);
    // Off the markers the tool places one, with its kind.
    wallDown(100, 100, event(100, 100));
    const placed = Object.values(store.getState().objects.lights).find((light) => light.x === 100);
    expect(placed?.emission.kind).toBe('torch');
  });

  it('leaves a press to the lighting tool where a wall handle is, and with Shift, which draws past lights', () => {
    const { store, light, click } = setup();
    store.getState().setActiveTool('wall');
    store.getState().addWall({ type: 'solid', p1: { x: 402, y: 300 }, p2: { x: 402, y: 500 }, closed: true });
    expect(click(400, 300)).toBe(false);
    expect(light.cursorAt(400, 300)).toBeNull();
    expect(click(600, 300, { shift: true })).toBe(false);
    expect(click(600, 300)).toBe(true);
  });

  it('is not possible in session view, where the markers are hidden', () => {
    const { store, click } = setup();
    store.getState().setGMView(false);
    expect(click(400, 300)).toBe(false);
    expect(store.getState().lightPopover).toBeNull();
  });
});

describe('closing the light popover', () => {
  it('closes on Escape, before the key is the wall editor\'s', () => {
    const { controller, store, torch } = setup();
    store.getState().openLightPopover(torch);
    expect(controller.handleEscape()).toBe(true);
    expect(store.getState().lightPopover).toBeNull();
    expect(controller.handleEscape()).toBe(false);
  });

  it('cancels a ring drag under way with Escape, putting the range back', () => {
    const { controller, store, light, viewport, torch } = setup();
    store.getState().openLightPopover(torch);
    light.pointerDown(400, 20, event(400, 20));
    viewport.emit('pointermove', event(400, 90) as never);
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(15);
    expect(controller.handleEscape()).toBe(true);
    viewport.emit('pointermove', event(400, 230) as never);
    expect(store.getState().lightPopover).toBeNull();
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(20);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('cancels a light being dragged with Escape, putting it back', () => {
    const { controller, store, light, viewport, torch } = setup();
    store.getState().setActiveTool('wall');
    light.pointerDown(400, 300, event(400, 300));
    viewport.emit('pointermove', event(470, 330) as never);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 470, y: 330 });
    expect(controller.handleEscape()).toBe(true);
    viewport.emit('pointermove', event(600, 400) as never);
    viewport.emit('pointerup', {} as never);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when its light is deleted', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    store.getState().deleteLight(torch);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when undo takes its light away', () => {
    const { store, click } = setup();
    const placed = store.getState().addLight({ x: 100, y: 100, emission: genericLight('candle') });
    click(100, 100);
    expect(store.getState().lightPopover).toBe(placed);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.lights[placed]).toBeUndefined();
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when the scene changes', () => {
    const { store, eventBus, torch } = setup();
    store.getState().openLightPopover(torch);
    eventBus.emit('map-unloading');
    expect(store.getState().lightPopover).toBeNull();
    store.getState().openLightPopover(torch);
    store.getState().setMapLoading(true);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when a peek at the players\' view starts', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', bubbles: true }));
    expect(store.getState().lightPopover).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h', code: 'KeyH', bubbles: true }));
  });

  it('closes when another Obsidian tab becomes active, which a key can do without a press', () => {
    const { store, torch, obsApp } = setup();
    const onLeafChange = vi.mocked(obsApp.workspace.on).mock.calls.find(([event]) => event === 'active-leaf-change')![1] as (leaf: unknown) => void;
    const ownLeaf = { view: { viewId: 'popover-view' } };
    vi.mocked(obsApp.workspace.getLeavesOfType).mockReturnValue([ownLeaf] as never);
    store.getState().openLightPopover(torch);
    onLeafChange(ownLeaf);
    expect(store.getState().lightPopover).toBe(torch);
    onLeafChange({ view: { viewId: 'a-note' } });
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes in session view', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    store.getState().setGMView(false);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes when the scene\'s lighting goes off and takes the markers with it', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    store.getState().setSceneLighting({ enabled: false });
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes on a press on the map off the lights', () => {
    const { store, torch, viewport } = setup();
    store.getState().openLightPopover(torch);
    (viewport.options.events.domElement as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 }));
    expect(store.getState().lightPopover).toBeNull();
  });
});
