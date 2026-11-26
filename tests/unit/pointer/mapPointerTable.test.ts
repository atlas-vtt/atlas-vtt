// @vitest-environment jsdom
import { afterAll, describe, expect, it } from 'vitest';
import { POINTER_TABLE } from './mapPointerCases';
import { isSecondaryPress, setCtrlClickIsSecondary } from '../../../src/app/pixi/utils/pointerButtons';
import type { MapPointerHost } from '../../../src/app/pixi/pointer/MapPointer';
import { named, openedMenu, outcomeOf } from './pointerOutcome';
import { AT, CLIENT, PointerWorld } from './pointerWorld';
import { boundPointer, mapPointerDriver } from './mapPointerDriver';

const world = new PointerWorld();
const driver = mapPointerDriver(world);
afterAll(() => driver.destroy());

describe('which layer of the map takes the pointer', () => {
  it.each(POINTER_TABLE.map((row) => [row.name, row] as const))('%s', (_name, row) => {
    expect(named(outcomeOf(driver, world, row.case), row.expect)).toEqual(row.expect);
  });
});

const secondary = POINTER_TABLE.filter(({ case: c }) => isSecondaryPress({ button: c.button ?? 0, ctrlKey: c.ctrl ?? false }, c.mac ?? false));

describe('a secondary click and the question what it would open', () => {
  it.each(secondary.map((row) => [row.name, row] as const))('agree: %s', (_name, row) => {
    const outcome = outcomeOf(driver, world, row.case);
    expect(outcome.menuAt).toBe(openedMenu(outcome));
  });
});

describe('the gestures the active tool hears besides presses', () => {
  const routed = (tool: string, gesture: 'release' | 'cancel' | 'doubleClick'): string[] => {
    world.reset({ tool });
    driver.arrange(world);
    if (gesture === 'release') driver.release(world.event('up'));
    else if (gesture === 'cancel') driver.cancel(world.event('up'));
    else driver.doubleClick();
    return world.take();
  };

  it('hands the lighting tool its release, a lost pointer and a double click', () => {
    expect([routed('wall', 'release'), routed('wall', 'cancel'), routed('wall', 'doubleClick')]).toEqual([['wall:up'], ['wall:cancel'], ['wall:dblclick']]);
  });

  it('hands the stairs tool its release and a double click', () => {
    expect([routed('stairs', 'release'), routed('stairs', 'cancel'), routed('stairs', 'doubleClick')]).toEqual([['stairs:up'], [], ['stairs:dblclick']]);
  });

  it('hands the select tool none of them', () => {
    expect([routed('select', 'release'), routed('select', 'cancel'), routed('select', 'doubleClick')]).toEqual([[], [], []]);
  });

  it('drops a right press\'s menu when the pointer is lost before the release', () => {
    world.reset({ tool: 'select', button: 2, hits: ['hexLink'] });
    driver.arrange(world);
    driver.press(world.event('down'));
    driver.cancel(world.event('up'));
    driver.release(world.event('up'));
    expect(world.take()).toEqual([]);
  });

  it('opens no menu when a right press is dragged away before its release', () => {
    world.reset({ tool: 'select', button: 2, hits: ['hexLink'] });
    driver.arrange(world);
    driver.press(world.event('down'));
    driver.release(world.event('up', { x: AT.x + 40, y: AT.y }));
    expect(world.take()).toEqual([]);
  });

  it('leaves every hover when the pointer leaves the canvas', () => {
    world.reset({ tool: 'select', hits: ['token', 'pin'] });
    driver.arrange(world);
    driver.move(world.event('move'));
    world.reset({ tool: 'select', hits: ['token'] });
    driver.move(world.event('move'));
    const hovered = [...world.hovered];
    driver.leave();
    expect({ hovered, left: [...world.hovered] }).toEqual({ hovered: ['token', 'tokenUi'], left: [] });
  });
});

describe('where a menu opens', () => {
  const host = (tool: string): MapPointerHost => ({
    store: { getState: () => ({ activeTool: tool as never, selectedIds: [], clearSelection: () => undefined }) },
    gmView: () => true,
    placing: () => false,
  });
  /** Each menu that opens at a point of the window, the tool it is offered with, and how it is attached. */
  const MENUS: Array<[string, string, (bound: ReturnType<typeof boundPointer>, open: (sx: number, sy: number) => void) => void]> = [
    ['a door badge\'s', 'select', ({ pointer }, open) => pointer.attach('doors', { click: () => false, pressActsAt: () => false, menuHitTest: () => 'door-1', openMenu: (_id, sx, sy) => open(sx, sy) })],
    ['the lighting tool\'s', 'wall', ({ pointer }, open) => pointer.attach('walls', {
      pointerDown: () => false, pointerMove: () => undefined, pointerUp: () => undefined, pointerCancel: () => undefined, doubleClick: () => undefined,
      menuAt: () => true, openMenu: (_x, _y, sx, sy) => open(sx, sy), cursorAt: () => 'crosshair',
    })],
    ['a map feature\'s', 'select', ({ pointer }, open) => pointer.attach('mapFeatures', { hover: () => undefined, leave: () => undefined, hitTest: () => 'feature-1', openContextMenu: (_id, sx, sy) => open(sx, sy) })],
    ['the fog\'s', 'move', ({ pointer }, open) => pointer.attach('fog', { menuAt: () => true, openMenu: (_x, _y, sx, sy) => open(sx, sy) })],
  ];

  it.each(MENUS)('opens %s menu where the right press was released in the window, and a Ctrl+click\'s at once where it was pressed', (_menu, tool, attach) => {
    const bound = boundPointer(host(tool));
    const opened: Array<[number, number]> = [];
    attach(bound, (sx, sy) => opened.push([sx, sy]));
    world.reset({ tool, button: 2 });
    bound.viewport.emit('pointerdown', world.event('down'));
    bound.viewport.emit('pointerup', world.event('up', { x: AT.x + 2, y: AT.y + 1 }));
    const restore = setCtrlClickIsSecondary(true);
    world.reset({ tool, mac: true, ctrl: true });
    bound.viewport.emit('pointerdown', world.event('down'));
    restore();
    bound.stop();
    expect(opened).toEqual([[CLIENT.x + 2, CLIENT.y + 1], [CLIENT.x, CLIENT.y]]);
  });

  it('stops listening to the viewport and the canvas when it is stopped', () => {
    const bound = boundPointer(host('select'));
    const before = ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside', 'pointercancel'].map((type) => bound.viewport.listenerCount(type));
    bound.stop();
    expect({ before, after: ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside', 'pointercancel'].map((type) => bound.viewport.listenerCount(type)) })
      .toEqual({ before: [1, 1, 1, 1, 1], after: [0, 0, 0, 0, 0] });
  });
});
