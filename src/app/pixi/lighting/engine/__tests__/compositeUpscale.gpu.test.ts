/// <reference types="vite/client" />
import { RenderTexture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import { reducedPixelRatio } from '../compositeUpscale';
import type { EngineLight, EngineScene } from '../types';
import { sealWalls } from '../../../../lighting/sealWalls';
import { sealTolerance, worldTexel } from '../../../../lighting/lightingConstants';
import { LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import { createTestRenderer } from './gpuTestUtils';
import { fuzzRooms, rng } from './fuzzRooms';
import { renderView } from './leakFuzzScene';

const SIZE = 256;
const BOUNDS = { width: 2048, height: 2048 };
const FULL: LightingQuality = LIGHTING_QUALITY.high;
const REDUCED: LightingQuality = { ...LIGHTING_QUALITY.high, compositePixelRatio: 1 };

interface Compared {
  pixels: number;
  /**
   * Pixels that show something (more than the last bit of a light's fade) where the full
   * composite shows nothing on them and on the pixels around them. A dark line or speck narrower
   * than the reduced composite's pixel inside a lit area may vanish; what lies beyond an edge may not show.
   */
  grown: number;
  /** Pixels that differ at all, and the mean difference per channel. */
  /** Pixels that vanish: black in the full composite, which shows something around them. */
  specks: number;
  differing: number;
  meanDiff: number;
}

/** Whether the pixel at byte `o` and the eight around it are black. */
function darkAround(pixels: Uint8ClampedArray, o: number): boolean {
  const row = SIZE * 2 * 4;
  for (const dy of [-row, 0, row]) {
    for (const dx of [-4, 0, 4]) {
      const at = o + dy + dx;
      if (at >= 0 && at < pixels.length && pixels[at]! + pixels[at + 1]! + pixels[at + 2]! > 0) return false;
    }
  }
  return true;
}

/**
 * Each room drawn at renderer resolution 2 by the full composite and by one worked out at a
 * pixel ratio of 1 (the same world, so only the composite's pixels differ), in the players' view:
 * lit by its lights with everything seen, and seen by a token in daylight.
 */
async function compare(seed: number, trials: number): Promise<Compared> {
  const renderer: WebGLRenderer = await createTestRenderer(SIZE, 2);
  const engines = [new LightingEngine(renderer, FULL), new LightingEngine(renderer, REDUCED)] as const;
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution: 2 });
  const out: Compared = { pixels: 0, grown: 0, specks: 0, differing: 0, meanDiff: 0 };
  let diffSum = 0;
  try {
    for (const engine of engines) {
      engine.setEnabled(true);
      engine.setMode('player');
    }
    const rand = rng(seed);
    for (const room of fuzzRooms(seed, trials)) {
      const walls = sealWalls(room.walls, sealTolerance(worldTexel(BOUNDS)));
      const lights: EngineLight[] = room.lights.map(([x, y], i) => ({ key: `l${i}`, x, y, bright: 120, dim: 300, flame: 10, color: [1, 0.9, 0.7], intensity: 1, animation: 'none' }));
      const [first] = room.lights;
      const scale = 0.3 + rand() * 1.5;
      const x = SIZE / 2 - first![0] * scale;
      const y = SIZE / 2 - first![1] * scale;
      const sources = lights.map((light) => ({ tokenId: light.key, origin: { x: light.x, y: light.y }, range: 4000, senses: [] }));
      const scenes: EngineScene[] = [
        { bounds: BOUNDS, albedo: null, walls, lights, sight: SEES_ALL, sightRadius: 30, ambient: 0 },
        { bounds: BOUNDS, albedo: null, walls, lights: [], sight: computeSight(sources, walls), sightRadius: 30, ambient: 1 },
      ];
      for (const scene of scenes) {
        const [full, reduced] = engines.map((engine) => {
          engine.update(scene);
          engine.flush();
          return renderView(renderer, engine, target, BOUNDS, scale, x, y);
        });
        for (let o = 0; o < full!.length; o += 4) {
          out.pixels++;
          const f = full![o]! + full![o + 1]! + full![o + 2]!;
          const r = reduced![o]! + reduced![o + 1]! + reduced![o + 2]!;
          if (f === 0 && r > 3 && !darkAround(full!, o)) out.specks++;
          if (r > 3 && darkAround(full!, o)) out.grown++;
          const diff = Math.abs(full![o]! - reduced![o]!) + Math.abs(full![o + 1]! - reduced![o + 1]!) + Math.abs(full![o + 2]! - reduced![o + 2]!);
          if (diff > 3) out.differing++;
          diffSum += diff / 3;
        }
      }
    }
    out.meanDiff = diffSum / out.pixels;
    return out;
  } finally {
    for (const engine of engines) engine.destroy();
    target.destroy(true);
    renderer.destroy();
  }
}

describe('the composite worked out on fewer pixels', () => {
  it('is worked out on fewer pixels only below the render\'s own ratio', () => {
    expect(reducedPixelRatio(undefined, 2)).toBeNull();
    expect(reducedPixelRatio(1, 1)).toBeNull();
    expect(reducedPixelRatio(1, 2)).toBe(1);
    expect(reducedPixelRatio(1, 1.5)).toBe(1);
    expect(reducedPixelRatio(0.75, 1)).toBe(0.75);
  });

  it('shows nothing where the full composite shows nothing, and differs from it only a little', { timeout: 300_000 }, async () => {
    const report = await compare(21, 12);
    console.info(`composite upscale: ${JSON.stringify(report)}`);
    expect(report.grown).toBe(0);
    // Drawn up from a quarter of the pixels: softer edges, the same picture.
    expect(report.differing).toBeGreaterThan(100);
    expect(report.meanDiff).toBeLessThan(3);
  });
});
