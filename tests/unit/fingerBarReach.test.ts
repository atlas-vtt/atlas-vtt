import { describe, expect, it } from 'vitest';
import { ResourceBarHitArea } from '../../src/app/pixi/ResourceBarHitArea';
import type { ResourceSlot } from '../../src/app/pixi/token-renderer/resources/ResourceStack';
import { FINGER_STEPPER_SIZE, fingerBarReach, stepperLayout } from '../../src/app/pixi/token-renderer/resources/stepperLayout';

/** Bars as the stack lays them out: 64 wide, 10 tall, 2 apart, the first 2 below the token's edge. */
const bar = (key: string, index: number): ResourceSlot => ({ key, kind: 'bar', left: -32, top: 2 + index * 12, width: 64, height: 10 });
const wheel: ResourceSlot = { key: 'ki', kind: 'wheel', left: 40, top: -20, width: 14, height: 14 };

describe('the band a finger presses a resource bar in', () => {
  it('is a finger\'s height for a bar alone, from the token\'s edge down', () => {
    const hp = bar('hp', 0);
    expect(fingerBarReach(hp, [hp])).toEqual({ top: 0, bottom: FINGER_STEPPER_SIZE });
  });

  it('shares the gap between bars that lie one under the other, so no band meets another, and the last reaches a finger\'s height', () => {
    const bars = [bar('hp', 0), bar('stress', 1), bar('ammo', 2)];
    const reaches = bars.map((slot) => fingerBarReach(slot, [...bars, wheel]));
    expect(reaches[0]).toEqual({ top: 0, bottom: 13 });
    expect(reaches[1]).toEqual({ top: 13, bottom: 25 });
    expect(reaches[2]).toEqual({ top: 25, bottom: 25 + FINGER_STEPPER_SIZE });
    // Every band holds its own bar whole.
    bars.forEach((slot, index) => {
      expect(reaches[index]!.top).toBeLessThanOrEqual(slot.top);
      expect(reaches[index]!.bottom).toBeGreaterThanOrEqual(slot.top + slot.height);
    });
  });

  it('never reaches a +/- button: the buttons stand past the bar\'s ends, the band between them', () => {
    const bars = [bar('hp', 0), bar('stress', 1)];
    bars.forEach((slot, column) => {
      const { size, minusX, plusX } = stepperLayout(slot, column, true);
      expect(minusX + size / 2).toBeLessThanOrEqual(slot.left);
      expect(plusX - size / 2).toBeGreaterThanOrEqual(slot.left + slot.width);
    });
  });
});

describe('a resource bar\'s overlay', () => {
  it('takes a finger\'s press in its band, between the bar\'s ends', () => {
    const hp = bar('hp', 0);
    const overlay = new ResourceBarHitArea(0xff0000);
    overlay.layout(hp, fingerBarReach(hp, [hp, bar('stress', 1)]));
    const takes = (x: number, y: number): boolean => overlay.hitArea?.contains(x, y) === true;
    expect(takes(0, 7)).toBe(true);
    // Above the bar to the token's edge, below it to halfway to the next bar.
    expect(takes(0, 0.5)).toBe(true);
    expect(takes(0, 12.9)).toBe(true);
    expect(takes(0, 13.5)).toBe(false);
    expect(takes(0, -1)).toBe(false);
    // Past its ends stand its buttons.
    expect(takes(-33, 7)).toBe(false);
    expect(takes(33, 7)).toBe(false);
    overlay.destroy();
  });

  it('is pressed where it is drawn by a mouse: it has no band', () => {
    const overlay = new ResourceBarHitArea(0xff0000);
    overlay.layout(bar('hp', 0));
    expect(overlay.hitArea).toBeNull();
    overlay.layout(bar('hp', 0), { top: 0, bottom: 20 });
    expect(overlay.hitArea).not.toBeNull();
    overlay.layout(bar('hp', 0));
    expect(overlay.hitArea).toBeNull();
    overlay.destroy();
  });
});
