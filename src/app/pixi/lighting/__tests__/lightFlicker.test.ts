import { describe, expect, it } from 'vitest';
import { LightFlicker, type FlickerSample } from '../lightFlicker';
import type { LightAnimation } from '../../../types/lightingTypes';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function samples(flicker: LightFlicker, animation: LightAnimation, count = 10_000): FlickerSample[] {
  return Array.from({ length: count }, (_, i) => flicker.sample('light', animation, i * 16));
}

const RANGES: Record<Exclude<LightAnimation, 'none'>, { intensity: [number, number]; radius: [number, number] }> = {
  torch: { intensity: [0.85, 1.1], radius: [0.97, 1.03] },
  candle: { intensity: [0.8, 1.05], radius: [0.98, 1.02] },
  pulse: { intensity: [0.85, 1.15], radius: [1, 1] },
  magic: { intensity: [0.85, 1.15], radius: [0.96, 1.04] },
  smoulder: { intensity: [0.91, 1.09], radius: [0.97, 1.03] },
};

describe('LightFlicker', () => {
  it('leaves steady lights untouched', () => {
    expect(new LightFlicker(seeded(1)).sample('a', 'none', 500)).toEqual({ intensity: 1, radiusScale: 1 });
  });

  it('is deterministic for the same random source', () => {
    expect(samples(new LightFlicker(seeded(7)), 'torch', 200)).toEqual(samples(new LightFlicker(seeded(7)), 'torch', 200));
  });

  it.each(Object.entries(RANGES))('keeps %s within its ranges', (animation, range) => {
    for (const s of samples(new LightFlicker(seeded(3)), animation as LightAnimation)) {
      expect(s.intensity).toBeGreaterThanOrEqual(range.intensity[0] - 1e-9);
      expect(s.intensity).toBeLessThanOrEqual(range.intensity[1] + 1e-9);
      expect(s.radiusScale).toBeGreaterThanOrEqual(range.radius[0] - 1e-9);
      expect(s.radiusScale).toBeLessThanOrEqual(range.radius[1] + 1e-9);
    }
  });

  it('actually flickers', () => {
    const values = new Set(samples(new LightFlicker(seeded(5)), 'torch', 100).map((s) => s.intensity.toFixed(4)));
    expect(values.size).toBeGreaterThan(20);
  });

  it('lets a smouldering surface swell slowly, each light from its own point of the swell', () => {
    const flicker = new LightFlicker(seeded(1));
    const swell = (id: string, at: number): number => flicker.sample(id, 'smoulder', at).intensity;
    // Slow: a tenth of a second moves it by little more than a hundredth.
    for (let t = 0; t < 20_000; t += 100) expect(Math.abs(swell('lava', t + 100) - swell('lava', t))).toBeLessThan(0.015);
    const range = samples(flicker, 'smoulder').map((s) => s.intensity);
    expect(Math.max(...range) - Math.min(...range)).toBeGreaterThan(0.1);
    expect(swell('lava-a', 0)).not.toBeCloseTo(swell('lava-b', 0), 3);
  });

  it('keeps an animation it does not know steady', () => {
    expect(new LightFlicker(seeded(1)).sample('a', 'aurora' as LightAnimation, 500)).toEqual({ intensity: 1, radiusScale: 1 });
  });

  it('keeps separate state per instance', () => {
    const a = new LightFlicker(seeded(9));
    const b = new LightFlicker(seeded(9));
    samples(a, 'torch', 50);
    expect(b.sample('light', 'torch', 0)).toEqual(new LightFlicker(seeded(9)).sample('light', 'torch', 0));
  });
});
