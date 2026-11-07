/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { lightFade, limitedMargin, sealTolerance, wallBand, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import type { WallSegment } from '../../../../types/wallTypes';
import { crossedByHand, distanceToSegment, grazes, turningPoints } from '../../../../vision/__tests__/byHand';
import { exploredShapes } from '../../../../vision/exploredShapes';
import { SEES_ALL, computeSight, type SightSource } from '../../../../vision/sight';
import { blocksFrom } from '../../../../vision/visibility';
import { ExploredTexture } from '../../ExploredTexture';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import { rng, type P } from './fuzzRooms';
import { NO_SIGHT, inPenumbra, renderView } from './leakFuzzScene';
import { MIDDLE, SHAPES, type ShapeName } from './limitedShapes';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const BOUNDS = { width: 2048, height: 2048 };

interface Report {
  scenes: number;
  /** Light-map texels asked, those lit behind two limited walls, and those lit behind one where the rule's light is stopped by a solid wall. */
  texels: number;
  pastSecond: number;
  shadowBehindOne: number;
  /** Texels the rule lights behind one limited wall, and those the light map leaves dark. */
  ruleLit: number;
  lightWrong: number;
  /** Pixels asked, those seen and those remembered where counting by hand hides them, and those hidden where it shows them. */
  pixels: number;
  sightLeaks: number;
  memoryLeaks: number;
  ruleSeen: number;
  sightWrong: number;
  seenBehindOne: number;
}

const sum = (pixels: Uint8ClampedArray, o: number): number => pixels[o]! + pixels[o + 1]! + pixels[o + 2]!;

/**
 * Limited walls in the shapes the rooms of `leakFuzzLimited` never make (`limitedShapes.ts`),
 * through the real engine and held against counting by hand (`byHand.ts`), not against the
 * sweep: every wall between a light or a token and a point, a solid one stops, the second
 * limited one stops.
 *
 * Light is read from the light map, texel by texel and one light at a time (the picture adds
 * bounce, which goes around a hedge's end): no texel is lit whose way from the light crosses a
 * limited wall and is stopped by the count, and every texel the count lights, clear of the
 * walls' own width, is lit. Every other scene the light is built at another place first and
 * then moved, and every other light is a token's. Sight and memory are read from the players'
 * picture. A way that passes a wall's end or a crossing of two walls within a texel is
 * anyone's to decide. `lie` counts every limited wall as solid, which the pictures must not bear out.
 */
async function fuzz(name: ShapeName, seed: number, trials: number, lie = false): Promise<Report> {
  vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  const renderer = await createTestRenderer(SIZE);
  const engine = new LightingEngine(renderer);
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  const memory = new ExploredTexture(renderer, BOUNDS);
  const blank = new ExploredTexture(renderer, BOUNDS);
  const texel = worldTexel(BOUNDS);
  const memoryTexel = BOUNDS.width / memory.texture.width;
  const report: Report = { scenes: 0, texels: 0, pastSecond: 0, shadowBehindOne: 0, ruleLit: 0, lightWrong: 0, pixels: 0, sightLeaks: 0, memoryLeaks: 0, ruleSeen: 0, sightWrong: 0, seenBehindOne: 0 };
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed);
    for (let trial = 0; trial < trials; trial++) {
      const shape = SHAPES[name](rand);
      if (shape.places.length === 0) continue;
      report.scenes++;
      const walls = sealWalls(shape.walls, sealTolerance(texel));
      const counted = lie ? walls.map((wall): WallSegment => ({ ...wall, limited: false })) : walls;
      const turning = turningPoints(walls);
      const lights: EngineLight[] = shape.places.map(([x, y], i) => {
        const dim = 500 + rand() * 500;
        return { key: i % 2 === 0 ? `token:t${i}` : `l${i}`, x, y, bright: dim / 2, dim, flame: 2 + rand() * 38, color: [1, 1, 1], intensity: 1, animation: 'none' };
      });
      const base = { bounds: BOUNDS, albedo: null, walls, sight: SEES_ALL, sightRadius: 31, ambient: 0 } satisfies Partial<EngineScene>;
      engine.setExplored(blank.texture);
      for (const light of lights) {
        const from = { x: light.x, y: light.y };
        if (report.scenes % 2 === 0) {
          engine.update({ ...base, lights: [{ ...light, x: light.x + 37, y: light.y - 23 }] });
          engine.flush();
        }
        engine.update({ ...base, lights: [light] });
        engine.flush();
        const map = (engine as unknown as { world: { lightMap: { texture: RenderTexture } } }).world.lightMap.texture;
        const texels = readFloats(renderer, map);
        const width = map.source.pixelWidth;
        const solid = counted.filter((wall) => !wall.limited && blocksFrom(wall, from, 'light'));
        for (let i = 0; i < texels.length; i += 4) {
          const point = { x: ((i / 4) % width + 0.5) * texel, y: (Math.floor(i / 4 / width) + 0.5) * texel };
          if (Math.abs(point.x - MIDDLE) > 620 || Math.abs(point.y - MIDDLE) > 620 || ((i / 4) % width + Math.floor(i / 4 / width)) % 3 !== 0) continue;
          const isLit = texels[i]! > 0;
          const way = crossedByHand(from, point, counted, 'light');
          const stopped = way.solid || way.limited > 1;
          // Only what lies behind a limited wall is asked: before the first, a light is what it is in any scene.
          if (crossedByHand(from, point, walls, 'light').limited === 0 || grazes(from, point, turning, 1)) continue;
          report.texels++;
          if (stopped && isLit) report[way.limited > 1 ? 'pastSecond' : 'shadowBehindOne']++;
          // The rule's light where the picture's fade leaves a fifth of it, clear of every wall's own width and of the soft edge of a solid wall's shadow.
          const clear = wallBand(texel) + limitedMargin(texel) + texel;
          if (stopped || lightFade(light.bright, light.dim, Math.hypot(point.x - from.x, point.y - from.y)) < 0.2 || walls.some((wall) => distanceToSegment(point, wall.p1, wall.p2) < clear)) continue;
          if (grazes(from, point, turning, light.flame + clear) || solid.some((wall) => distanceToSegment(from, wall.p1, wall.p2) < clear)) continue;
          report.ruleLit++;
          if (!isLit) report.lightWrong++;
        }
      }

      const sources: SightSource[] = shape.places.map(([x, y], i) => ({ tokenId: `t${i}`, origin: { x, y }, range: 4000, senses: [] }));
      const sight = computeSight(sources, walls);
      const scale = 0.3 + rand() * 0.5;
      const x = SIZE / 2 - MIDDLE * scale + (rand() - 0.5) * 60, y = SIZE / 2 - MIDDLE * scale + (rand() - 0.5) * 60;
      const shoot = (scene: Partial<EngineScene>): Uint8ClampedArray => {
        engine.update({ ...base, lights: [], ...scene });
        engine.flush();
        return renderView(renderer, engine, target, BOUNDS, scale, x, y);
      };
      const seen = shoot({ ambient: 1, sight });
      memory.clear();
      const recorded = exploredShapes(computeSight([sources[0]!], walls), { ambient: 1 }, []);
      if (recorded) memory.add(recorded);
      engine.setExplored(memory.texture);
      const remembered = shoot({ sight: NO_SIGHT });
      const filter = 1.5 / scale + 0.01;
      const memoryBound = 1.5 * memoryTexel + filter;
      for (let sy = 0; sy < SIZE; sy++) {
        for (let sx = 0; sx < SIZE; sx++) {
          const p: P = [(sx + 0.5 - x) / scale, (sy + 0.5 - y) / scale];
          const point = { x: p[0], y: p[1] };
          if (p[0] < 0 || p[1] < 0 || p[0] > BOUNDS.width || p[1] > BOUNDS.height) continue;
          const o = (sy * SIZE + sx) * 4;
          const offWalls = (by: number): boolean => walls.every((wall) => distanceToSegment(point, wall.p1, wall.p2) > by);
          const ways = sources.map((source) => crossedByHand(source.origin, point, counted, 'sight'));
          const hidden = (way: { solid: boolean; limited: number }): boolean => way.solid || way.limited > 1;
          if (sources.every((source) => crossedByHand(source.origin, point, walls, 'sight').limited === 0)) continue;
          report.pixels++;
          if (sources.every((source) => !grazes(source.origin, point, turning, filter + 1)) && offWalls(filter + 0.5)) {
            if (ways.every(hidden)) {
              if (sum(seen, o) > 0) report.sightLeaks++;
            } else if (!inPenumbra(p, sight, 31)) {
              report.ruleSeen++;
              if (ways.some((way) => !hidden(way) && way.limited === 1)) report.seenBehindOne++;
              const dropped = sx > 0 && sx + 1 < SIZE && sum(seen, o - 4) > 0 && sum(seen, o + 4) > 0;
              if (sum(seen, o) === 0 && !dropped) report.sightWrong++;
            }
          }
          if (hidden(ways[0]!) && sum(remembered, o) > 0 && offWalls(memoryBound) && !grazes(sources[0]!.origin, point, turning, memoryBound + 1)) report.memoryLeaks++;
        }
      }
    }
    return report;
  } finally {
    engine.destroy();
    target.destroy(true);
    memory.destroy();
    blank.destroy();
    renderer.destroy();
    vi.unstubAllGlobals();
  }
}

