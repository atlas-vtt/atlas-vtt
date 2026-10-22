// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { genericLight } from '../mocks/lights';
import { setup, teardown } from '../mocks/lightInteractionSetup';
import { ringHandleAt, ringHandlePoint } from '../../src/app/pixi/lighting/lightRingGeometry';
import { beginHistoryTransaction, endHistoryTransaction, getHistoryStore } from '../../src/app/stores/history';

afterEach(teardown);

describe('a press on a light marker', () => {
  it('opens the light\'s popover on a click with any tool, without an undo step', () => {
    const { store, torch, press, up, steps, select } = setup();
    expect(press(404, 298)).toBe(true);
    up();
    expect(store.getState().lightPopover).toBe(torch);
    expect(steps()).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });

  it('still counts as a click when the pointer wobbles less than the threshold', () => {
    const { store, torch, press, move, up } = setup();
    press(400, 300);
    move(403, 303);
    up();
    expect(store.getState().lightPopover).toBe(torch);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
  });

  it('neither moves the light nor opens its popover when dragged without the lighting tool', () => {
    const { store, torch, press, move, up, steps } = setup();
    press(400, 300);
    move(460, 340);
    up();
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
    expect(store.getState().lightPopover).toBeNull();
    expect(steps()).toBe(0);
  });

  it('moves the light with the lighting tool once the drag starts, as one undo step', () => {
    const { store, torch, tool, select, press, move, up, steps, undo } = setup();
    tool.active = true;
    press(404, 298);
    expect(select).toHaveBeenCalledWith(torch, false);
    move(406, 300);
    expect(steps()).toBe(0);
    move(450, 330);
    move(500, 380);
    // The marker keeps the offset it was grabbed at.
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 496, y: 382 });
    up();
    expect(store.getState().lightPopover).toBeNull();
    expect(steps()).toBe(1);
    undo();
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
  });

  it('opens the popover on a click with the lighting tool too', () => {
    const { store, torch, tool, press, up, steps } = setup();
    tool.active = true;
    press(400, 300);
    up();
    expect(store.getState().lightPopover).toBe(torch);
    expect(steps()).toBe(0);
  });

  it('toggles the light in the tool\'s selection with Ctrl instead of opening it', () => {
    const { store, torch, tool, select, press, up } = setup();
    tool.active = true;
    press(400, 300, { ctrl: true });
    up();
    expect(select).toHaveBeenCalledWith(torch, true);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('is not taken off the marker, or where the lighting tool has a wall handle first', () => {
    const { store, press, up } = setup();
    expect(press(430, 300)).toBe(false);
    expect(press(400, 300, { blocked: true })).toBe(false);
    up();
    expect(store.getState().lightPopover).toBeNull();
  });

  it('puts the light back when the drag is cancelled, and leaves no undo step', () => {
    const { store, torch, tool, lights, markers, press, move, steps } = setup();
    tool.active = true;
    press(400, 300);
    move(450, 300);
    expect(lights.dragging).toBe(true);
    lights.cancel();
    move(700, 300);
    expect(lights.dragging).toBe(false);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
    expect(steps()).toBe(0);
    expect(markers.view.children[0]!.scale.x).toBe(1);
  });

  it('cancels the drag when the window loses focus or the pointer is cancelled', () => {
    const { store, torch, tool, canvas, press, move, up, steps } = setup();
    tool.active = true;
    press(400, 300);
    move(450, 300);
    window.dispatchEvent(new Event('blur'));
    move(700, 300);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
    press(400, 300);
    move(450, 300);
    canvas.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    up();
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300 });
    expect(steps()).toBe(0);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('keeps an outer undo step open when a drag inside it is cancelled', () => {
    const { store, torch, tool, lights, press, move, steps } = setup();
    tool.active = true;
    beginHistoryTransaction(store);
    store.getState().updateLight(torch, { hidden: true });
    press(400, 300);
    move(450, 300);
    lights.cancel();
    endHistoryTransaction(store);
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 400, y: 300, hidden: true });
    expect(steps()).toBe(1);
  });
});

