/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { sealTolerance, wallBand, wallCore, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import { SEES_ALL, computeSight, type Sight } from '../../../../vision/sight';
import type { MapBounds } from '../../../../vision/visibility';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { LightingEngine } from '../LightingEngine';
import type { EngineZone } from '../types';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { createTestRenderer } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type P } from './fuzzRooms';
import { outsideOf, renderView } from './leakFuzzScene';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const SIDE_TRIALS = Math.max(12, Math.round(TRIALS / 3));
const SOFT = 35;
/** The zone on its room's corners (twice as often: only such a room is dark all through), a little smaller, or across its walls. */
const KINDS = ['room', 'within', 'room', 'across'] as const;
/** A zone of darkness in daylight, and a dim zone in a brighter scene: [the scene's ambient light, the zone's]. */
const SHADES = [[1, 0], [0.5, 0.1]] as const;
/** Two pictures differ where their colours are more than this apart, summed over the channels. */
const APART = 6;

interface Report {
  rooms: number;
  dark: number;
  dim: number;
  /** With everything seen: pixels the rule counts as the zone's off the walls, and those that do not have its light. */
  inside: number;
  wrong: number;
  /** Pixels beyond the zone's soft edge, and those that do not have the scene's light. */
  outside: number;
  stray: number;
  /** Pixels outside a room whose zone lies in it, past the wall's core, and those the zone darkens. */
  beyond: number;
  darkened: number;
  /** Pixels on a wall (within its core) inside the zone, and those brighter than the zone's light. */
  onWalls: number;
  brightWalls: number;
  /** Rooms dark all through watched by a token inside, the pixels it sees, and those brighter than the zone's light. */
  watchedWithin: number;
  seenWithin: number;
  seenBright: number;
  /** Rooms watched by a token outside, the pixels it sees past the wall's core, and those that differ from the scene without the zone. */
  watchedOutside: number;
  seenOutside: number;
  seenDarkened: number;
  /**
   * The known tell, counted and not held to 0: pixels a token outside sees darker for the zone, on
   * the near half of the wall's core and on the cores of walls that meet it from outside.
   */
  tell: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  /** The zone of a room drawn on its corners, scaled about its centre: smaller or larger than the room (the negative controls). */
  stretch?: number;
  bounds?: MapBounds;
  resolution?: number;
  /** The lighting quality the engine draws at; the walls are sealed as the rules seal them, at the map's own texel. */
  quality?: LightingQuality;
}

const sum = (pixels: Uint8ClampedArray, o: number): number => pixels[o]! + pixels[o + 1]! + pixels[o + 2]!;

/**
 * Zones darker than their scene through the real engine, over the leak fuzz's rooms: the case in
 * which a zone is drawn onto the walls too (`ZoneMap`'s second pass), which a zone of daylight in
 * a dark scene never is.
 *
 * With everything seen, the zone's light is its own wherever the rule counts it and the scene's
 * beyond its soft edge; a zone in its room darkens nothing past the wall's core, and no wall
 * inside the zone is brighter than the zone. A token inside a room that is the zone sees nothing
 * brighter than the zone's light, not a line on the wall (rooms without one-way walls, which let
 * sight out). A token outside sees the scene as it is without the zone, up to the wall's core.
 */
