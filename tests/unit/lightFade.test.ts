import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { LIGHT_FADE_MIN, LIGHT_REACH, lightFade } from '../../src/app/lighting/lightingConstants';

/** The bright and dim radius of every light Atlas ships, whatever its unit: the fade knows only their ratio. */
const RADII = [...GENERIC_LIGHT_PRESETS, ...BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => preset.rules.lightPresets ?? [])]
  .map((light) => [light.bright, light.dim] as const);

describe("where a light's picture ends", () => {
  it('is its dim radius: the picture reaches no farther than the rule counts light', () => {
    expect(LIGHT_REACH).toBe(1);
  });

  it('has faded to nothing exactly at the dim radius of every built-in light, and stays there beyond it', () => {
    expect(RADII.length).toBeGreaterThan(20);
    for (const [bright, dim] of RADII) {
      expect(lightFade(bright, dim, dim), `bright ${bright}, dim ${dim}`).toBe(0);
      expect(lightFade(bright, dim, dim * 1.5), `bright ${bright}, dim ${dim}`).toBe(0);
      expect(lightFade(bright, dim, dim * 0.999), `bright ${bright}, dim ${dim}`).toBeGreaterThan(0);
    }
  });

  it('is whole up to where the fade begins and only falls from there', () => {
    for (const [bright, dim] of RADII) {
      const from = Math.min(bright, dim * (1 - LIGHT_FADE_MIN));
      expect(lightFade(bright, dim, 0)).toBe(1);
      expect(lightFade(bright, dim, from)).toBe(1);
      const shares = Array.from({ length: 21 }, (_, step) => lightFade(bright, dim, from + ((dim - from) * step) / 20));
      for (let step = 1; step < shares.length; step++) expect(shares[step]!).toBeLessThan(shares[step - 1]!);
    }
  });

  it('fades a light that is bright to its end over the last share of its dim radius', () => {
    expect(lightFade(40, 40, 40 * (1 - LIGHT_FADE_MIN))).toBe(1);
    expect(lightFade(40, 40, 39)).toBeLessThan(1);
    expect(lightFade(40, 40, 39)).toBeGreaterThan(0);
  });
});
