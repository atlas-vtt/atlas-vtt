// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MAX_LIGHT_ZONES } from '../../src/app/lighting/lightZones';
import { corners, setup, tearDown } from './lightZoneEditorHarness';

describe('the light zone tool', () => {
  it('is in use only in the lighting tool\'s zone mode, and shows its layer only then', () => {
    const made = setup();
    expect(made.editor.active).toBe(true);
    made.bus.emit('wall-submode-changed', 'draw');
    expect(made.editor.active).toBe(false);
    expect(made.editor.pointerDown({ x: 100, y: 100 }, { altKey: false })).toBe(false);
  });

  it('places a corner with each click and closes the zone with Enter, as one undo step', () => {
    const made = setup();
    corners(made);
    expect(made.zones()).toEqual([]);
    expect(made.editor.drawing).toBe(true);
    expect(made.editor.handleEnter()).toBe(true);
    expect(made.zones()).toMatchObject([{ polygon: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] }]);
    expect(made.steps()).toBe(1);
    expect(made.editor.drawing).toBe(false);
    made.undo();
    expect(made.zones()).toEqual([]);
  });

  it('starts a zone with the scene\'s own ambient light, so nothing changes until its level is set, and opens its popover', () => {
    for (const ambient of [1, 0.4, 0]) {
      const made = setup(ambient);
      corners(made);
      made.editor.handleEnter();
      // The scene's level, and no colour of its own: the scene's tint, as long as it has none.
      expect(made.zones()[0]).toEqual({ id: made.zones()[0]!.id, kind: 'light-zone', polygon: made.zones()[0]!.polygon, ambient });
      expect(made.store.getState().lightZonePopover).toBe(made.zones()[0]!.id);
      tearDown();
    }
  });

  it('closes the zone with a click on its first corner, and with a double click', () => {
    const made = setup();
    corners(made);
    made.click(103, 98);
    expect(made.zones()).toHaveLength(1);
    expect(made.zones()[0]!.polygon).toHaveLength(4);
    // The second click of a double click lands on the corner the first one placed.
    for (const [x, y] of [[500, 100], [600, 100], [600, 200], [600, 200]] as const) made.click(x, y);
    made.editor.doubleClick();
    expect(made.zones()).toHaveLength(2);
    expect(made.zones()[1]!.polygon).toEqual([{ x: 500, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 200 }]);
  });

  it('needs three corners: Enter on fewer keeps drawing, and Escape drops what was placed without an undo step', () => {
    const made = setup();
    made.click(100, 100);
    made.click(300, 100);
    expect(made.editor.handleEnter()).toBe(true);
    expect(made.editor.drawing).toBe(true);
    expect(made.editor.handleEscape()).toBe(true);
    expect(made.editor.drawing).toBe(false);
    expect(made.zones()).toEqual([]);
    expect(made.steps()).toBe(0);
    // With nothing under way Escape is not the tool's.
    expect(made.editor.handleEscape()).toBe(false);
  });

  it('makes no zone of corners on one line, which could be neither opened nor deleted: drawing goes on until they are an area', () => {
    const made = setup();
    for (const [x, y] of [[100, 100], [200, 200], [300, 300]] as const) made.click(x, y);
    expect(made.editor.handleEnter()).toBe(true);
    expect(made.zones()).toEqual([]);
    expect(made.store.getState().objects.lightZones).toBeUndefined();
    expect(made.editor.drawing).toBe(true);
    made.click(300, 100);
    made.editor.handleEnter();
    expect(made.zones()).toHaveLength(1);
    expect(made.zones()[0]!.polygon).toHaveLength(4);
  });

  it('redraws for a pointer move only what the move changes: the line to the next corner, or the corner under the pointer', () => {
    const made = setup();
    corners(made);
    made.editor.handleEnter();
    made.store.getState().closeLightZonePopover();
    const lines = made.editor.view.children[0] as unknown as { clear: () => unknown };
    const clear = vi.spyOn(lines, 'clear');
    // Across the zone, off its corners: nothing the overlay shows changes.
    for (const x of [150, 180, 220, 250]) made.editor.pointerMove({ x, y: 200 }, { altKey: false });
    expect(clear).not.toHaveBeenCalled();
    // Onto a corner and off it again: the corner grows and shrinks.
    made.editor.pointerMove({ x: 300, y: 300 }, { altKey: false });
    made.editor.pointerMove({ x: 301, y: 300 }, { altKey: false });
    expect(clear).toHaveBeenCalledTimes(1);
    made.editor.pointerMove({ x: 250, y: 250 }, { altKey: false });
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('snaps a corner to a wall\'s end close by, and places it freely with Alt', () => {
    const made = setup();
    made.store.getState().addWall({ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 }, closed: true });
    made.click(104, 97);
    made.click(296, 105, { alt: true });
    made.click(200, 300);
    made.editor.handleEnter();
    expect(made.zones()[0]!.polygon).toEqual([{ x: 100, y: 100 }, { x: 296, y: 105 }, { x: 200, y: 300 }]);
  });


  it(`begins no zone on a map that holds ${MAX_LIGHT_ZONES}, and says so`, () => {
    const made = setup();
    for (let i = 0; i < MAX_LIGHT_ZONES - 1; i++) made.store.getState().addLightZone({ polygon: [{ x: 1000 + i * 30, y: 1000 }, { x: 1020 + i * 30, y: 1000 }, { x: 1020 + i * 30, y: 1020 }], ambient: 0 });
    // The last one that fits is drawn as ever.
    corners(made);
    made.editor.handleEnter();
    expect(made.zones()).toHaveLength(MAX_LIGHT_ZONES);
    expect(made.full).not.toHaveBeenCalled();
    made.store.getState().closeLightZonePopover();
    expect(made.click(500, 500)).toBe(true);
    expect(made.editor.drawing).toBe(false);
    expect(made.full).toHaveBeenCalledTimes(1);
    // Its corners can still be moved and its popover opened.
    made.click(200, 200);
    expect(made.store.getState().lightZonePopover).toBe(made.zones()[MAX_LIGHT_ZONES - 1]!.id);
  });

  it('opens a zone\'s popover with a click on its handle, and deletes that zone with Delete', () => {
    const made = setup();
    corners(made);
    made.editor.handleEnter();
    const [zone] = made.zones();
    made.store.getState().closeLightZonePopover();
    // The handle sits in the middle of the square.
    expect(made.click(202, 199)).toBe(true);
    expect(made.store.getState().lightZonePopover).toBe(zone!.id);
    expect(made.editor.drawing).toBe(false);
    expect(made.editor.handleDelete()).toBe(true);
    expect(made.zones()).toEqual([]);
    expect(made.editor.handleDelete()).toBe(false);
  });

  it('shows the pointer what a click would do', () => {
    const made = setup();
    corners(made);
    made.editor.handleEnter();
    expect(made.editor.cursorAt({ x: 300, y: 300 })).toBe('grab');
    expect(made.editor.cursorAt({ x: 200, y: 200 })).toBe('pointer');
    expect(made.editor.cursorAt({ x: 500, y: 500 })).toBe('crosshair');
  });

  it('drops a zone half drawn when its layer is hidden or the tool leaves zone mode', () => {
    const made = setup();
    made.click(100, 100);
    made.bus.emit('wall-submode-changed', 'draw');
    expect(made.editor.drawing).toBe(false);
    made.bus.emit('wall-submode-changed', 'light-zone');
    made.click(100, 100);
    made.editor.view.visible = false;
    made.editor.afterVisibilityChange();
    expect(made.editor.drawing).toBe(false);
  });
});
