/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight } from '../types';
import { sealWalls } from '../../../../lighting/sealWalls';
import { placeLight } from '../../../../lighting/lightPlacement';
import { allSegments, splitBlocking } from '../../../../lighting/segments';
import { DARKNESS, LIGHT_REACH, sealTolerance, wallCore, worldTexel } from '../../../../lighting/lightingConstants';
import { perceivedLevel } from '../../../../gameSystems/senseRules';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, computeSight, lightReach } from '../../../../vision/sight';
import type { MapBounds } from '../../../../vision/visibility';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { createTestRenderer } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type P } from './fuzzRooms';
import { NO_SIGHT, SENSE_SETS, footprints, renderView, type Report } from './leakFuzzScene';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
/** Trials of the large map and of resolution 2: a third of the main run's, so the long fuzz reaches them too. */
const SIDE_TRIALS = Math.max(8, Math.round(TRIALS / 3));

interface FuzzOptions {
  seed: number;
  trials: number;
  /** Opens one wall of every room (the negative control). */
  gap?: boolean | number;
  bounds?: MapBounds;
  /** Device pixels per screen pixel of the renderer and its target (2 on Retina displays). */
  resolution?: number;
  /** Draws each footprint as a whole disc, ignoring the walls (a negative control). */
  wholeFootprints?: boolean;
  /** Gives every light a priority above the darkness, so it shines in it (a negative control). */
  outshine?: boolean;
  /** The lighting quality the engine draws at; the walls are sealed as the rules seal them, at the map's own texel. */
  quality?: LightingQuality;
}

/**
 * Renders every room through the real engine at a random camera and counts pixels past the
 * room's walls (as drawn, joined by their bridges) that are not black: light (direct + bounce,
 * player mode, everything seen, no ambient), sight (ambient 1, a token at each light; sight
 * stops at the centre line, so only filtering may show past it: 1.5 screen px) and senses (no
 * ambient, the lights on, each token with the senses of one room in turn: darkvision in grey,
 * blindsight and truesight in colour, black-and-white darkvision without a distance, low-light
 * vision; held to the same line as sight) and the footprints of tokens shown where no sense
 * shows the map (a lit map, the lights on, no sight at all: tokens of size 1, 2 and 4 that hug a
 * wall, stand in a corner, straddle a door or stand anywhere; held to the same line as sight).
 * Every other room also gets a source of magical darkness where its last light stands: in
 * daylight with every light on, nothing past the walls may differ from the room without it
 * (darkness ends at walls like light; a wall's own core, 1.5 texels each way, may take of it), and
 * wherever the rule counts the room as magically dark, the picture shows nothing but the veil
 * (the lights and the day are swallowed, not let through); that room's senses are fuzzed with the
 * darkness in place: those that see in it may show it, the others show nothing there. The other
 * rooms are lit once more by their lights as beams of a random width and direction (what a beam
 * may light at all is held by `leakFuzzBeams`): nothing past the walls is lit. Ambient zones and
 * explored memory have their own fuzz over the same rooms (`leakFuzzZones`).
 */
