// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Graphics, Text } from 'pixi.js';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { BAR_LOOK } from '../../../src/app/pixi/token-renderer/resources/ResourceBarView';
import { ResourceWheelView } from '../../../src/app/pixi/token-renderer/resources/ResourceWheelView';
import { WHEEL_SIZE } from '../../../src/app/pixi/token-renderer/resources/wheelGeometry';
import { RESOURCE_NUMBER_STYLE } from '../../../src/app/pixi/ResourceBarLabel';
import { AMMO, ARMOR } from '../../mocks/resourceFixtures';

interface Drawn { action: string; color: number; width?: number; shapes: string[]; radius?: number }

/** What the wheel drew: each fill and stroke with its colour and the shapes of its path. */
function drawn(wheel: ResourceWheelView): Drawn[] {
  const ring = wheel.view.children[0] as Graphics;
  return ring.context.instructions.map((instruction) => {
    const { style, path } = instruction.data as { style: { color: number; width?: number }; path: { instructions: Array<{ action: string; data: number[] }> } };
    const circle = path.instructions.find(({ action }) => action === 'circle');
    return { action: instruction.action, color: style.color, width: style.width, shapes: path.instructions.map(({ action }) => action), radius: circle?.data[2] };
  });
}
const AMMO_COLOR = Number.parseInt(AMMO.color.slice(1), 16);
const wheelFor = (current: number, max: number): ResourceWheelView => {
  const wheel = new ResourceWheelView();
  wheel.update({ definition: AMMO, value: { current, max }, slot: 2 }, 0, 0);
  return wheel;
};

describe('ResourceWheelView', () => {
  let restoreGraphics: () => void;
  beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
  afterEach(() => restoreGraphics());

  it('has the bars\' look: their thin border, their dark track and a flat fill in the resource\'s colour', () => {
    const shapes = drawn(wheelFor(3, 12));
    expect(shapes.some(({ action, color }) => action === 'stroke' && color === BAR_LOOK.borderColor)).toBe(true);
    expect(shapes.some(({ action, color }) => action === 'fill' && color === BAR_LOOK.trackColor)).toBe(true);
    expect(shapes.filter(({ color }) => color === AMMO_COLOR)).toHaveLength(1);
  });

  it('closes the ring when it is full: a circle, not an arc that ends where it began', () => {
    const [lit] = drawn(wheelFor(1, 1)).filter(({ color }) => color === AMMO_COLOR);
    expect(lit!.shapes).toContain('circle');
    expect(lit!.shapes).not.toContain('arc');
    const [partly] = drawn(wheelFor(3, 12)).filter(({ color }) => color === AMMO_COLOR);
    expect(partly!.shapes).toContain('arc');
  });

  it('draws no fill when the resource is spent', () => {
    expect(drawn(wheelFor(0, 12)).filter(({ color }) => color === AMMO_COLOR)).toEqual([]);
  });

  it('is drawn many times larger and scaled down, so its curves stay smooth at any zoom', () => {
    const wheel = wheelFor(3, 12);
    const ring = wheel.view.children[0] as Graphics;
    expect(ring.scale.x).toBeLessThanOrEqual(1 / 8);
    const outer = Math.max(...drawn(wheel).map(({ radius }) => radius ?? 0));
    expect(outer * ring.scale.x).toBeCloseTo(WHEEL_SIZE / 2);
  });

  it('writes its number as the bars write theirs', () => {
    const text = wheelFor(3, 12).view.children[1] as Text;
    expect(text.text).toBe('3');
    expect(text.style.fontSize).toBe(RESOURCE_NUMBER_STYLE.fontSize);
    expect(text.style.fontWeight).toBe(RESOURCE_NUMBER_STYLE.fontWeight);
  });

  it('shows a static value as a whole ring around its number, undivided', () => {
    const wheel = new ResourceWheelView();
    wheel.update({ definition: ARMOR, value: { current: 0, max: 5 }, slot: 2 }, 0, 0);
    const color = Number.parseInt(ARMOR.color.slice(1), 16);
    const [ring] = drawn(wheel).filter((shape) => shape.color === color);
    expect(ring!.shapes).toContain('circle');
    // No ticks: five is a number here, not five points to spend
    expect(drawn(wheel).filter(({ action, color: c, shapes }) => action === 'stroke' && c === BAR_LOOK.trackColor && shapes.includes('lineTo'))).toEqual([]);
    expect((wheel.view.children[1] as Text).text).toBe('5');
  });

  it('shows a static value of 0 as a whole ring around a 0', () => {
    const wheel = new ResourceWheelView();
    wheel.update({ definition: ARMOR, value: { current: 0, max: 0 }, slot: 2 }, 0, 0);
    const color = Number.parseInt(ARMOR.color.slice(1), 16);
    expect(drawn(wheel).find((shape) => shape.color === color)?.shapes).toContain('circle');
    expect((wheel.view.children[1] as Text).text).toBe('0');
  });
});
