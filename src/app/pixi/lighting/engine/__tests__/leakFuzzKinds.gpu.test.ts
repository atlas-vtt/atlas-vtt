/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { sealTolerance, wallBand, wallCore, worldTexel } from '../../../../lighting/lightingConstants';
import { placeLight } from '../../../../lighting/lightPlacement';
import { sealWalls } from '../../../../lighting/sealWalls';
import { allSegments, concerns, splitBlocking } from '../../../../lighting/segments';
import type { WallChannel, WallSegment } from '../../../../types/wallTypes';
import { darkvision } from '../../../../vision/__tests__/senseSources';
import { exploredShapes } from '../../../../vision/exploredShapes';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, computeSight, lightReach, type LightReach, type SightSource } from '../../../../vision/sight';
import { blocksFrom, pointInPolygon, type MapBounds } from '../../../../vision/visibility';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { ExploredTexture } from '../../ExploredTexture';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { createTestRenderer } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type P } from './fuzzRooms';
import { NO_SIGHT, footprints, inPenumbra, renderView } from './leakFuzzScene';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const SIDE_TRIALS = Math.max(8, Math.round(TRIALS / 3));
/** Two pictures differ where their colours are more than this apart, summed over the channels. */
const APART = 6;

interface Report {
  rooms: number;
  /** Rooms whose own walls block light only (glass), and those whose walls block sight only (curtains). */
  glass: number;
  curtain: number;
  /** Glass rooms: pixels past the walls, and those the room's lights light. */
  lightChecked: number;
  lightLeaks: number;
  /** Glass rooms: pixels past the walls a token inside sees (it must: glass stops no sight). */
  seenThrough: number;
  /** Curtain rooms: pixels past the walls, and those a token inside sees, by sight, by darkvision, as a footprint and as memory. */
  sightChecked: number;
  sightLeaks: number;
  senseLeaks: number;
  spotLeaks: number;
  memoryLeaks: number;
  /** Curtain rooms: pixels past the walls the room's lights light (they must: a curtain stops no light). */
  litThrough: number;
  /** Pixels that differ from the same scene with only the walls of that channel in it, as plain walls: light, sight, memory. */
  lightMixed: number;
  sightMixed: number;
  memoryMixed: number;
  /** Points the rule counts as lit, and those the picture shows dark. */
  ruleLit: number;
  lightWrong: number;
  /** Points the rule decides as seen or unseen, and those the picture shows otherwise. */
  ruleSight: number;
  sightWrong: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  gap?: boolean | number;
  bounds?: MapBounds;
  resolution?: number;
  /** The lighting quality the engine draws at; the walls are sealed as the rules seal them, at the map's own texel. */
  quality?: LightingQuality;
}

const sum = (pixels: Uint8ClampedArray, o: number): number => pixels[o]! + pixels[o + 1]! + pixels[o + 2]!;
const other = (channel: WallChannel): WallChannel => (channel === 'sight' ? 'light' : 'sight');

/**
 * Walls that block one thing through the real engine, over the leak fuzz's rooms. A room's own
 * walls block light only (glass) or sight only (curtains), in turn, and the chains of walls that
 * cross it block the other thing, so a mix-up of the two shows in either.
 *
 * Glass: with everything seen, the room's lights light nothing past its walls, and a token
 * inside sees past them. Curtains: a token inside sees nothing past the walls (by sight, by
 * darkvision, as a footprint, as explored memory), and the lights shine past them. Each picture
 * is also held against the same scene with only the walls of its channel in it, as plain walls:
 * light with the walls that block light, sight and memory with those that block sight. And the
 * rule is asked at sampled points: where it counts light that passes every wall by a band or
 * more, the picture is lit; where it counts a point as seen or unseen, away from the edges of
 * sight and the soft edges of its shadows, the picture agrees.
 */