async function fuzz({ seed, trials, stretch = 1, bounds = { width: 2048, height: 2048 }, resolution = 1, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE, resolution);
  const engine = new LightingEngine(renderer, quality);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const device = SIZE * resolution;
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 9);
    const report: Report = { rooms: 0, dark: 0, dim: 0, inside: 0, wrong: 0, outside: 0, stray: 0, beyond: 0, darkened: 0, onWalls: 0, brightWalls: 0, watchedWithin: 0, seenWithin: 0, seenBright: 0, watchedOutside: 0, seenOutside: 0, seenDarkened: 0, tell: 0 };
    for (const room of fuzzRooms(seed, trials)) {
      // The rules seal at the map's texel; the picture is held to the texel the engine draws at.
      const texel = worldTexel(bounds, quality.maxTexels);
      const walls = sealWalls(room.walls, sealTolerance(worldTexel(bounds)));
      const outline = roomOutline(room);
      if (!room.lights.every((p) => insidePolygon(p, outline)) || !insidePolygon(room.centre, room.outline)) continue;
      const kind = KINDS[report.rooms % KINDS.length]!;
      const [sceneLight, zoneLight] = SHADES[Math.floor(report.rooms / KINDS.length) % SHADES.length]!;
      report.rooms++;
      report[zoneLight === 0 ? 'dark' : 'dim']++;
      const [cx, cy] = room.centre;
      const shrink = 0.8 + rand() * 0.195;
      const half = 120 + rand() * 260;
      const polygon = kind === 'across'
        ? [{ x: cx - half, y: cy - half }, { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half }]
        : room.outline.map(([px, py]) => ({ x: cx + (px - cx) * (kind === 'within' ? shrink : stretch), y: cy + (py - cy) * (kind === 'within' ? shrink : stretch) }));
      const zones: EngineZone[] = [{ polygon, ambient: zoneLight, soft: SOFT }];
      const zoneOutline = polygon.map((corner): P => [corner.x, corner.y]);
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - cx * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - cy * scale + (rand() - 0.5) * 200;
      const shoot = (ambient: number, zoned: boolean, sight: Sight = SEES_ALL): Uint8ClampedArray => {
        engine.update({ bounds, albedo: null, walls, lights: [], sightRadius: 31, sight, ambient, zones: zoned ? zones : [] });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      const eyes = (p: P): Sight => computeSight([{ tokenId: 'v', origin: { x: p[0], y: p[1] }, range: 4000, senses: [] }], walls);
      const zoned = shoot(sceneLight, true);
      const asScene = shoot(sceneLight, false);
      const asZone = shoot(zoneLight, false);
      const oneWay = room.walls.some((wall) => wall.direction);
      const within = kind === 'room' && !oneWay ? shoot(sceneLight, true, eyes(room.lights[0]!)) : null;
      const viewer = kind !== 'across' && !oneWay ? outsideOf(room, outline, bounds, rand) : null;
      const outside = viewer && { zoned: shoot(sceneLight, true, eyes(viewer)), plain: shoot(sceneLight, false, eyes(viewer)) };
      if (within) report.watchedWithin++;
      if (outside) report.watchedOutside++;

      const filter = 1.5 / scale + 0.01;
      const core = wallCore(texel) + filter;
      const face = wallBand(texel) + 1.5 / scale;
      // A wall's capsule has the darkest light that lies on it, a band past the zone's outline: where another wall
      // meets the room's from outside, its core is that dark, and so is the corner between the two, where a face
      // climbs a band away from its own wall and ends beside the room's.
      const near = 2 * wallBand(texel) + filter;
      const junction = (p: P, d: number): boolean => d <= near && (onWall(p, core) || walls.filter((wall) => distSqToSegment({ x: p[0], y: p[1] }, wall.p1, wall.p2) < near * near).length > 1);
      const onWall = (p: P, reach: number): boolean => walls.some((wall) => distSqToSegment({ x: p[0], y: p[1] }, wall.p1, wall.p2) < reach * reach);
      for (let sy = 0; sy < device; sy++) {
        for (let sx = 0; sx < device; sx++) {
          const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * device + sx) * 4;
          const inRoom = insidePolygon(p, outline);
          const d = distToOutline(p, outline);
          const lit = sum(zoned, o);
          if (kind !== 'across' && !inRoom && d > core) {
            report.beyond++;
            if (Math.abs(lit - sum(asScene, o)) > APART && !junction(p, d)) report.darkened++;
          }
          if (within && sum(within, o) > 0) {
            report.seenWithin++;
            if (sum(within, o) > sum(asZone, o) + APART) report.seenBright++;
          }
          if (outside && !inRoom && sum(outside.plain, o) > 0) {
            const differs = Math.abs(sum(outside.zoned, o) - sum(outside.plain, o)) > APART;
            if (d > core) report.seenOutside++;
            if (differs && (d <= core || junction(p, d))) report.tell++;
            else if (differs) report.seenDarkened++;
          }
          // Every third pixel: the walls are asked for each.
          if (sx % 3 !== 0 || sy % 3 !== 0) continue;
          const fromEdge = distToOutline(p, zoneOutline);
          if (insidePolygon(p, zoneOutline)) {
            if (onWall(p, wallCore(texel))) {
              if (kind === 'room' || fromEdge > face) {
                report.onWalls++;
                if (lit > sum(asZone, o) + APART) report.brightWalls++;
              }
            } else if (fromEdge > wallCore(texel) && !onWall(p, 3 * face)) {
              report.inside++;
              if (Math.abs(lit - sum(asZone, o)) > APART) report.wrong++;
            }
          } else if (fromEdge > SOFT + face && !onWall(p, 3 * face)) {
            report.outside++;
            if (Math.abs(lit - sum(asScene, o)) > APART) report.stray++;
          }
        }
      }
    }
    return report;
  } finally {
    engine.destroy();
    target.destroy(true);
    renderer.destroy();
  }
}