async function fuzz({ seed, trials, gap = false, bounds = { width: 2048, height: 2048 }, resolution = 1, wholeFootprints = false, outshine = false, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE, resolution);
  const engine = new LightingEngine(renderer, quality);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const device = SIZE * resolution;
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 1);
    const report: Report = { rooms: 0, doors: 0, oneWay: 0, twoLights: 0, checked: 0, leaks: 0, sightChecked: 0, sightLeaks: 0, senseLeaks: 0, senseInside: 0, spots: 0, spotLeaks: 0, spotInside: 0, litInside: 0, bounceInside: 0, darkRooms: 0, darkLeaks: 0, darkInside: 0, darkRevealed: 0, senseDarkInside: 0, senseDarkRevealed: 0, beamRooms: 0, beamInside: 0, beamLeaks: 0 };
    for (const room of fuzzRooms(seed, trials, gap)) {
      // The rules seal at the map's texel; the picture is held to the texel the engine draws at.
      const texel = worldTexel(bounds, quality.maxTexels);
      const walls = sealWalls(room.walls, sealTolerance(worldTexel(bounds)));
      const outline = roomOutline(room);
      if (!room.lights.every((p) => insidePolygon(p, outline))) continue;
      report.rooms++;
      const outlineWalls = room.walls.slice(0, room.roomWallCount);
      if (outlineWalls.some((w) => w.type === 'door')) report.doors++;
      if (outlineWalls.some((w) => w.direction)) report.oneWay++;
      if (room.lights.length > 1) report.twoLights++;
      const lights: EngineLight[] = room.lights.map(([x, y], i) => {
        const dim = 150 + rand() * 500;
        return { key: `l${i}`, x, y, bright: dim / 2, dim, flame: 2 + rand() * 90, color: [1, 1, 1], intensity: 1, animation: 'none' };
      });
      const [first] = room.lights;
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - first![0] * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - first![1] * scale + (rand() - 0.5) * 200;
      const sightRadius = 20 + rand() * 40;
      const sources = lights.map((light) => ({ tokenId: light.key, origin: { x: light.x, y: light.y }, range: 4000, senses: [] }));
      const shoot = (sightOn: boolean): Uint8ClampedArray => {
        engine.update({
          bounds, albedo: null, walls, lights: sightOn ? [] : lights,
          sight: sightOn ? computeSight(sources, walls) : SEES_ALL, sightRadius, ambient: sightOn ? 1 : 0,
        });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      const lit = shoot(false);
      const seen = shoot(true);
      const senses = SENSE_SETS[report.rooms % SENSE_SETS.length]!;
      const last = room.lights[room.lights.length - 1]!;
      const darkness: EngineLight | null = report.rooms % 2 === 0
        ? { key: 'darkness', x: last[0], y: last[1], bright: 0, dim: 100 + rand() * 400, flame: 2 + rand() * 40, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true }
        : null;
      const withDarkness = darkness ? [...lights.map((light) => (outshine ? { ...light, priority: 1 } : light)), darkness] : lights;
      engine.update({ bounds, albedo: null, walls, lights: withDarkness, sight: computeSight(sources.map((source) => ({ ...source, senses })), walls), sightRadius, ambient: 0 });
      engine.flush();
      const sensed = renderView(renderer, engine, target, bounds, scale, x, y);
      let day: Uint8ClampedArray | null = null;
      let darkened: Uint8ClampedArray | null = null;
      if (darkness) {
        report.darkRooms++;
        for (const list of [lights, withDarkness]) {
          engine.update({ bounds, albedo: null, walls, lights: list, sight: SEES_ALL, sightRadius, ambient: 1 });
          engine.flush();
          const shot = renderView(renderer, engine, target, bounds, scale, x, y);
          if (list === lights) day = shot;
          else darkened = shot;
        }
      }
      let beamed: Uint8ClampedArray | null = null;
      if (!darkness) {
        report.beamRooms++;
        const beams = lights.map((light) => ({ ...light, cone: { facing: rand() * 2 * Math.PI, angle: 0.2 + rand() * 4.5, ...(rand() < 0.5 && { apex: 10 + rand() * 60 }) } }));
        engine.update({ bounds, albedo: null, walls, lights: beams, sight: SEES_ALL, sightRadius, ambient: 0 });
        engine.flush();
        beamed = renderView(renderer, engine, target, bounds, scale, x, y);
      }
      // What the rule counts as magically dark; the picture is held to it a map texel and a screen
      // pixel inside that area's outline (walls and the edges of their shadows) and inside its rim.
      const darkRule = darkness ? [lightReach({ x: darkness.x, y: darkness.y }, darkness.dim, walls, 0, { darkness: true })] : [];
      const darkOutline = darkRule.flatMap((reach) => reach.polygon.map(({ x: px, y: py }): P => [px, py]));
      const core = wallCore(texel) + 1.5 / scale;
      const magicallyDark = (p: P): boolean => !!darkness && Math.hypot(p[0] - darkness.x, p[1] - darkness.y) < darkness.dim - 2 * DARKNESS.rim
        && lightLevelAt({ x: p[0], y: p[1] }, { ambient: 1 }, darkRule) === 'magical-dark'
        && distToOutline(p, darkOutline) > core;
      const pierces = senses.some(({ definition }) => perceivedLevel(definition, 'magical-dark') !== null);
      const spots = footprints(room, outline, wholeFootprints ? [] : walls, rand);
      report.spots += spots.length;
      engine.update({ bounds, albedo: null, walls, lights, sight: NO_SIGHT, spots, sightRadius, ambient: 1 });
      engine.flush();
      const spotted = renderView(renderer, engine, target, bounds, scale, x, y);
      // Direct light ends at the reach around where the engine places each light (plus the light map's bilinear texel).
      const placed = lights.map((l) => ({ at: placeLight(l.x, l.y, l.flame, allSegments(splitBlocking(walls)), texel), reach: l.dim * LIGHT_REACH + 2 * texel }));
      const beyondReach = (p: P): boolean => placed.every(({ at, reach }) => !at || Math.hypot(p[0] - at.x, p[1] - at.y) > reach);
      for (let sy = 0; sy < device; sy += 1) {
        for (let sx = 0; sx < device; sx += 1) {
          const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * device + sx) * 4;
          const inside = insidePolygon(p, outline);
          const d = distToOutline(p, outline);
          if (inside && lit[o]! > 0) {
            report.litInside++;
            if (beyondReach(p)) report.bounceInside++;
          }
          if (!inside && d > 0.01) {
            report.checked++;
            if (lit[o]! + lit[o + 1]! + lit[o + 2]! > 0) report.leaks++;
            if (beamed && beamed[o]! + beamed[o + 1]! + beamed[o + 2]! > 0) report.beamLeaks++;
          }
          if (inside && beamed && beamed[o]! > 0) report.beamInside++;
          if (!inside && d > 1.5 / scale + 0.01) {
            report.sightChecked++;
            if (seen[o]! + seen[o + 1]! + seen[o + 2]! > 0) report.sightLeaks++;
            if (sensed[o]! + sensed[o + 1]! + sensed[o + 2]! > 0) report.senseLeaks++;
            if (spotted[o]! + spotted[o + 1]! + spotted[o + 2]! > 0) report.spotLeaks++;
          }
          if (inside && spotted[o]! + spotted[o + 1]! + spotted[o + 2]! > 0) report.spotInside++;
          // The darkness' area is the rule's polygon, which ends on the walls' centre lines: past one, only the wall's own core takes of it.
          if (day && darkened && !inside && d > core) {
            if (Math.abs(day[o]! - darkened[o]!) + Math.abs(day[o + 1]! - darkened[o + 1]!) + Math.abs(day[o + 2]! - darkened[o + 2]!) > 3) report.darkLeaks++;
          }
          // Every fourth pixel: the rule is asked for each.
          if (darkened && sx % 4 === 0 && sy % 4 === 0 && magicallyDark(p)) {
            report.darkInside++;
            // The veil is about (10, 9, 27).
            if (darkened[o]! + darkened[o + 1]! + darkened[o + 2]! > 60) report.darkRevealed++;
            if (!pierces) {
              report.senseDarkInside++;
              if (sensed[o]! + sensed[o + 1]! + sensed[o + 2]! > 60) report.senseDarkRevealed++;
            }
          }
          if (inside && lit[o]! === 0 && sensed[o]! + sensed[o + 1]! + sensed[o + 2]! > 0) report.senseInside++;
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
const NO_LEAKS = { leaks: 0, sightLeaks: 0, senseLeaks: 0, spotLeaks: 0, darkLeaks: 0, darkRevealed: 0, senseDarkRevealed: 0, beamLeaks: 0 };

describe('leak fuzz', () => {
  it('lets no light, bounce, sight, sense or token footprint past the walls of closed rooms', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 11, trials: TRIALS });
    console.info(`leak fuzz: ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.8);
    expect(Math.min(report.doors, report.oneWay, report.twoLights)).toBeGreaterThan(TRIALS / 8);
    expect(report.checked).toBeGreaterThan(TRIALS * 1000);
    expect(report.litInside).toBeGreaterThan(TRIALS * 100);
    expect(report.bounceInside).toBeGreaterThan(TRIALS * 10);
    expect(report.senseInside).toBeGreaterThan(TRIALS * 100);
    expect(report.spots).toBeGreaterThan(TRIALS * 4);
    expect(report.spotInside).toBeGreaterThan(TRIALS * 100);
    expect(report.darkRooms).toBeGreaterThan(TRIALS / 3);
    expect(report.darkInside).toBeGreaterThan(TRIALS * 20);
    expect(report.beamRooms).toBeGreaterThan(TRIALS / 3);
    expect(report.beamInside).toBeGreaterThan(TRIALS * 50);
    expect(report.senseDarkInside).toBeGreaterThan(TRIALS * 4);
    expect(report).toMatchObject(NO_LEAKS);
  });

  it('holds on a map large enough for coarser texels', { timeout: 600_000 }, async () => {
    const bounds = { width: 9000, height: 9000 };
    expect(worldTexel(bounds)).toBeGreaterThan(2);
    const report = await fuzz({ seed: 7, trials: SIDE_TRIALS, bounds });
    console.info(`leak fuzz (large map): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(Math.min(report.doors, report.oneWay, report.twoLights)).toBeGreaterThan(0);
    expect(report.checked).toBeGreaterThan(8000);
    expect(report.litInside).toBeGreaterThan(800);
    expect(report.senseInside).toBeGreaterThan(800);
    expect(report.spotInside).toBeGreaterThan(400);
    expect(report.darkInside).toBeGreaterThan(50);
    expect(report.beamInside).toBeGreaterThan(400);
    expect(report).toMatchObject(NO_LEAKS);
  });

  /** The levels, and a coarse texel with bounce, which no level pairs but a caller may. */
  const QUALITIES: [string, LightingQuality, number][] = [
    ['balanced', LIGHTING_QUALITY.balanced, 9],
    ['saver', LIGHTING_QUALITY.saver, 7],
    ['coarse with bounce', { maxTexels: 1024, bounceMaxSide: Infinity, flickerMs: null }, 7],
  ];
  for (const [name, quality, seed] of QUALITIES) {
    it(`holds at the ${name} lighting quality on a map whose texels it coarsens`, { timeout: 600_000 }, async () => {
      const bounds = { width: 8192, height: 8192 };
      expect(worldTexel(bounds, quality.maxTexels)).toBeGreaterThan(worldTexel(bounds));
      const report = await fuzz({ seed, trials: SIDE_TRIALS, bounds, quality });
      console.info(`leak fuzz (${name}): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
      expect(Math.min(report.doors, report.oneWay, report.twoLights)).toBeGreaterThan(0);
      expect(report.checked).toBeGreaterThan(8000);
      expect(report.litInside).toBeGreaterThan(800);
      if (quality.bounceMaxSide >= bounds.width) expect(report.bounceInside).toBeGreaterThan(80);
      expect(report.senseInside).toBeGreaterThan(800);
      expect(report.spotInside).toBeGreaterThan(400);
      expect(report.darkInside).toBeGreaterThan(50);
      expect(report.beamInside).toBeGreaterThan(400);
      expect(report).toMatchObject(NO_LEAKS);
    });
  }

  it('holds at renderer resolution 2', { timeout: 600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: SIDE_TRIALS, resolution: 2 });
    console.info(`leak fuzz (resolution 2): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.checked).toBeGreaterThan(8 * 4000);
    expect(report.litInside).toBeGreaterThan(800);
    expect(report.darkInside).toBeGreaterThan(50);
    expect(report.beamInside).toBeGreaterThan(400);
    expect(report).toMatchObject(NO_LEAKS);
  });

  it('finds light and sight past a wall with a gap (the check can fail)', async () => {
    // Nine tenths of one wall open.
    const report = await fuzz({ seed: 11, trials: 20, gap: 0.9 });
    console.info(`negative control: ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(1000);
    expect(report.sightLeaks).toBeGreaterThan(1000);
    expect(report.senseLeaks).toBeGreaterThan(1000);
    expect(report.darkLeaks).toBeGreaterThan(1000);
    expect(report.beamLeaks).toBeGreaterThan(1000);
  });

  it('finds light inside a darkness that every light outranks (the check can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 20, outshine: true });
    console.info(`negative control (outshone darkness): ${JSON.stringify(report)}`);
    expect(report.darkInside).toBeGreaterThan(100);
    expect(report.darkRevealed).toBeGreaterThan(report.darkInside / 4);
    expect(report.senseDarkInside).toBeGreaterThan(100);
    expect(report.senseDarkRevealed).toBeGreaterThan(report.senseDarkInside / 4);
  });

  it('finds a footprint past a wall when it is drawn as a whole disc (the check can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 6, wholeFootprints: true });
    console.info(`negative control (whole footprints): ${JSON.stringify(report)}`);
    expect(report.spotLeaks).toBeGreaterThan(1000);
  });
});
