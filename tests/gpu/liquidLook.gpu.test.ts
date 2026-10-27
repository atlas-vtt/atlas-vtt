import { Texture } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DungeonRequest } from '../../src/app/dungeons/model';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import type { LiquidColors, LiquidKind } from '../../src/app/types/liquidTypes';
import type { Point } from '../../src/app/types/visionTypes';
import { centreOf, deepPoint, paintedDungeon, renderShot, savePicture, sheet, surfaceOf } from './liquidHarness';

/**
 * Water, lava and acid over generated maps, for a person to judge: each case far out (30 screen
 * pixels per cell) and close in (250), at two moments, and a strip of eight frames a fifth of a
 * second apart, written to `out/liquids/`.
 */

const CELL = 100;
const WIDTH = 480;
const HEIGHT = 360;

const mix = (a: string, b: string, t: number): string => {
  const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);
  const out = [1, 3, 5].map((at) => Math.round(channel(a, at) * (1 - t) + channel(b, at) * t).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
};

function colorsFor(look: DungeonStyleId, liquid: LiquidKind): LiquidColors {
  if (liquid === 'lava') return { surface: '#e0531b', deep: '#2a1612', glint: '#ffd27a' };
  const water = dungeonStyle(look).colors.water;
  return liquid === 'acid'
    ? { surface: mix(water, '#9fe03a', 0.5), deep: mix(water, '#0e1a04', 0.6), glint: '#efffc0' }
    : { surface: water, deep: mix(water, '#06121c', 0.65), glint: mix(water, '#ffffff', 0.85) };
}

const CASES: readonly { name: string; request: DungeonRequest; look: DungeonStyleId; liquid: LiquidKind; flow?: Point }[] = [
  { name: 'water-parchment-pool', request: { seed: 909, theme: 'cavern', tags: ['wet'], floors: 1 }, look: 'parchment', liquid: 'water' },
  { name: 'water-parchment-flowing', request: { seed: 909, theme: 'cavern', tags: ['wet'], floors: 1 }, look: 'parchment', liquid: 'water', flow: { x: 0.8, y: 0.6 } },
  { name: 'water-night-pool', request: { seed: 31, tags: ['wet'], floors: 1 }, look: 'night', liquid: 'water' },
  { name: 'lava-volcanic', request: { seed: 909, theme: 'cavern', tags: ['wet'], floors: 1 }, look: 'volcanic', liquid: 'lava' },
  { name: 'lava-volcanic-flowing', request: { seed: 909, theme: 'cavern', tags: ['wet'], floors: 1 }, look: 'volcanic', liquid: 'lava', flow: { x: 1, y: 0 } },
  { name: 'acid-sewer', request: { seed: 909, theme: 'cavern', tags: ['wet'], floors: 1 }, look: 'sewer', liquid: 'acid' },
];

describe('liquid surfaces, for judging by eye', () => {
  let renderer: Awaited<ReturnType<typeof createTestRenderer>>;
  beforeAll(async () => { renderer = await createTestRenderer(WIDTH); });
  afterAll(() => renderer.destroy());

  for (const { name, request, look, liquid, flow } of CASES) {
    it(`draws ${name}`, async () => {
      const map = await paintedDungeon(request, look, CELL);
      const outline = map.outlines[0];
      if (!outline) throw new Error(`${name} paints no water`);
      const texture = Texture.from(map.bitmap);
      const meshes = map.outlines.slice(0, 6).map((polygon, index) => new LiquidMesh(surfaceOf(`${name}-${index}`, liquid, polygon, colorsFor(look, liquid), flow), CELL));
      const centre = centreOf(outline.polygon);
      const far = { width: WIDTH, height: HEIGHT, zoom: 30 / CELL, centre };
      const near = { width: WIDTH, height: HEIGHT, zoom: 250 / CELL, centre: deepPoint(outline.polygon, CELL, 0.4) };
      const pictures = [
        renderShot(renderer, texture, [], far, 0), renderShot(renderer, texture, meshes, far, 0), renderShot(renderer, texture, meshes, far, 7),
        renderShot(renderer, texture, [], near, 0), renderShot(renderer, texture, meshes, near, 0), renderShot(renderer, texture, meshes, near, 7),
      ];
      await savePicture(sheet(pictures, WIDTH, HEIGHT, 3), name);
      // A program that does not compile draws nothing at all, silently.
      expect(pictures[4]).not.toEqual(pictures[3]);
      // Every second frame at 30 a second, then frames a second apart: the motion must read as flowing or churning, never as flicker.
      const small = { ...near, width: 240, height: 180 };
      const frames = Array.from({ length: 8 }, (_, k) => renderShot(renderer, texture, meshes, small, 20 + k / 15));
      const seconds = Array.from({ length: 8 }, (_, k) => renderShot(renderer, texture, meshes, small, 20 + k));
      await savePicture(sheet([...frames, ...seconds], 240, 180, 4), `${name}-frames`);
      const step = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
        let sum = 0;
        for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
        return sum / (a.length / 4) / 3;
      };
      const frameStep = frames.slice(1).map((frame, k) => step(frames[k]!, frame));
      console.log(`[liquids] ${name}: mean change per 1/15 s ${(frameStep.reduce((a, b) => a + b, 0) / frameStep.length).toFixed(2)}, per second ${step(seconds[0]!, seconds[1]!).toFixed(2)}`);
      for (const mesh of meshes) mesh.destroy();
      texture.destroy(true);
    });
  }
});
