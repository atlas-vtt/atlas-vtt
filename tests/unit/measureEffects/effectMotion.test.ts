import { describe, expect, it } from 'vitest';
import { MEASURE_EFFECTS } from '../../../src/app/measure/measureEffects';
import { PATTERN_TILE } from '../../../src/app/pixi/liquids/liquidMotion';
import { EffectClock, effectDrifts } from '../../../src/app/pixi/measure/effects/effectMotion';

describe('how area effects move over time', () => {
  it('hands the shader drifts that stay small however long a map plays', () => {
    const days = 3 * 24 * 3600 + 0.25;
    for (const effect of MEASURE_EFFECTS) {
      for (const drift of effectDrifts(effect, days)) {
        expect(drift).toBeGreaterThanOrEqual(0);
        expect(drift).toBeLessThan(PATTERN_TILE);
      }
    }
  });

  it('moves across a wrap by the same small step as anywhere else', () => {
    for (const effect of MEASURE_EFFECTS) {
      for (const seconds of [10, PATTERN_TILE / 0.32 - 0.01, 1e7]) {
        const before = effectDrifts(effect, seconds);
        const after = effectDrifts(effect, seconds + 1 / 30);
        before.forEach((value, index) => {
          const step = (((after[index]! - value) % PATTERN_TILE) + PATTERN_TILE * 1.5) % PATTERN_TILE - PATTERN_TILE / 2;
          expect(Math.abs(step)).toBeLessThan(0.05);
        });
      }
    }
  });

  it('writes into the array it is given', () => {
    const into = new Float32Array(8);
    expect(effectDrifts('fire', 5, into)).toBe(into);
    expect(Array.from(into).some((value) => value !== 0)).toBe(true);
  });
});

describe('the clock effects play by', () => {
  it('shows a first frame at once and then one in every slot of its rate', () => {
    const clock = new EffectClock();
    expect(clock.tick(1005, 30)).toBe(true);
    expect(clock.tick(1021, 30)).toBe(false);
    expect(clock.tick(1038, 30)).toBe(true);
    // Fifteen a second: every second slot of the map's animation clock.
    const slow = new EffectClock();
    const due = [5, 22, 38, 55, 72, 88, 105, 122, 138].map((now) => slow.tick(now, 15));
    expect(due).toEqual([true, false, false, false, true, false, false, false, true]);
  });

  it('counts the time between ticks, a stalled window by a tenth of a second at most', () => {
    const clock = new EffectClock();
    clock.tick(0, 30);
    clock.tick(50, 30);
    expect(clock.seconds).toBeCloseTo(0.05, 9);
    clock.tick(5050, 30);
    expect(clock.seconds).toBeCloseTo(0.15, 9);
    clock.tick(5000, 30);
    expect(clock.seconds).toBeCloseTo(0.15, 9);
  });

  it('goes on from the moment it was held at', () => {
    const clock = new EffectClock();
    clock.tick(0, 30);
    clock.tick(40, 30);
    clock.hold();
    // A minute out of view.
    expect(clock.tick(60_040, 30)).toBe(true);
    expect(clock.seconds).toBeCloseTo(0.04, 9);
    clock.tick(60_080, 30);
    expect(clock.seconds).toBeCloseTo(0.08, 9);
  });

  it('keeps time but shows no frame at a rate of none', () => {
    const clock = new EffectClock();
    expect(clock.tick(0, 0)).toBe(false);
    expect(clock.tick(100, 0)).toBe(false);
    expect(clock.seconds).toBeCloseTo(0.1, 9);
    expect(clock.tick(134, 30)).toBe(true);
  });
});
