import { describe, expect, it } from 'vitest';
import { MEASURE_EFFECTS, MEASURE_EFFECT_STARTS, readMeasureEffect } from '../measureEffects';

describe('the looks an area can take', () => {
  it('starts every effect in a colour a measurement can store', () => {
    for (const effect of MEASURE_EFFECTS) expect(MEASURE_EFFECT_STARTS[effect].color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('starts fire and lightning with a flickering light, radiance with a steady one, and only shadow as a darkness', () => {
    const lights = Object.fromEntries(MEASURE_EFFECTS.map((effect) => [effect, MEASURE_EFFECT_STARTS[effect].light]));
    expect(lights).toEqual({ fire: 'flicker', frost: null, lightning: 'flicker', mist: null, radiance: 'steady', shadow: null });
    expect(MEASURE_EFFECTS.filter((effect) => MEASURE_EFFECT_STARTS[effect].darkness)).toEqual(['shadow']);
  });

  it('reads a known effect and nothing else from a file', () => {
    for (const effect of MEASURE_EFFECTS) expect(readMeasureEffect(effect)).toBe(effect);
    for (const value of ['Fire', 'water', '', 3, null, undefined, {}, ['fire'], 'constructor']) expect(readMeasureEffect(value)).toBeUndefined();
  });
});