/** What every run of closed rooms holds. */
const CLEAN = { wrong: 0, stray: 0, darkened: 0, brightWalls: 0, seenBright: 0, seenDarkened: 0 };

describe('leak fuzz: zones darker than their scene', () => {
  it('keeps a darker zone to its room, its walls as dark as the zone, and shows no line to a token on either side', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 17, trials: TRIALS });
    console.info(`leak fuzz (darker zones): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.6);
    expect(Math.min(report.dark, report.dim)).toBeGreaterThan(TRIALS / 4);
    expect(report.inside).toBeGreaterThan(TRIALS * 100);
    expect(report.outside).toBeGreaterThan(TRIALS * 100);
    expect(report.beyond).toBeGreaterThan(TRIALS * 1000);
    expect(report.onWalls).toBeGreaterThan(TRIALS * 5);
    expect(report.watchedWithin).toBeGreaterThan(TRIALS / 4);
    expect(report.seenWithin).toBeGreaterThan(TRIALS * 100);
    expect(report.watchedOutside).toBeGreaterThan(TRIALS / 4);
    expect(report.seenOutside).toBeGreaterThan(TRIALS * 1000);
    expect(report).toMatchObject(CLEAN);
  });

  it.each([[8192, 31]])('holds on a map of %i px', { timeout: 3_600_000 }, async (side, seed) => {
    const report = await fuzz({ seed, trials: SIDE_TRIALS, bounds: { width: side, height: side } });
    console.info(`leak fuzz (darker zones, ${side} px map): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.onWalls).toBeGreaterThan(SIDE_TRIALS * 5);
    expect(report.seenWithin).toBeGreaterThan(SIDE_TRIALS * 100);
    expect(report).toMatchObject(CLEAN);
  });

  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality on a map whose texels it coarsens', { timeout: 3_600_000 }, async (level) => {
    const report = await fuzz({ seed: 31, trials: SIDE_TRIALS, bounds: { width: 8192, height: 8192 }, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (darker zones, ${level}): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.onWalls).toBeGreaterThan(SIDE_TRIALS * 5);
    expect(report.seenWithin).toBeGreaterThan(SIDE_TRIALS * 100);
    expect(report).toMatchObject(CLEAN);
  });

  it('holds at renderer resolution 2', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: SIDE_TRIALS, resolution: 2 });
    console.info(`leak fuzz (darker zones, resolution 2): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.onWalls).toBeGreaterThan(SIDE_TRIALS * 5);
    expect(report).toMatchObject(CLEAN);
  });

  it('finds the scene\'s light a token inside sees where the zone ends short of the walls (the check can fail)', async () => {
    const report = await fuzz({ seed: 17, trials: 24, stretch: 0.9 });
    console.info(`negative control (darker zones, a zone smaller than its room): ${JSON.stringify(report)}`);
    expect(report.seenBright).toBeGreaterThan(100);
  });

  it('finds the darkness of a zone that reaches past its room\'s walls (the checks can fail)', async () => {
    const report = await fuzz({ seed: 17, trials: 24, stretch: 1.1 });
    console.info(`negative control (darker zones, a zone larger than its room): ${JSON.stringify(report)}`);
    expect(report.darkened).toBeGreaterThan(100);
    expect(report.seenDarkened).toBeGreaterThan(100);
  });
});
