import { describe, expect, it } from 'vitest';
import { bottomUp, floorAbove, floorBelow, floorStack, floorWaterLevel, isAbove, levelElevation, stackOf, stairEnd, topDown } from '../../../src/app/dungeons/floors/floorStack';
import { THEMES } from '../../../src/app/dungeons/themes/themes';

const down3 = floorStack('down', 3);
const up3 = floorStack('up', 3);

describe('the floor stack', () => {
  it("lays a Cavern's floors downward", () => {
    expect(floorBelow(down3, 0)).toBe(1);
    expect(floorBelow(down3, 2)).toBeNull();
    expect(floorAbove(down3, 0)).toBeNull();
    expect(floorAbove(down3, 2)).toBe(1);
    expect(topDown(down3)).toEqual([0, 1, 2]);
    expect(bottomUp(down3)).toEqual([2, 1, 0]);
    expect(isAbove(down3, 0, 1)).toBe(true);
  });

  it("lays a Fortress's floors upward", () => {
    expect(floorBelow(up3, 0)).toBeNull();
    expect(floorBelow(up3, 2)).toBe(1);
    expect(floorAbove(up3, 0)).toBe(1);
    expect(floorAbove(up3, 2)).toBeNull();
    expect(topDown(up3)).toEqual([2, 1, 0]);
    expect(bottomUp(up3)).toEqual([0, 1, 2]);
    expect(isAbove(up3, 0, 1)).toBe(false);
    expect(isAbove(up3, 2, 1)).toBe(true);
  });

  it('names the stair end on each floor', () => {
    expect(stairEnd(up3, 0, 1)).toBe('lower');
    expect(stairEnd(up3, 1, 0)).toBe('upper');
    expect(stairEnd(down3, 0, 1)).toBe('upper');
    expect(stairEnd(down3, 1, 0)).toBe('lower');
  });

  it("gives elevations in the stack's direction", () => {
    expect(levelElevation(up3, 0, 10)).toEqual({ bottom: 0, top: 10 });
    expect(levelElevation(up3, 2, 10)).toEqual({ bottom: 20, top: 30 });
    expect(levelElevation(down3, 0, 10)).toEqual({ bottom: 0, top: 10 });
    expect(levelElevation(down3, 2, 10)).toEqual({ bottom: -20, top: -10 });
  });

  it('lets water stand on every floor of a Cavern and on the lowest floor of a building only', () => {
    expect([0, 1, 2].map((f) => floorWaterLevel(down3, f, 0.6))).toEqual([0.6, 0.6, 0.6]);
    expect([0, 1, 2].map((f) => floorWaterLevel(up3, f, 0.6))).toEqual([0.6, 0, 0]);
  });

  it('reads a model without a theme as going down', () => {
    const floors = [{}, {}, {}] as never[];
    expect(stackOf({ floors })).toEqual(down3);
    expect(stackOf({ floors, theme: 'cavern' })).toEqual(down3);
    expect(stackOf({ floors, theme: 'fortress' })).toEqual(up3);
    expect(stackOf({ floors, theme: 'mansion' })).toEqual(up3);
  });

  it('reads a theme this version does not know (a newer export) as going down', () => {
    const floors = [{}, {}, {}] as never[];
    expect(stackOf({ floors, theme: 'castle' as never })).toEqual(down3);
    expect(stackOf({ floors, theme: 'toString' as never })).toEqual(down3);
  });

  it('rises for the Fortress and the Haunted Mansion only', () => {
    expect(THEMES.fortress.rise).toBe('up');
    expect(THEMES.mansion.rise).toBe('up');
    expect(THEMES.cavern.rise).toBe('down');
  });
});
