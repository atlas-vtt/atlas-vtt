import { describe, expect, it } from 'vitest';
import { wallRadius } from '../../../../lighting/lightingConstants';
import { CapsuleField } from '../CapsuleField';
import { TileTracer } from '../TileTracer';
import { createTestRenderer, readUnorm } from './gpuTestUtils';

const TEXEL = 2;
const SIZE = 1024;

describe('tile smoothing', () => {
  it('turns the ray steps of an open-space penumbra into a smooth ramp and keeps the umbra black', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, SIZE, SIZE], TEXEL, wallRadius(TEXEL));
    const tracer = new TileTracer(renderer, field);
    try {
      // The wall's top end at (200, 450) casts a wide penumbra across x = 800, 600 px from any wall.
      field.build([[200, 450, 200, 1100]]);
      const tile = tracer.trace([100, 400], 40, [0, 0, SIZE, SIZE], null);
      const texels = readUnorm(renderer, tile);
      const width = tile.source.pixelWidth;
      tile.destroy(true);
      const at = (x: number, y: number): number => texels[(Math.floor(y / TEXEL) * width + Math.floor(x / TEXEL)) * 4]!;
      const profile = Array.from({ length: 300 }, (_, j) => at(800, 400 + j * TEXEL));
      expect(profile[0]).toBeGreaterThan(0.95);
      expect(profile[profile.length - 1]).toBeLessThan(0.05);
      const steps = profile.slice(1).map((v, j) => Math.abs(v - profile[j]!));
      // The ramp spans the inner half of the penumbra only (it fades to nothing on the rule's edge): 0.012 measured.
      expect(Math.max(...steps)).toBeLessThanOrEqual(0.02);
      // Right behind the wall, deep in its shadow.
      for (let x = 206; x < 260; x += TEXEL) expect(at(x, 900)).toBe(0);
    } finally {
      tracer.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  it('keeps light from spreading through a gap too narrow for it to pass', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, SIZE, SIZE], TEXEL, wallRadius(TEXEL));
    const tracer = new TileTracer(renderer, field);
    try {
      // A 7 px gap centred on the texel column x = 501: the capsules close it, yet the texels 3 px
      // above and below it are lit or free, 6 px apart, within the smoothing radius: a blur that
      // ignored the clearance would carry light through.
      field.build([[0, 500, 497.5, 500], [504.5, 500, SIZE, 500]]);
      const tile = tracer.trace([501, 300], 20, [0, 0, SIZE, SIZE], null);
      const texels = readUnorm(renderer, tile);
      const width = tile.source.pixelWidth;
      tile.destroy(true);
      const at = (x: number, y: number): number => texels[(Math.floor(y / TEXEL) * width + Math.floor(x / TEXEL)) * 4]!;
      for (let y = 501; y < 530; y += TEXEL) for (let x = 470; x < 530; x += TEXEL) expect(at(x, y)).toBe(0);
      expect(at(501, 497)).toBeGreaterThan(0.9);
    } finally {
      tracer.destroy();
      field.destroy();
      renderer.destroy();
    }
  });
});