describe('the range rings of the open light', () => {
  it('have their handles above and below the light, hit at a constant size on screen', () => {
    const geometry = { center: { x: 400, y: 300 }, radius: { bright: 280, dim: 560 } };
    expect(ringHandlePoint(geometry, 'bright')).toEqual({ x: 400, y: 20 });
    expect(ringHandlePoint(geometry, 'dim')).toEqual({ x: 400, y: 860 });
    expect(ringHandleAt(geometry, { x: 405, y: 25 }, 1)).toBe('bright');
    expect(ringHandleAt(geometry, { x: 400, y: 40 }, 1)).toBeNull();
    expect(ringHandleAt(geometry, { x: 400, y: 40 }, 0.5)).toBe('bright');
    expect(ringHandleAt(geometry, { x: 400, y: 26 }, 3)).toBeNull();
  });

  it('show only for the light whose popover is open, and never in the players\' view', () => {
    const { store, rings, torch } = setup();
    expect(rings.view.visible).toBe(false);
    expect(rings.handleAt(400, 20)).toBeNull();
    store.getState().openLightPopover(torch);
    expect(rings.view.visible).toBe(true);
    expect(rings.handleAt(400, 20)).toBe('bright');
    rings.setSuppressed(true);
    expect(rings.view.visible).toBe(false);
    expect(rings.handleAt(400, 20)).toBeNull();
    rings.setSuppressed(false);
    store.getState().closeLightPopover();
    expect(rings.view.visible).toBe(false);
  });

  it('follow the light\'s ranges when the popover changes them', () => {
    const { store, rings, torch } = setup();
    store.getState().openLightPopover(torch);
    store.getState().updateLight(torch, { emission: { ...genericLight('torch'), bright: 10, dim: 15 } });
    expect(rings.geometry()?.radius).toEqual({ bright: 140, dim: 210 });
  });

  it('resize a range when a handle is dragged, snapped to whole units, as one undo step', () => {
    const { store, torch, press, move, up, steps, undo } = setup();
    store.getState().openLightPopover(torch);
    expect(press(400, 20)).toBe(true);
    move(400, 60);
    move(400, 87);
    // 213 px is 15.2 ft
    expect(store.getState().objects.lights[torch]!.emission).toMatchObject({ bright: 15, dim: 40 });
    up();
    expect(steps()).toBe(1);
    expect(store.getState().lightPopover).toBe(torch);
    undo();
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(20);
  });

  it('stop at the farthest a light may reach, however far the pointer goes', () => {
    const { store, torch, press, move, up } = setup();
    store.getState().openLightPopover(torch);
    // The dim handle is below the light: 40 ft are 560 px.
    expect(press(400, 860)).toBe(true);
    move(400, 5e6);
    up();
    // 8,192 px on the 70 px, 5 ft grid
    expect(store.getState().objects.lights[torch]!.emission).toMatchObject({ bright: 20, dim: 585 });
  });

  it('keep tenths while Alt is held', () => {
    const { store, torch, press, move, up } = setup();
    store.getState().openLightPopover(torch);
    press(400, 20);
    move(400, 87, true);
    up();
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(15.2);
  });

  it('never leave dim below bright: the dragged ring takes the other along', () => {
    const { store, torch, press, move, up } = setup();
    store.getState().updateLight(torch, { emission: { ...genericLight('torch'), bright: 10, dim: 15 } });
    store.getState().openLightPopover(torch);
    press(400, 160);
    move(400, 20);
    expect(store.getState().objects.lights[torch]!.emission).toMatchObject({ bright: 20, dim: 20 });
    up();
    press(400, 580);
    move(400, 370);
    up();
    expect(store.getState().objects.lights[torch]!.emission).toMatchObject({ bright: 5, dim: 5 });
  });

  it('put the range back when the popover closes under the drag, and leave no undo step', async () => {
    const { store, torch, lights, press, move, steps } = setup();
    store.getState().openLightPopover(torch);
    press(400, 20);
    move(400, 90);
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(15);
    store.getState().closeLightPopover();
    expect(lights.dragging).toBe(false);
    move(400, 230);
    expect(store.getState().objects.lights[torch]!.emission).toMatchObject({ bright: 20, dim: 40 });
    await Promise.resolve();
    expect(steps()).toBe(0);
    // The drag's undo step is closed: the next edit is a step of its own.
    store.getState().updateLight(torch, { hidden: true });
    expect(steps()).toBe(1);
  });

  it('end the drag when the popover moves to another light', () => {
    const { store, torch, press, move, steps } = setup();
    const lantern = store.getState().addLight({ x: 100, y: 500, emission: genericLight('lantern') });
    getHistoryStore(store)!.getState().clear();
    store.getState().openLightPopover(torch);
    press(400, 20);
    move(400, 90);
    store.getState().openLightPopover(lantern);
    move(400, 230);
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(20);
    expect(store.getState().objects.lights[lantern]!.emission.bright).toBe(30);
    expect(steps()).toBe(0);
  });

  it('cancel the drag on a pointer cancel', () => {
    const { store, torch, canvas, press, move, steps } = setup();
    store.getState().openLightPopover(torch);
    press(400, 20);
    move(400, 90);
    canvas.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    move(400, 230);
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(20);
    expect(steps()).toBe(0);
  });

  it('have no handle for a range of nothing, which would sit on the marker', () => {
    const geometry = { center: { x: 400, y: 300 }, radius: { bright: 0, dim: 560 } };
    expect(ringHandleAt(geometry, { x: 400, y: 300 }, 1)).toBeNull();
    expect(ringHandleAt(geometry, { x: 400, y: 860 }, 1)).toBe('dim');
  });

  it('leave a press on the marker of a light without bright range to the marker', () => {
    const { store, torch, tool, press, move, up } = setup();
    store.getState().updateLight(torch, { emission: { ...genericLight('torch'), bright: 0 } });
    store.getState().openLightPopover(torch);
    tool.active = true;
    press(400, 300);
    move(460, 340);
    up();
    expect(store.getState().objects.lights[torch]).toMatchObject({ x: 460, y: 340 });
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(0);
  });

  it('keep the handle at the distance it was grabbed at', () => {
    const { store, torch, press, move, up } = setup();
    store.getState().openLightPopover(torch);
    press(400, 26);
    move(400, 27);
    up();
    expect(store.getState().objects.lights[torch]!.emission.bright).toBe(20);
  });
});

