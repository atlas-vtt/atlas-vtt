/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { sealTolerance, wallBand, wallCore, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import { exploredShapes } from '../../../../vision/exploredShapes';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import type { MapBounds } from '../../../../vision/visibility';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { ExploredTexture } from '../../ExploredTexture';
import { saveExploredMask } from '../../exploredMaskSaving';
import { LightingEngine } from '../LightingEngine';
import type { EngineZone } from '../types';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { createTestRenderer } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type FuzzRoom, type P } from './fuzzRooms';
import { NO_SIGHT, outsideOf, renderView } from './leakFuzzScene';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
/** Trials of the cases beside the main one (other map sizes, another resolution): a third of its, so the long fuzz reaches them too. */
const SIDE_TRIALS = Math.max(12, Math.round(TRIALS / 3));
/** Width of a zone's soft edge: half a 70 px cell. */
const SOFT = 35;
/** A zone a little smaller than its room, one drawn on the room's own corners, and one that lies across the room's walls. */
const KINDS = ['within', 'room', 'across'] as const;

interface Report {
  rooms: number;
  /** Rooms by the kind of zone they got. */
  within: number;
  room: number;
  across: number;
  /** Lit pixels past the walls of a room whose zone lies in it, with everything seen. */
  leaks: number;
  /** Pixels the rule counts as lit by the zone, and those of them that are not as bright as the day. */
  inside: number;
  wrong: number;
  /** Pixels beyond the zone's soft edge, and those of them that are lit all the same. */
  outside: number;
  stray: number;
  /** Rooms looked at by a vision token outside them, the pixels at their walls, and the lit pixels in the whole view. */
  watched: number;
  atWalls: number;
  seenLit: number;
  /** Pixels inside a room remembered from within that show the memory, and those past its walls that do. */
  remembered: number;
  memoryLeaks: number;
  /** The same of the memory saved into the map file and drawn back from it. */
  restored: number;
  restoredLeaks: number;
  /** And of a mask as older versions saved it, at half the memory's size. */
  older: number;
  olderLeaks: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  /** Opens one wall of every room (the negative control). */
  gap?: number;
  bounds?: MapBounds;
  resolution?: number;
  /** The lighting quality the engine draws at; the walls are sealed as the rules seal them, at the map's own texel. */
  quality?: LightingQuality;
}

