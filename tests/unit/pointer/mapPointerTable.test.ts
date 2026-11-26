// @vitest-environment jsdom
import { afterAll, describe, expect, it, vi } from 'vitest';
import { POINTER_TABLE } from './mapPointerCases';
import { isSecondaryPress } from '../../../src/app/pixi/utils/pointerButtons';
import { named, openedMenu, outcomeOf } from './pointerOutcome';
import { AT, PointerWorld } from './pointerWorld';
import { tokenRendererPointer } from './tokenRendererPointer';

vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: vi.fn(),
  closeContextMenuGlobal: vi.fn(),
}));

const world = new PointerWorld();
const driver = tokenRendererPointer(world);
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