const CLEAN = { pastSecond: 0, shadowBehindOne: 0, lightWrong: 0, sightLeaks: 0, memoryLeaks: 0, sightWrong: 0 };
const SCENES = Math.max(12, Math.round(TRIALS / 3));

describe('leak fuzz: limited walls in shapes no room makes', () => {
  it.each(Object.keys(SHAPES) as ShapeName[])('lets nothing past the second limited wall, and light and sight past the first: %s', { timeout: 3_600_000 }, async (name) => {
    const report = await fuzz(name, 41, SCENES);
    console.info(`leak fuzz (limited walls, ${name}): ${JSON.stringify({ trials: SCENES, ...report })}`);
    expect(report.scenes).toBeGreaterThan(SCENES * 0.8);
    expect(report.texels).toBeGreaterThan(SCENES * 2000);
    expect(report.ruleLit).toBeGreaterThan(SCENES * 500);
    expect(report.ruleSeen).toBeGreaterThan(SCENES * 500);
    expect(report.seenBehindOne).toBeGreaterThan(SCENES * 300);
    expect(report).toMatchObject(CLEAN);
  });

  it('finds light, sight and memory behind one limited wall when each is counted as solid (the checks can fail)', async () => {
    const report = await fuzz('crossingHedges', 41, 12, true);
    console.info(`negative control (limited walls in shapes): ${JSON.stringify(report)}`);
    expect(report.shadowBehindOne).toBeGreaterThan(1000);
    expect(report.sightLeaks).toBeGreaterThan(1000);
    expect(report.memoryLeaks).toBeGreaterThan(1000);
  });
});
