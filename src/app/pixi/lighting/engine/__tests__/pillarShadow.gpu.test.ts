import { afterEach, describe, expect, it } from 'vitest';
import { LIGHT_PRESETS } from '../../../../lighting/lightPresets';
import { LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import type { UnitScale } from '../../../../lighting/lightingUnits';
import { srgbToLinear } from '../../../../lighting/srgb';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL } from '../../../../vision/sight';
import { engineLight } from '../../../../vision/lightSources';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight } from '../types';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';

const SIZE = 512;
const MAP = 1024;
const CELL = 70;
const SCALE: UnitScale = { unitDistance: 5, cellSize: CELL };
const LIGHT = { x: 300, y: 512 };
/** A slim column two cells from the light, a third of a cell across: far narrower than a lantern's flame. */
const PILLAR = { x: LIGHT.x + 2 * CELL, y: LIGHT.y, r: 12 };

function ring(cx: number, cy: number, r: number, n = 12): WallSegment[] {
  return Array.from({ length: n }, (_, k) => {
    const [a, b] = [(2 * Math.PI * k) / n, (2 * Math.PI * (k + 1)) / n];
    return { id: `p${k}`, kind: 'wall', type: 'solid', p1: { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }, p2: { x: cx + r * Math.cos(b), y: cy + r * Math.sin(b) } };
  });
}

/**
 * The traced picture lights only where the rule does: a texel the flame's middle cannot reach
 * gets nothing from the flame's edge. A flame is at least 12 % of the dim radius, so before,
 * the floor behind a slim column was lit at half strength and the column cast no shadow at
 * High and Balanced, while Saver (the rule's polygons) showed it.
 */
describe('a slim column casts its shadow', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  const lightOf = (preset: 'torch' | 'lantern'): EngineLight => ({ ...engineLight({ key: 'l', x: LIGHT.x, y: LIGHT.y, emission: LIGHT_PRESETS[preset].emission }, SCALE), animation: 'none' });

  async function luminance(quality: LightingQuality, light: EngineLight): Promise<(x: number, y: number) => number> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer, quality);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls: ring(PILLAR.x, PILLAR.y, PILLAR.r), lights: [light], sight: SEES_ALL, sightRadius: 20, ambient: 0.1 });
    engine.flush();
    const pixel = renderThroughEngine(engine, renderer, { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0xc0c0c0, map: MAP });
    return (x, y) => {
      const [r, g, b] = pixel(Math.round((x * SIZE) / MAP), Math.round((y * SIZE) / MAP));
      return 0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255);
    };
  }

  for (const preset of ['torch', 'lantern'] as const) {
    for (const level of ['high', 'balanced'] as const) {
      it(`${preset} at ${level}`, async () => {
        const light = lightOf(preset);
        const lum = await luminance(LIGHTING_QUALITY[level], light);
        for (const cells of [0.5, 1, 2]) {
          const d = PILLAR.x - LIGHT.x + PILLAR.r + cells * CELL;
          const open = lum(LIGHT.x, LIGHT.y - d);
          // Ambient and bounce only: measured 0.08 to 0.10 (0.29 to 0.61 before).
          expect(lum(LIGHT.x + d, LIGHT.y) / open, `${cells} cells behind`).toBeLessThan(0.15);
          // Just past the penumbra's outer edge, where the whole flame shows past the column, the floor is lit as the open floor (0.84 at least measured).
          const behind = d - (PILLAR.x - LIGHT.x);
          const side = (PILLAR.r * d) / (PILLAR.x - LIGHT.x) + (light.flame * behind) / (PILLAR.x - LIGHT.x) + 12;
          expect(lum(LIGHT.x + d, LIGHT.y + side) / lum(LIGHT.x, LIGHT.y - Math.hypot(d, side)), `${cells} cells behind, beside`).toBeGreaterThan(0.8);
        }
      });
    }
  }
});
