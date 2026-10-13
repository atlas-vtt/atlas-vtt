/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { LIGHT_REACH, sealTolerance, softEdge, worldTexel } from '../../../../lighting/lightingConstants';
import { placeLight } from '../../../../lighting/lightPlacement';
import { sealWalls } from '../../../../lighting/sealWalls';
import { allSegments, splitBlocking } from '../../../../lighting/segments';
import type { VisionCone } from '../../../../vision/visionCone';
import { LightingWorld } from '../LightingWorld';
import type { EngineLight } from '../types';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import { fuzzRooms, insidePolygon, rng, roomOutline } from './fuzzRooms';

const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const BOUNDS = { width: 2048, height: 2048 };
/** Radians and pixels a texel may lie from a beam's edge and still count as on it. */
const EDGE = 1e-3;

interface Report {
  rooms: number;
  /** Texels the lights reach when they shine all around. */
  lit: number;
  /** Of those, the texels brighter under the beams: a beam only ever takes light away. */
  brighter: number;
  /** Texels outside every beam, past its soft side and its own space, and those of them the beams still light. */
  outside: number;
  stray: number;
  /** Texels inside the beam of every light that reaches them, and those of them a beam dims. */
  inside: number;
  dimmed: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  /** Draws the lights without their beams (the negative control): the checks still expect them. */
  allAround?: boolean;
  /** Draws every beam a quarter turn from where the checks expect it (a negative control). */
  turned?: boolean;
  bounds?: { width: number; height: number };
  /** The lighting quality the world draws at; the walls are sealed as the rules seal them, at the map's own texel. */
  quality?: LightingQuality;
}

/**
 * The lights of every fuzz room as beams of a random width (11° to 270°) and direction, half of
 * them with a space of their own lit all around, drawn by the real world into the light map and
 * compared texel by texel with the same lights shining all around. A beam multiplies its light's
 * share by at most 1, so a room's walls hold for beams as they hold for lights (the leak fuzz);
 * this fuzz holds the beam itself: nowhere brighter than the light all around, nothing outside
 * the beam past its soft edge (a width in world pixels at its sides and its far end), everything
 * of the light inside it up to its dim radius.
 */
async function fuzz({ seed, trials, allAround = false, turned = false, bounds = BOUNDS, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(64);
  const world = new LightingWorld(renderer, bounds, quality);
  const texel = worldTexel(bounds, quality.maxTexels);
  try {
    const rand = rng(seed + 3);
    const report: Report = { rooms: 0, lit: 0, brighter: 0, outside: 0, stray: 0, inside: 0, dimmed: 0 };
    for (const room of fuzzRooms(seed, trials)) {
      const walls = sealWalls(room.walls, sealTolerance(worldTexel(bounds)));
      const outline = roomOutline(room);
      if (!room.lights.every((p) => insidePolygon(p, outline))) continue;
      report.rooms++;
      const lights: EngineLight[] = room.lights.map(([x, y], i) => {
        const dim = 150 + rand() * 500;
        const cone: VisionCone = { facing: rand() * 2 * Math.PI, angle: 0.2 + rand() * 4.5, ...(rand() < 0.5 && { apex: 10 + rand() * 60 }) };
        // The soft edge of a grid of 30 to 110 px cells.
        return { key: `l${i}`, x, y, bright: dim / 2, dim, flame: 2 + rand() * 90, color: [1, 1, 1], intensity: 1, animation: 'none', cone, edge: softEdge(dim, 30 + rand() * 80) };
      });
      const read = (drawn: EngineLight[]): Float32Array => {
        world.update(walls, drawn, null);
        world.flush();
        return readFloats(renderer, world.lightMap.texture);
      };
      const all = read(lights.map(({ cone: _cone, edge: _edge, ...light }) => light));
      const beamed = allAround ? all : read(lights.map((light) => (turned ? { ...light, cone: { ...light.cone!, facing: light.cone!.facing + Math.PI / 2 } } : light)));
      const placed = lights.flatMap((light) => {
        const at = placeLight(light.x, light.y, light.flame, allSegments(splitBlocking(walls)), texel);
        return at ? [{ at, cone: light.cone!, dim: light.dim, edge: light.edge!, reach: light.dim * LIGHT_REACH }] : [];
      });
      const width = world.lightMap.texture.source.pixelWidth;
      for (let o = 0; o < all.length; o += 4) {
        if (all[o]! <= 0) continue;
        report.lit++;
        if (beamed[o]! > all[o]! + 1e-4) report.brighter++;
        const x = ((o / 4) % width + 0.5) * texel;
        const y = (Math.floor(o / 4 / width) + 0.5) * texel;
        let outside = true;
        let inside = true;
        for (const { at, cone, dim, edge, reach } of placed) {
          const d = Math.hypot(x - at.x, y - at.y);
          if (d >= reach) continue;
          const apex = cone.apex ?? 0;
          const off = Math.acos(Math.min(1, Math.max(-1, ((x - at.x) * Math.cos(cone.facing) + (y - at.y) * Math.sin(cone.facing)) / Math.max(d, 1e-4)))) - cone.angle / 2;
          // Across the cone's nearer edge in front of the light, from the light itself behind it.
          const across = off < Math.PI / 2 ? d * Math.sin(Math.max(off, 0)) : d;
          if (d < dim + edge + EDGE && (across < edge + EDGE || d < apex + edge + EDGE)) outside = false;
          // Inside the beam and the dim radius the light is all there; past the radius a beam ends sooner.
          if ((off > -EDGE && d > apex - EDGE) || d > dim - EDGE) inside = false;
        }
        if (outside) {
          report.outside++;
          if (beamed[o]! > 0) report.stray++;
        }
        if (inside) {
          report.inside++;
          if (Math.abs(beamed[o]! - all[o]!) > 1e-4) report.dimmed++;
        }
      }
    }
    return report;
  } finally {
    world.destroy();
    renderer.destroy();
  }
}

describe('leak fuzz: beams', () => {
  it('lights nothing outside a beam past its soft side, all of the light inside it, and nowhere more than the light all around', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 11, trials: TRIALS });
    console.info(`leak fuzz (beams): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.8);
    expect(report.outside).toBeGreaterThan(TRIALS * 1000);
    expect(report.inside).toBeGreaterThan(TRIALS * 1000);
    expect(report).toMatchObject({ brighter: 0, stray: 0, dimmed: 0 });
  });

  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality on a map whose texels it coarsens', { timeout: 3_600_000 }, async (level) => {
    const report = await fuzz({ seed: 7, trials: Math.max(8, Math.round(TRIALS / 3)), bounds: { width: 8192, height: 8192 }, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (beams, ${level}): ${JSON.stringify(report)}`);
    expect(report.outside).toBeGreaterThan(1000);
    expect(report.inside).toBeGreaterThan(1000);
    expect(report).toMatchObject({ brighter: 0, stray: 0, dimmed: 0 });
  });

  it('finds light outside the beams of lights drawn all around (the check can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 8, allAround: true });
    console.info(`negative control (no beams): ${JSON.stringify(report)}`);
    expect(report.stray).toBe(report.outside);
    expect(report.stray).toBeGreaterThan(8000);
  });

  it('finds beams that face another way: light outside them and none inside (the check can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 8, turned: true });
    console.info(`negative control (turned beams): ${JSON.stringify(report)}`);
    expect(report.stray).toBeGreaterThan(1000);
    expect(report.dimmed).toBeGreaterThan(1000);
  });
});