/** The memory as older versions saved it: at 1,024 px on its longer side at most. */
function halved(source: HTMLCanvasElement): string {
  const scale = Math.min(1, 1024 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/**
 * Ambient zones and explored memory through the real engine, over the leak fuzz's rooms.
 *
 * Each room gets a zone of daylight in a pitch-black scene: a little smaller than the room, on
 * the room's own corners, or lying across its walls. With everything seen, a zone in its room
 * lights nothing past the walls, every zone is as bright as the day wherever the rule counts it
 * (off the walls themselves: a face takes the ambient light of the floor in front of it, and no
 * zone brighter than the scene lies on a wall), and nothing is lit beyond its soft edge. Then a
 * token with vision looks at the room from the dark outside (rooms without one-way walls, which
 * let sight in): it sees nothing lit at all, not a line on the wall.
 *
 * Each room is also remembered from within, recorded as the scene records it (`exploredShapes`
 * stamped into an `ExploredTexture`): with no one looking, the memory shows inside the room and
 * never past its walls. A memory texel on the centre line shows half on either side, so the
 * bound is one and a half memory texels, and on a large map, where that is more than a wall is
 * thick, the wall's core. The memory is then saved as the map file keeps it and drawn back as a
 * reopened scene draws it, which changes nothing, and once more from a mask of half its size, as
 * older versions saved it: the same bound holds.
 */
async function fuzz({ seed, trials, gap = 0, bounds = { width: 2048, height: 2048 }, resolution = 1, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(options?.attr ?? {})) el.setAttribute(key, value);
    return el;
  });
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
    const rand = rng(seed + 5);
    const report: Report = { rooms: 0, within: 0, room: 0, across: 0, leaks: 0, inside: 0, wrong: 0, outside: 0, stray: 0, watched: 0, atWalls: 0, seenLit: 0, remembered: 0, memoryLeaks: 0, restored: 0, restoredLeaks: 0, older: 0, olderLeaks: 0 };
    for (const room of fuzzRooms(seed, trials, gap || false)) {
      // The rules seal at the map's texel; the picture is held to the texel the engine draws at.
      const texel = worldTexel(bounds, quality.maxTexels);
      const walls = sealWalls(room.walls, sealTolerance(worldTexel(bounds)));
      const outline = roomOutline(room);
      // The zone is drawn about the centre the outline is star-shaped around, which three corners need not surround.
      if (!room.lights.every((p) => insidePolygon(p, outline)) || !insidePolygon(room.centre, room.outline)) continue;
      const kind = KINDS[report.rooms % KINDS.length]!;
      report.rooms++;
      report[kind]++;
      const [cx, cy] = room.centre;
      const shrink = 0.8 + rand() * 0.195;
      const half = 120 + rand() * 260;
      const polygon = kind === 'across'
        ? [{ x: cx - half, y: cy - half }, { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half }]
        : room.outline.map(([px, py]) => ({ x: cx + (px - cx) * (kind === 'within' ? shrink : 1), y: cy + (py - cy) * (kind === 'within' ? shrink : 1) }));
      const zone: EngineZone = { polygon, ambient: 1, soft: SOFT };
      const zoneOutline = polygon.map((corner): P => [corner.x, corner.y]);
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - cx * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - cy * scale + (rand() - 0.5) * 200;
      const shoot = (scene: { ambient: number; zones: EngineZone[]; sight?: ReturnType<typeof computeSight> }): Uint8ClampedArray => {
        engine.update({ bounds, albedo: null, walls, lights: [], sightRadius: 31, sight: SEES_ALL, ...scene });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      engine.setExplored(blank.texture);
      const zoned = shoot({ ambient: 0, zones: [zone] });
      const daylight = shoot({ ambient: 1, zones: [] });
      const viewer = kind !== 'across' && !room.walls.some((wall) => wall.direction) ? outsideOf(room, outline, bounds, rand) : null;
      const watched = viewer && shoot({ ambient: 0, zones: [zone], sight: computeSight([{ tokenId: 'v', origin: { x: viewer[0], y: viewer[1] }, range: 4000, senses: [] }], walls) });
      if (watched) report.watched++;
      // The room as a token in its middle saw it by day, and no one looking now.
      memory.clear();
      const recorded = exploredShapes(computeSight([{ tokenId: 'm', origin: { x: room.lights[0]![0], y: room.lights[0]![1] }, range: 4000, senses: [] }], walls), { ambient: 1 }, []);
      if (recorded) memory.add(recorded);
      engine.setExplored(memory.texture);
      const remembered = shoot({ ambient: 0, zones: [], sight: NO_SIGHT });
      // The same memory as the map file keeps it and a reopened scene draws it.
      await memory.load(saveExploredMask(memory.toCanvas()));
      const restored = shoot({ ambient: 0, zones: [], sight: NO_SIGHT });
      // And as a file of an older version keeps it: at half the size.
      await memory.load(halved(memory.toCanvas()));
      const older = shoot({ ambient: 0, zones: [], sight: NO_SIGHT });

      const filter = 1.5 / scale + 0.01;
      // A wall takes the ambient light of the floor beside it, a band away and farther out of a corner between two walls.
      const face = wallBand(texel) + 1.5 / scale;
      const onWall = (p: P, reach: number): boolean => walls.some((wall) => distSqToSegment({ x: p[0], y: p[1] }, wall.p1, wall.p2) < reach * reach);
      for (let sy = 0; sy < device; sy++) {
        for (let sx = 0; sx < device; sx++) {
          const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * device + sx) * 4;
          const inside = insidePolygon(p, outline);
          const d = distToOutline(p, outline);
          const lit = zoned[o]! + zoned[o + 1]! + zoned[o + 2]!;
          if (kind !== 'across' && !inside && d > filter && lit > 0) report.leaks++;
          if (watched) {
            if (d < wallCore(texel)) report.atWalls++;
            if (watched[o]! + watched[o + 1]! + watched[o + 2]! > 0) report.seenLit++;
          }
          const shown = remembered[o]! + remembered[o + 1]! + remembered[o + 2]!;
          if (inside && shown > 0) report.remembered++;
          if (!inside && d > Math.min(1.5 * memoryTexel, wallCore(texel)) + filter && shown > 0) report.memoryLeaks++;
          const reshown = restored[o]! + restored[o + 1]! + restored[o + 2]!;
          if (inside && reshown > 0) report.restored++;
          if (!inside && d > Math.min(1.5 * memoryTexel, wallCore(texel)) + filter && reshown > 0) report.restoredLeaks++;
          const old = older[o]! + older[o + 1]! + older[o + 2]!;
          if (inside && old > 0) report.older++;
          if (!inside && d > Math.min(1.5 * memoryTexel, wallCore(texel)) + filter && old > 0) report.olderLeaks++;
          // Every third pixel: the walls are asked for each.
          if (sx % 3 !== 0 || sy % 3 !== 0) continue;
          const fromEdge = distToOutline(p, zoneOutline);
          if (insidePolygon(p, zoneOutline)) {
            if (fromEdge > wallCore(texel) && !onWall(p, 3 * face)) {
              report.inside++;
              if (Math.abs(lit - daylight[o]! - daylight[o + 1]! - daylight[o + 2]!) > 6) report.wrong++;
            }
          } else if (fromEdge > SOFT + face && !onWall(p, 3 * face)) {
            report.outside++;
            if (lit > 0) report.stray++;
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
  }
}

/** What every run of closed rooms holds. */
const CLEAN = { leaks: 0, wrong: 0, stray: 0, seenLit: 0, memoryLeaks: 0, restoredLeaks: 0, olderLeaks: 0 };

describe('leak fuzz: ambient zones and explored memory', () => {
  it('lets no zone light and no memory past the walls of closed rooms, and shows a zone where the rule counts it', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 11, trials: TRIALS });
    console.info(`leak fuzz (zones, memory): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.6);
    expect(Math.min(report.within, report.room, report.across)).toBeGreaterThan(TRIALS / 6);
    expect(report.inside).toBeGreaterThan(TRIALS * 100);
    expect(report.outside).toBeGreaterThan(TRIALS * 10);
    expect(report.watched).toBeGreaterThan(TRIALS / 4);
    expect(report.atWalls).toBeGreaterThan(TRIALS * 20);
    expect(report.remembered).toBeGreaterThan(TRIALS * 100);
    // What is restored is what was saved; an older, smaller mask loses next to nothing to the sharpening of its edges.
    expect(report.restored).toBe(report.remembered);
    expect(report.older).toBeGreaterThan(report.remembered * 0.98);
    expect(report).toMatchObject(CLEAN);
  });

  // The memory's texel is as wide as a wall is thick from about 4,300 px on, and widest at the largest map Atlas keeps.
  it.each([[7000, 7], [8192, 31], [9000, 7]])('holds on a map of %i px, large enough for coarser texels of the lighting and of the memory', { timeout: 3_600_000 }, async (side, seed) => {
    const report = await fuzz({ seed, trials: SIDE_TRIALS, bounds: { width: side, height: side } });
    console.info(`leak fuzz (zones, memory, ${side} px map): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.inside).toBeGreaterThan(SIDE_TRIALS * 80);
    expect(report.remembered).toBeGreaterThan(SIDE_TRIALS * 80);
    expect(report.restored).toBe(report.remembered);
    expect(report.older).toBeGreaterThan(report.remembered * 0.98);
    expect(report).toMatchObject(CLEAN);
  });

  // Coarser lighting texels make walls wider; the memory keeps its own texel at every quality.
  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality on a map whose texels it coarsens', { timeout: 3_600_000 }, async (level) => {
    const report = await fuzz({ seed: 31, trials: SIDE_TRIALS, bounds: { width: 8192, height: 8192 }, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (zones, memory, ${level}): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.inside).toBeGreaterThan(SIDE_TRIALS * 80);
    expect(report.remembered).toBeGreaterThan(SIDE_TRIALS * 80);
    expect(report.restored).toBe(report.remembered);
    expect(report.older).toBeGreaterThan(report.remembered * 0.98);
    expect(report).toMatchObject(CLEAN);
  });

  it('holds at renderer resolution 2', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: SIDE_TRIALS, resolution: 2 });
    console.info(`leak fuzz (zones, memory, resolution 2): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.inside).toBeGreaterThan(SIDE_TRIALS * 80);
    expect(report).toMatchObject(CLEAN);
  });

  it('finds zone light, a lit wall and memory past a wall with a gap (the checks can fail)', async () => {
    const report = await fuzz({ seed: 11, trials: 24, gap: 0.9 });
    console.info(`negative control (zones, memory): ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(100);
    expect(report.seenLit).toBeGreaterThan(100);
    expect(report.memoryLeaks).toBeGreaterThan(100);
    expect(report.restoredLeaks).toBeGreaterThan(100);
    expect(report.olderLeaks).toBeGreaterThan(100);
  });
});