describe('hover', () => {
  it('points at a marker and resizes at a ring handle', () => {
    const { store, lights, torch } = setup();
    expect(lights.cursorAt({ x: 400, y: 300 })).toBe('pointer');
    expect(lights.cursorAt({ x: 400, y: 300 }, true)).toBeNull();
    expect(lights.cursorAt({ x: 100, y: 100 })).toBeNull();
    store.getState().openLightPopover(torch);
    expect(lights.cursorAt({ x: 400, y: 20 })).toBe('ns-resize');
  });
});

describe('a press outside the popover', () => {
  function pressOn(target: Element, clientX = 0, clientY = 0): void {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX, clientY }));
  }

  it('closes it, wherever it lands', () => {
    const { store, torch } = setup();
    store.getState().openLightPopover(torch);
    pressOn(document.body);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('closes it on the map, off the lights', () => {
    const { store, torch, canvas } = setup();
    store.getState().openLightPopover(torch);
    pressOn(canvas, 100, 100);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('keeps it for a press inside it in a popout window, whose elements are another window\'s', () => {
    const frame = document.body.appendChild(document.createElement('iframe'));
    const popout = frame.contentWindow!;
    // Obsidian gives every window's nodes `instanceOf`, which asks that window's own classes.
    Object.defineProperty((popout as unknown as { Node: typeof Node }).Node.prototype, 'instanceOf', {
      configurable: true,
      value(this: Node, type: { name: string }) {
        return this instanceof ((this.ownerDocument?.defaultView as unknown as Record<string, typeof Node>)[type.name]!);
      },
    });
    const doc = frame.contentDocument!;
    const { store, torch } = setup(doc);
    store.getState().openLightPopover(torch);
    const popover = doc.body.appendChild(doc.createElement('div'));
    popover.className = 'atlas-light-popover';
    const control = popover.appendChild(doc.createElement('button'));
    expect(control instanceof Element).toBe(false);
    control.dispatchEvent(new popout.MouseEvent('pointerdown', { bubbles: true }));
    expect(store.getState().lightPopover).toBe(torch);
    doc.body.dispatchEvent(new popout.MouseEvent('pointerdown', { bubbles: true }));
    expect(store.getState().lightPopover).toBeNull();
    frame.remove();
  });

  it('keeps it for a press inside it, on a light\'s marker or on a ring handle', () => {
    const { store, torch, canvas } = setup();
    store.getState().openLightPopover(torch);
    const popover = document.body.appendChild(document.createElement('div'));
    popover.className = 'atlas-light-popover';
    const control = popover.appendChild(document.createElement('button'));
    pressOn(control);
    pressOn(canvas, 400, 300);
    pressOn(canvas, 400, 20);
    expect(store.getState().lightPopover).toBe(torch);
    popover.remove();
  });
});
