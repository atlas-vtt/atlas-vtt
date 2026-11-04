// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { ResourceWheels } from '../../../src/app/pixi/token-renderer/resources/ResourceWheels';
import { WHEEL_SIZE } from '../../../src/app/pixi/token-renderer/resources/wheelGeometry';
import { HP_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

const AMMO = { ...HP_RESOURCE, key: 'ammo', name: 'Ammo', color: '#f59e0b', defeatedWhenSpent: false };
const LUCK = { ...HP_RESOURCE, key: 'luck', name: 'Luck', color: '#3898ec', defeatedWhenSpent: false };
const MANA = { ...HP_RESOURCE, key: 'mana', name: 'Mana', color: '#8b5cf6', defeatedWhenSpent: false };
const GRIT = { ...HP_RESOURCE, key: 'grit', name: 'Grit', color: '#84cc16', defeatedWhenSpent: false };
const texts = (node: Container): Text[] => node.children.flatMap((child) => (child instanceof Text ? [child] : texts(child as Container)));

describe('ResourceWheels', () => {
  let restoreGraphics: () => void;
  beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
  afterEach(() => restoreGraphics());

  it('stacks slot 3 above slot 4 in a column centred on their anchor, whatever its scale', () => {
    const wheels = new ResourceWheels();
    wheels.update([{ definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }, { definition: LUCK, value: { current: 2, max: 5 }, slot: 3 }]);
    const [upper, lower] = wheels.layout();
    expect([upper!.key, upper!.kind, lower!.key]).toEqual(['ammo', 'wheel', 'luck']);
    // `wheelAnchor` puts the anchor midway along the token and its bars; the column is centred there
    expect(upper!.top + lower!.top + lower!.height).toBeCloseTo(0);
    expect(upper!.top + upper!.height).toBeLessThan(lower!.top);
    expect(upper!.left).toBe(lower!.left);
    expect(upper!.width).toBe(WHEEL_SIZE);
    wheels.destroy();
  });

  it('puts slots 5 and 6 on the token\'s other side, as a mirror of slots 3 and 4', () => {
    const wheels = new ResourceWheels();
    wheels.update([
      { definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }, { definition: LUCK, value: { current: 2, max: 5 }, slot: 3 },
      { definition: MANA, value: { current: 3, max: 9 }, slot: 4 }, { definition: GRIT, value: { current: 1, max: 2 }, slot: 5 },
    ]);
    const [upperRight, lowerRight, upperLeft, lowerLeft] = wheels.layout();
    expect([upperRight!.kind, lowerRight!.kind, upperLeft!.kind, lowerLeft!.kind]).toEqual(['wheel', 'wheel', 'wheel-left', 'wheel-left']);
    // Each anchor has the token on its inner side: the left wheels lie as far left of theirs as the right ones right of theirs
    expect(upperLeft!.left + upperLeft!.width).toBeCloseTo(-upperRight!.left);
    expect([upperLeft!.top, lowerLeft!.top]).toEqual([upperRight!.top, lowerRight!.top]);
    expect(texts(wheels.right).map((text) => text.text)).toEqual(['4', '2']);
    expect(texts(wheels.left).map((text) => text.text)).toEqual(['3', '1']);

    // A resource moved to the other side by reordering takes its wheel along
    wheels.update([{ definition: MANA, value: { current: 3, max: 9 }, slot: 2 }]);
    expect(texts(wheels.right).map((text) => text.text)).toEqual(['3']);
    expect(texts(wheels.left)).toEqual([]);
    wheels.destroy();
  });

  it('keeps a lone slot-4 wheel in its own place', () => {
    const pair = new ResourceWheels();
    pair.update([{ definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }, { definition: LUCK, value: { current: 2, max: 5 }, slot: 3 }]);
    const wheels = new ResourceWheels();
    wheels.update([{ definition: LUCK, value: { current: 2, max: 5 }, slot: 3 }]);
    expect(wheels.layout()).toEqual([pair.layout()[1]]);
    wheels.update([]);
    expect(wheels.layout()).toEqual([]);
    wheels.destroy();
    pair.destroy();
  });

  it('shows the current value and stays hidden until revealed', () => {
    const wheels = new ResourceWheels();
    wheels.update([{ definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }]);
    expect(texts(wheels.right).map((text) => text.text)).toEqual(['4']);
    expect([wheels.right.visible, wheels.left.visible]).toEqual([false, false]);
    wheels.setAlpha(0.5);
    expect([wheels.right.visible, wheels.right.alpha, wheels.left.visible, wheels.left.alpha]).toEqual([true, 0.5, true, 0.5]);
    wheels.destroy();
  });

  it('shrinks the number so long values stay inside the disc', () => {
    const wheels = new ResourceWheels();
    wheels.update([{ definition: AMMO, value: { current: 4, max: 6 }, slot: 2 }]);
    const short = texts(wheels.right)[0]!.scale.x;
    wheels.update([{ definition: AMMO, value: { current: 250, max: 250 }, slot: 2 }]);
    expect(texts(wheels.right)[0]!.scale.x).toBeLessThan(short);
    wheels.destroy();
  });
});
