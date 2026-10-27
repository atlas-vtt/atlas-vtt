import { describe, expect, it } from 'vitest';
import { liquidDrifts, liquidFrameDue, loopTime, MOTION_LOOP, PATTERN_TILE } from '../../../src/app/pixi/liquids/liquidMotion';
import { boxInView } from '../../../src/app/pixi/liquids/viewLiquids';

describe('how liquids move over time', () => {
  it('hands the shader a clock and drifts that stay small however long a map plays', () => {
    const days = 3 * 24 * 3600 + 0.25;
    expect(loopTime(days)).toBeLessThan(MOTION_LOOP);
    for (const kind of ['water', 'lava', 'acid'] as const) {
      for (const flowing of [true, false]) {
        for (const drift of liquidDrifts(kind, flowing, days)) {
          expect(drift).toBeGreaterThanOrEqual(0);
          expect(drift).toBeLessThan(PATTERN_TILE);
        }
      }
    }
  });

  it('moves smoothly across a wrap: a step just after it is the same small step as anywhere else', () => {
    // Patterns repeat every tile, so a drift differs from the unwrapped one by whole tiles only.
    for (const seconds of [10, MOTION_LOOP * 7 - 0.01, 1e7]) {
      const before = liquidDrifts('water', true, seconds);
      const after = liquidDrifts('water', true, seconds + 1 / 30);
      before.forEach((value, index) => {
        const step = (((after[index]! - value) % PATTERN_TILE) + PATTERN_TILE * 1.5) % PATTERN_TILE - PATTERN_TILE / 2;
        expect(Math.abs(step)).toBeLessThan(0.05);
      });
    }
  });

  it('shows at most 30 frames a second, on the slots of the map\'s animation clock', () => {
    expect(liquidFrameDue(0, null)).toBe(true);
    expect(liquidFrameDue(16.7, 0)).toBe(false);
    expect(liquidFrameDue(33.4, 0)).toBe(true);
    // A frame shown late in a slot leaves the next one due at the slot's end, not a whole frame later.
    expect(liquidFrameDue(34, 30)).toBe(true);
    // Fewer frames a second take every so many slots.
    expect(liquidFrameDue(40, 0, 15)).toBe(false);
    expect(liquidFrameDue(67, 0, 15)).toBe(true);
  });

  it('counts a surface in view when it lies within half the view\'s size around it', () => {
    const view = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(boxInView(view, { minX: 120, minY: 10, maxX: 140, maxY: 20 })).toBe(true);
    expect(boxInView(view, { minX: 160, minY: 10, maxX: 200, maxY: 20 })).toBe(false);
  });
});
