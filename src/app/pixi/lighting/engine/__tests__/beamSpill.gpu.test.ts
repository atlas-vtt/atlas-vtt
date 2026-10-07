import { afterEach, describe, expect, it } from 'vitest';
import { BEAM_SLIDER } from '../../../../lighting/lightBeam';
import { LIGHT_LEVELS } from '../../../../lighting/lightingConstants';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { lightReach } from '../../../../vision/sight';
import { engineLight } from '../../../../vision/lightSources';
import { LightingWorld } from '../LightingWorld';
import type { EngineLight } from '../types';
import type { LightEmission } from '../../../../types/lightingTypes';
import { createTestRenderer, readFloats } from './gpuTestUtils';

const SCALE = { unitDistance: 5, cellSize: 70 };
const emission = { bright: 60, dim: 120, color: '#ffffff', intensity: 1, animation: 'none' as const, sourceRadius: 1 };
/** The bright and dim radii of the built-in lights, in feet, and a short light of 10 and 20 ft. */
const PRESET_RADII = [[0, 10], [5, 10], [10, 20], [15, 45], [20, 40], [20, 60], [30, 30], [40, 40], [30, 60], [60, 60], [60, 120]] as const;
/** Beam widths from the slider's narrowest to nearly all around, in degrees. */
const ANGLES = [BEAM_SLIDER.min, 20, 30, 45, 53, 60, 90, 120, 180, 270, 355];

describe('how much a light lights that the rules do not count', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /**
   * The texels the light map lights to at least half the dim level where the rule counts nothing
   * as lit, as a share of the texels the rule counts: a token standing there is hidden on a
   * floor that looks lit. The light stands in the middle of a map just large enough for it.
   */
  async function uncounted(light: Partial<LightEmission> & { rotation?: number }): Promise<number> {
    const { rotation, ...changes } = light;
    const lit = { ...emission, ...changes };
    const side = Math.ceil(((lit.dim * SCALE.cellSize) / SCALE.unitDistance) * 2.3) + 200;
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, { width: side, height: side });
    cleanup.push(() => world.destroy());
    const drawn = engineLight({ key: 'light', x: side / 2, y: side / 2, ...(rotation !== undefined && { rotation }), emission: lit }, SCALE);
    world.update([], [drawn], null);
    world.flush();
    const texels = readFloats(renderer, world.lightMap.texture);
    const width = world.lightMap.texture.source.pixelWidth;
    const reach = [lightReach({ x: drawn.x, y: drawn.y }, drawn.dim, [], drawn.bright, drawn)];
    let counted = 0;
    let stray = 0;
    for (let o = 0; o < texels.length; o += 4) {
      const point = { x: ((o / 4) % width + 0.5) * world.texel, y: (Math.floor(o / 4 / width) + 0.5) * world.texel };
      if (lightLevelAt(point, { ambient: 0 }, reach) !== 'dark') counted++;
      else if (texels[o]! >= LIGHT_LEVELS.dim / 2) stray++;
    }
    while (cleanup.length) cleanup.pop()!();
    return stray / counted;
  }

  it('is no larger a share for a beam than for a light that shines all around', async () => {
    const allAround = await uncounted({});
    const beam = await uncounted({ rotation: 90, angle: 53 });
    console.info(`uncounted lit area, share of the counted: all around ${(allAround * 100).toFixed(1)} %, bullseye beam ${(beam * 100).toFixed(1)} %`);
    expect(allAround).toBeLessThan(0.12);
    expect(beam).toBeLessThanOrEqual(allAround);
  });

  it('stays under 12 % for every beam the slider makes of every built-in light, the narrowest and shortest too', { timeout: 600_000 }, async () => {
    const shares: { angle: number; bright: number; dim: number; share: number }[] = [];
    for (const [bright, dim] of PRESET_RADII) {
      for (const angle of ANGLES) shares.push({ angle, bright, dim, share: await uncounted({ bright, dim, angle, rotation: 35 }) });
    }
    const worst = [...shares].sort((a, b) => b.share - a.share).slice(0, 6);
    const named = (list: typeof shares): string => list.map(({ angle, bright, dim, share }) => `${angle}° ${bright}/${dim} ft ${(share * 100).toFixed(1)} %`).join(', ');
    console.info(`uncounted lit area of beams, worst: ${named(worst)}`);
    console.info(`uncounted lit area of beams, the review's cases: ${named(shares.filter(({ angle, dim }) => [15, 30, 53].includes(angle) && [20, 40, 120].includes(dim)))}`);
    expect(worst[0]!.share).toBeLessThan(0.12);
  });
});
