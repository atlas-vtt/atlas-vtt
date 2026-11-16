/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LIGHT_REACH, REFLECTION, sealTolerance, wallCore, wallRadius, worldTexel } from '../../../../lighting/lightingConstants';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { sealWalls } from '../../../../lighting/sealWalls';
import { distToSeg, segOf } from '../../../../lighting/segments';
import { LightReaches } from '../../../../vision/lightReaches';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, type LightReach } from '../../../../vision/sight';
import { pointInPolygon, type MapBounds } from '../../../../vision/visibility';
import { LightingEngine } from '../LightingEngine';
import { createEngineWorld } from '../engineWorld';
import type { EngineLight } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import { REFLECTION_BLUR_TEXELS } from '../reflectionShader';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type P } from './fuzzRooms';
import { renderView } from './leakFuzzScene';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const SIDE_TRIALS = Math.max(8, Math.round(TRIALS / 3));
/** The grid the rule samples shadows on: a quarter of a 70 px cell apart. */
const CELL = 70;

interface Report {
  rooms: number;
  /** Lights with a reflection, and its parts in all. */
  reflecting: number;
  parts: number;
  /** Pixels past the room's walls, and the lit ones of them. */
  checked: number;
  leaks: number;
  /** Light-map texels lit by reflected light alone as the rule counts it, well inside its reach, and those of them the picture leaves dark. */
  counted: number;
  missing: number;
  /** Light-map texels the rule counts unlit, past every light's reach and every reflection's (and its blur), and those of them the picture lights. */
  beyond: number;
  stray: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  bounds?: MapBounds;
  quality?: LightingQuality;
}

/**
 * Reflected light in the leak fuzz's rooms, as the scene model hands it to the engine: point
 * lights and beams, each with the reflection the rule traces (`LightReaches` with reflection
 * sampling), drawn by the real engine. Nothing past a room's walls is lit (the reflection's fans
 * end on the walls' centre lines and are taken out of the capsules, and its blur stays within the
 * free floor); the light map lights what the rule counts lit by the reflection alone, well inside
 * its reach and off the walls; and it lights nothing the rule counts unlit beyond the lights' and
 * reaches, but what the blur carries across a shadow's edge.
 */