async function fuzz({ seed, trials, gap = false, bounds = { width: 2048, height: 2048 }, resolution = 1, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  const renderer = await createTestRenderer(SIZE, resolution);
  const engine = new LightingEngine(renderer, quality);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const memory = new ExploredTexture(renderer, bounds);
  const blank = new ExploredTexture(renderer, bounds);
  const device = SIZE * resolution;
  const memoryTexel = Math.max(bounds.width, bounds.height) / Math.max(memory.texture.width, memory.texture.height);
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 3);
    const report: Report = { rooms: 0, glass: 0, curtain: 0, lightChecked: 0, lightLeaks: 0, seenThrough: 0, sightChecked: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0, memoryLeaks: 0, litThrough: 0, lightMixed: 0, sightMixed: 0, memoryMixed: 0, ruleLit: 0, lightWrong: 0, ruleSight: 0, sightWrong: 0 };
    for (const room of fuzzRooms(seed, trials, gap)) {
      // The rules seal at the map's texel; the picture is held to the texel the engine draws at.
      const texel = worldTexel(bounds, quality.maxTexels);
      const outline = roomOutline(room);
      if (!room.lights.every((p) => insidePolygon(p, outline))) continue;
      const kind: WallChannel = report.rooms % 2 === 0 ? 'light' : 'sight';
      report.rooms++;
      report[kind === 'light' ? 'glass' : 'curtain']++;
      const drawn = room.walls.map((wall, i): WallSegment => ({ ...wall, blocks: i < room.roomWallCount ? kind : other(kind) }));
      const walls = sealWalls(drawn, sealTolerance(worldTexel(bounds)));
      /** Only the walls that block `channel`, as plain walls: what the channel's picture must be the picture of. */
      const plain = (channel: WallChannel): WallSegment[] => walls.filter((wall) => concerns(wall, channel)).map(({ blocks: _blocks, ...wall }) => wall);
      const lights: EngineLight[] = room.lights.map(([lx, ly], i) => {
        const dim = 150 + rand() * 500;
        return { key: `l${i}`, x: lx, y: ly, bright: dim / 2, dim, flame: 2 + rand() * 90, color: [1, 1, 1], intensity: 1, animation: 'none' };
      });
      const [first] = room.lights;
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - first![0] * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - first![1] * scale + (rand() - 0.5) * 200;
      const sightRadius = 20 + rand() * 40;
      const sources: SightSource[] = lights.map((light) => ({ tokenId: light.key, origin: { x: light.x, y: light.y }, range: 4000, senses: [] }));
      const shoot = (scene: Partial<EngineScene>): Uint8ClampedArray => {
        engine.update({ bounds, albedo: null, walls, lights: [], sight: SEES_ALL, sightRadius, ambient: 0, ...scene });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      engine.setExplored(blank.texture);
      const sight = computeSight(sources, walls);
      const lit = shoot({ lights });
      const litPlain = shoot({ lights, walls: plain('light') });
      const seen = shoot({ ambient: 1, sight });
      const seenPlain = shoot({ ambient: 1, walls: plain('sight'), sight: computeSight(sources, plain('sight')) });
      const sensed = shoot({ sight: computeSight(sources.map((source) => ({ ...source, senses: [darkvision(4000)] })), walls) });
      const spotted = shoot({ lights, ambient: 1, sight: NO_SIGHT, spots: footprints(room, outline, walls, rand) });
      memory.clear();
      const recorded = exploredShapes(computeSight([sources[0]!], walls), { ambient: 1 }, []);
      if (recorded) memory.add(recorded);
      engine.setExplored(memory.texture);
      const remembered = shoot({ sight: NO_SIGHT });
      const rememberedPlain = shoot({ sight: NO_SIGHT, walls: plain('sight') });

      // The rule: where each light reaches from the spot the engine places it at, and what the tokens see.
      const lightSegments = allSegments(splitBlocking(walls, 'light'));
      const reaches = lights.flatMap((light) => {
        const at = placeLight(light.x, light.y, light.flame, lightSegments, texel);
        return at ? [lightReach({ x: at.x, y: at.y }, light.dim, walls, light.bright)] : [];
      });
      // A wall is a line to the rule and a capsule to the picture: light that squeezes past a wall's end by less than a band is the rule's alone.
      const widelyLit = (point: { x: number; y: number }, reach: LightReach, clear: number): boolean => Math.hypot(point.x - reach.origin.x, point.y - reach.origin.y) <= reach.dim && pointInPolygon(point, reach.polygon)
        && walls.every((wall) => !blocksFrom(wall, reach.origin, 'light') || Math.min(distSqToSegment(wall.p1, reach.origin, point), distSqToSegment(wall.p2, reach.origin, point), distSqToSegment(reach.origin, wall.p1, wall.p2), distSqToSegment(point, wall.p1, wall.p2)) > clear * clear);
      const edges = sight.regions.map((region) => region.polygon!.map((q): P => [q.x, q.y]));
      const filter = 1.5 / scale + 0.01;
      const nearWall = (p: P, channel: WallChannel, reach: number): boolean => walls.some((wall) => concerns(wall, channel) && distSqToSegment({ x: p[0], y: p[1] }, wall.p1, wall.p2) < reach * reach);
      const memoryBound = Math.min(1.5 * memoryTexel, wallCore(texel)) + filter;
      for (let sy = 0; sy < device; sy++) {
        for (let sx = 0; sx < device; sx++) {
          const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * device + sx) * 4;
          if (Math.abs(sum(lit, o) - sum(litPlain, o)) > APART) report.lightMixed++;
          if (Math.abs(sum(seen, o) - sum(seenPlain, o)) > APART) report.sightMixed++;
          if (Math.abs(sum(remembered, o) - sum(rememberedPlain, o)) > APART) report.memoryMixed++;
          const inside = insidePolygon(p, outline);
          const d = distToOutline(p, outline);
          if (!inside && kind === 'light' && d > 0.01) {
            report.lightChecked++;
            if (sum(lit, o) > 0) report.lightLeaks++;
            if (sum(seen, o) > 0) report.seenThrough++;
          }
          if (!inside && kind === 'sight') {
            if (sum(lit, o) > 0) report.litThrough++;
            if (d > filter) {
              report.sightChecked++;
              if (sum(seen, o) > 0) report.sightLeaks++;
              if (sum(sensed, o) > 0) report.senseLeaks++;
              if (sum(spotted, o) > 0) report.spotLeaks++;
            }
            if (d > memoryBound && sum(remembered, o) > 0) report.memoryLeaks++;
          }
          // Every fourth pixel: the rule is asked for each.
          if (sx % 4 !== 0 || sy % 4 !== 0) continue;
          const point = { x: p[0], y: p[1] };
          if (lightLevelAt(point, { ambient: 0 }, reaches) !== 'dark' && !nearWall(p, 'light', wallBand(texel) + filter) && reaches.some((reach) => widelyLit(point, reach, wallBand(texel) + filter))) {
            report.ruleLit++;
            if (sum(lit, o) === 0) report.lightWrong++;
          }
          if (edges.every((edge) => distToOutline(p, edge) > filter + 1) && !inPenumbra(p, sight, sightRadius)) {
            report.ruleSight++;
            const ruled = sight.regions.some((region) => pointInPolygon(point, region.polygon!));
            // One pixel the rasteriser drops between two slivers of the sight's fan is no disagreement: its neighbours are seen.
            const dropped = ruled && sx > 0 && sx + 1 < device && sum(seen, o - 4) > 0 && sum(seen, o + 4) > 0;
            if (ruled !== sum(seen, o) > 0 && !dropped) report.sightWrong++;
          }
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

/** What every run of closed rooms holds. */
const CLEAN = { lightLeaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0, memoryLeaks: 0, lightMixed: 0, sightMixed: 0, memoryMixed: 0, lightWrong: 0, sightWrong: 0 };

describe('leak fuzz: walls that block one thing', () => {
  it('lets no light past walls for light, no sight past walls for sight, and each through the other kind', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 23, trials: TRIALS });
    console.info(`leak fuzz (wall kinds): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.8);
    expect(Math.min(report.glass, report.curtain)).toBeGreaterThan(TRIALS / 3);
    expect(report.lightChecked).toBeGreaterThan(TRIALS * 1000);
    expect(report.sightChecked).toBeGreaterThan(TRIALS * 1000);
    // What the other kind lets through is there to be seen.
    expect(report.seenThrough).toBeGreaterThan(TRIALS * 1000);
    expect(report.litThrough).toBeGreaterThan(TRIALS * 500);
    expect(report.ruleLit).toBeGreaterThan(TRIALS * 100);
    expect(report.ruleSight).toBeGreaterThan(TRIALS * 1000);
    expect(report).toMatchObject(CLEAN);
  });

  // Texels of the lighting are coarser from 8,192 px on, those of the memory from 2,048 px.
  it('holds on a map of 12,000 px, large enough for coarser texels of the lighting and of the memory', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 7, trials: SIDE_TRIALS, bounds: { width: 12_000, height: 12_000 } });
    console.info(`leak fuzz (wall kinds, 12000 px map): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.lightChecked).toBeGreaterThan(SIDE_TRIALS * 500);
    expect(report).toMatchObject(CLEAN);
  });

  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality on a map whose texels it coarsens', { timeout: 3_600_000 }, async (level) => {
    const report = await fuzz({ seed: 7, trials: SIDE_TRIALS, bounds: { width: 8192, height: 8192 }, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (wall kinds, ${level}): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.lightChecked).toBeGreaterThan(SIDE_TRIALS * 500);
    expect(report).toMatchObject(CLEAN);
  });

  it('holds at renderer resolution 2', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: SIDE_TRIALS, resolution: 2 });
    console.info(`leak fuzz (wall kinds, resolution 2): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.lightChecked).toBeGreaterThan(SIDE_TRIALS * 500);
    expect(report).toMatchObject(CLEAN);
  });

  it('finds light, sight and memory past a wall with a gap (the checks can fail)', async () => {
    const report = await fuzz({ seed: 23, trials: 24, gap: 0.9 });
    console.info(`negative control (wall kinds): ${JSON.stringify(report)}`);
    expect(report.lightLeaks).toBeGreaterThan(100);
    expect(report.sightLeaks).toBeGreaterThan(100);
    expect(report.senseLeaks).toBeGreaterThan(100);
    expect(report.memoryLeaks).toBeGreaterThan(100);
  });
});
