import { describe, expect, it } from 'vitest';
import { bottomUp, floorAbove, floorBelow, floorStack, floorWaterLevel, isAbove, levelElevation, levelOf, stackOf, stairEnd, topDown } from '../../../../src/app/dungeons/floors/floorStack';

/** A house of a cellar, a ground floor and two storeys: the cellar is the last index, under the entrance floor. */
const house = floorStack('up', 4, 1);

describe('a stack with a cellar', () => {
  it('lays its storeys upward and its cellar under the entrance floor', () => {
    expect([0, 1, 2, 3].map((f) => levelOf(house, f))).toEqual([0, 1, 2, -1]);
    expect(floorBelow(house, 0)).toBe(3);
    expect(floorAbove(house, 3)).toBe(0);
    expect(floorBelow(house, 3)).toBeNull();
    expect(floorAbove(house, 2)).toBeNull();
    expect(floorBelow(house, 1)).toBe(0);
    expect(topDown(house)).toEqual([2, 1, 0, 3]);
    expect(bottomUp(house)).toEqual([3, 0, 1, 2]);
  });

  it('answers ends, heights and water by where each floor lies', () => {
    expect(isAbove(house, 0, 3)).toBe(true);
    expect(isAbove(house, 3, 1)).toBe(false);
    expect(stairEnd(house, 3, 0)).toBe('lower');
    expect(stairEnd(house, 0, 3)).toBe('upper');
    expect(levelElevation(house, 3, 10)).toEqual({ bottom: -10, top: 0 });
    expect(levelElevation(house, 2, 10)).toEqual({ bottom: 20, top: 30 });
    expect([0, 1, 2, 3].map((f) => floorWaterLevel(house, f, 0.5))).toEqual([0, 0, 0, 0.5]);
  });

  it('reads the floors under the entrance floor from the model', () => {
    const floors = [{}, {}, {}, {}] as never[];
    expect(stackOf({ floors, theme: 'mansion', below: 1 })).toEqual(house);
    expect(stackOf({ floors, theme: 'mansion' })).toEqual(floorStack('up', 4));
  });

  it('answers as before without one', () => {
    for (const stack of [floorStack('up', 3), floorStack('down', 3)]) {
      expect(floorStack(stack.rise, 3, 0)).toEqual(stack);
      expect([0, 1, 2].map((f) => levelOf(stack, f))).toEqual(stack.rise === 'up' ? [0, 1, 2] : [0, -1, -2]);
    }
  });
});