async function fuzz({ seed, trials, bounds = { width: 2048, height: 2048 }, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE);
  const engine = new LightingEngine(renderer, quality);
  const world = createEngineWorld(renderer, bounds, quality, false);
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  const texel = worldTexel(bounds, quality.maxTexels);
  const ruleTexel = worldTexel(bounds);
  const sampling = { spacing: CELL / 4, clearance: wallRadius(ruleTexel) };
  const reflection = { ...sampling, reach: REFLECTION.cells * CELL };
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 11);
    const report: Report = { rooms: 0, reflecting: 0, parts: 0, checked: 0, leaks: 0, counted: 0, missing: 0, beyond: 0, stray: 0 };
    for (const room of fuzzRooms(seed, trials)) {
      const outline = roomOutline(room);
      if (!room.lights.every((p) => insidePolygon(p, outline))) continue;
      report.rooms++;
      const walls = sealWalls(room.walls, sealTolerance(ruleTexel));
      const shining: EngineLight[] = room.lights.map(([x, y], i) => {
        const dim = 150 + rand() * 450;
        const beam = rand() < 0.3 ? { cone: { facing: rand() * 2 * Math.PI, angle: 0.3 + rand() * 3 } } : {};
        return { key: `l${i}`, x, y, bright: dim * rand(), dim, flame: 2 + rand() * 30, color: [1, 1, 1], intensity: 1, animation: 'none', ...beam };
      });
      const reaches = new LightReaches().sync(shining, walls, sampling, reflection);
      const lights = shining.map((light, i) => (reaches[i]!.reflection?.length ? { ...light, reflection: reaches[i]!.reflection } : light));
      for (const reach of reaches) {
        if (!reach.reflection?.length) continue;
        report.reflecting++;
        report.parts += reach.reflection.length;
      }

      engine.update({ bounds, albedo: null, walls, lights, sight: SEES_ALL, sightRadius: 20, ambient: 0 });
      engine.flush();
      const scale = 0.2 + rand() * 2;
      const middle = room.centre;
      const x = SIZE / 2 - middle[0] * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - middle[1] * scale + (rand() - 0.5) * 200;
      const lit = renderView(renderer, engine, target, bounds, scale, x, y);
      for (let sy = 0; sy < SIZE; sy++) {
        for (let sx = 0; sx < SIZE; sx++) {
          const p: P = [(sx + 0.5 - x) / scale, (sy + 0.5 - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          if (insidePolygon(p, outline) || distToOutline(p, outline) <= 0.01) continue;
          const o = (sy * SIZE + sx) * 4;
          report.checked++;
          if (lit[o]! + lit[o + 1]! + lit[o + 2]! > 0) report.leaks++;
        }
      }

      // The light map against the rule, texel by texel.
      world.update(walls, lights, null);
      world.flush();
      const map = readFloats(renderer, world.lightMap.texture);
      const width = world.lightMap.texture.source.pixelWidth;
      // Each light traced as far as it ends (and a texel of filtering): beyond it no light of its own.
      const far = new LightReaches().sync(shining.map((light) => ({ ...light, dim: light.dim * LIGHT_REACH + 2 * texel })), walls, sampling);
      const direct = reaches.map(({ reflection: _reflection, ...reach }): LightReach => reach);
      const nearWall = (p: P): boolean => walls.some((wall) => distToSeg(p[0], p[1], segOf(wall)) < 2 * wallRadius(texel) + wallCore(texel));
      // How far the blur carries light past a shadow's edge, at most.
      const blur = (REFLECTION_BLUR_TEXELS + 2) * texel;
      for (let t = 0; t < map.length; t += 4 * 3) {
        const p: P = [(((t / 4) % width) + 0.5) * texel, (Math.floor(t / 4 / width) + 0.5) * texel];
        if (!insidePolygon(p, outline) || distToOutline(p, outline) < 2 * wallRadius(texel) || nearWall(p)) continue;
        const point = { x: p[0], y: p[1] };
        if (lightLevelAt(point, { ambient: 0 }, direct) === 'dark' && reaches.some((reach) => reach.reflection?.some((part) => Math.hypot(point.x - part.origin.x, point.y - part.origin.y) <= 0.8 * part.reach && pointInPolygon(point, part.polygon)))) {
          report.counted++;
          if (map[t]! <= 0) report.missing++;
        } else if (far.every((reach) => !pointInPolygon(point, reach.polygon))
          && reaches.every((reach) => !reach.reflection?.some((part) => Math.hypot(point.x - part.origin.x, point.y - part.origin.y) <= part.reach + blur))) {
          report.beyond++;
          if (map[t]! > 1e-3) report.stray++;
        }
      }
    }
    return report;
  } finally {
    world.destroy();
    engine.destroy();
    target.destroy(true);
    renderer.destroy();
  }
}

/**
 * `stray` is the share of texels past every reach the picture may light: a flame's own
 * penumbra reaches round a wall's end past what the rule traces from its middle (0.3 % at the
 * default). The polygon picture (`saver`) draws no reflected light at all: what the rule counts
 * lit by reflection alone is dark there (`missing` is all of it), which is darker, never lighter.
 */
function holds(report: Report, trials: number, stray = 0.01, reflected = true): void {
  expect(report.rooms).toBeGreaterThan(trials * 0.6);
  expect(report.reflecting).toBeGreaterThan(trials * 0.5);
  expect(report.checked).toBeGreaterThan(trials * 1000);
  expect(report.counted).toBeGreaterThan(trials * 20);
  expect(report.leaks).toBe(0);
  if (reflected) expect(report.missing / report.counted).toBeLessThan(0.01);
  else expect(report.missing).toBe(report.counted);
  expect(report.stray / Math.max(1, report.beyond)).toBeLessThan(stray);
}

describe('leak fuzz: reflected light', () => {
  it('lights nothing past a room\'s walls, and what the rule counts lit by reflection', { timeout: 600_000 }, async () => {
    const report = await fuzz({ seed: 3, trials: TRIALS });
    console.info(`leak fuzz (reflected light): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    holds(report, TRIALS);
  });

  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality on a map whose texels it coarsens', { timeout: 600_000 }, async (name) => {
    const bounds = { width: 8192, height: 8192 };
    const quality = LIGHTING_QUALITY[name];
    const report = await fuzz({ seed: 5, trials: SIDE_TRIALS, bounds, quality });
    console.info(`leak fuzz (reflected light, ${name}): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    holds(report, SIDE_TRIALS, 0.01, quality.picture !== 'polygons');
  });
});
