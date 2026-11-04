/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LIGHT_REACH, sealTolerance, wallCore, wallRadius, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import { crosses, distToSeg, segOf } from '../../../../lighting/segments';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import type { Point } from '../../../../types/visionTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { areaDistance } from '../../../../vision/areaReach';
import { LightReaches } from '../../../../vision/lightReaches';
import { SEES_ALL } from '../../../../vision/sight';
import type { MapBounds } from '../../../../vision/visibility';
import { hasArea } from '../../../../vision/polygonArea';
import { LightingEngine } from '../LightingEngine';
import { createEngineWorld } from '../engineWorld';
import type { EngineLight } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type FuzzRoom, type P } from './fuzzRooms';
import { renderView } from './leakFuzzScene';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const SIDE_TRIALS = Math.max(8, Math.round(TRIALS / 3));
/** The grid the rule samples area outlines on: a quarter of a 70 px cell apart. */
const CELL = 70;
/** A pool anywhere in the room, one whose shore lies on the room's wall, and one that follows a grid's cells. */
const KINDS = ['pool', 'shore', 'cells'] as const;
type Kind = (typeof KINDS)[number];

interface Report {
  rooms: number;
  pool: number;
  shore: number;
  cells: number;
  /** Pixels past the room's walls, and the lit ones of them. */
  checked: number;
  leaks: number;
  /** Pixels on the lava clear of every wall, and the unlit ones of them. */
  onArea: number;
  areaDark: number;
  /** Light-map texels in the room the rule counts lit well inside the dim range, and those of them the picture leaves dark. */
  counted: number;
  missing: number;
  /** Light-map texels the rule counts unlit past the light's reach, and those of them the picture lights. */
  beyond: number;
  stray: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  /** Opens most of one wall of every room (the negative control). */
  gap?: number;
  bounds?: MapBounds;
  quality?: LightingQuality;
}

/** Whether the closed path `area` stays inside the room: its corners inside, and none of its edges crossing the room's walls. */
function fits(area: readonly Point[], outline: readonly P[], roomWalls: readonly WallSegment[]): boolean {
  if (!hasArea(area) || !area.every((p) => insidePolygon([p.x, p.y], outline))) return false;
  return area.every((a, i) => {
    const b = area[(i + 1) % area.length]!;
    return roomWalls.every((wall) => !crosses(a.x, a.y, b.x, b.y, segOf(wall)) && !crosses(b.x, b.y, a.x, a.y, segOf(wall)));
  });
}

/**
 * The lava of one room, around its middle: a pool of 4 to 12 corners at random angles, a pool
 * one corner of which lies 0 to 2 px from the room's wall, or a field of the grid's cells, each 20
 * to 40 px. It shrinks until it fits the room; the chains of walls that wander into the room may
 * cross it (a wall across the lava).
 */
function areaOf(kind: Kind, room: FuzzRoom, outline: readonly P[], rand: () => number): Point[] | null {
  const roomWalls = room.walls.slice(0, room.roomWallCount);
  // Around the point the room is star-shaped about, or its first light where that lies outside a hand-drawn outline.
  const [cx, cy] = insidePolygon(room.centre, outline) ? room.centre : room.lights[0]!;
  for (let scale = 1; scale > 0.05; scale *= 0.75) {
    let area: Point[];
    if (kind === 'cells') {
      const cell = 20 + rand() * 20;
      const width = 1 + Math.floor(rand() * 5 * scale), height = 1 + Math.floor(rand() * 5 * scale);
      const columns = Array.from({ length: width }, () => {
        const from = Math.floor(rand() * 2);
        return [from, Math.max(from + 1, height - Math.floor(rand() * 2))] as const;
      });
      // Each column of cells from its top to its bottom, joined into one staircase outline.
      const x0 = cx - (width * cell) / 2, y0 = cy - (height * cell) / 2;
      const top = columns.flatMap(([from], i) => [{ x: x0 + i * cell, y: y0 + from * cell }, { x: x0 + (i + 1) * cell, y: y0 + from * cell }]);
      const bottom = columns.map(([, to], i) => [{ x: x0 + (i + 1) * cell, y: y0 + to * cell }, { x: x0 + i * cell, y: y0 + to * cell }]).reverse().flat();
      area = [...top, ...bottom];
    } else {
      const corners = 4 + Math.floor(rand() * 9);
      const angles = Array.from({ length: corners }, () => rand() * 2 * Math.PI).sort((a, b) => a - b);
      area = angles.map((angle) => {
        const r = (30 + rand() * 120) * scale;
        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
      });
      if (kind === 'shore') {
        // One corner on the room's wall nearest the light, 0 to 2 px inside it.
        const wall = roomWalls.reduce((best, w) => (distToSeg(cx, cy, segOf(w)) < distToSeg(cx, cy, segOf(best)) ? w : best));
        const [ax, ay, bx, by] = segOf(wall);
        const t = Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
        const foot = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
        const d = Math.hypot(cx - foot.x, cy - foot.y) || 1;
        const off = rand() * 2;
        const nearest = area.reduce((best, p, i) => (Math.hypot(p.x - foot.x, p.y - foot.y) < Math.hypot(area[best]!.x - foot.x, area[best]!.y - foot.y) ? i : best), 0);
        area[nearest] = { x: foot.x + ((cx - foot.x) / d) * off, y: foot.y + ((cy - foot.y) / d) * off };
      }
    }
    if (fits(area, outline, roomWalls)) return area;
  }
  return null;
}

/**
 * Area lights in the leak fuzz's rooms, drawn by the real engine: nothing past the room's walls
 * is lit (light, its bounce, at a random camera), the lava itself is lit wherever no wall stands
 * on it, and the light map agrees with the rule (`areaDistance`): lit where the rule counts the
 * point well inside the dim range, unlit where the rule counts nothing past the light's reach.
 * A point the rule counts lit through a narrow view of the lava gets the share of it that it
 * sees, so the misses are counted and must be few; light where the rule has none is counted too.
 */
async function fuzz({ seed, trials, gap, bounds = { width: 2048, height: 2048 }, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE);
  const engine = new LightingEngine(renderer, quality);
  const world = createEngineWorld(renderer, bounds, quality, false);
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  const texel = worldTexel(bounds, quality.maxTexels);
  const ruleTexel = worldTexel(bounds);
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 5);
    const report: Report = { rooms: 0, pool: 0, shore: 0, cells: 0, checked: 0, leaks: 0, onArea: 0, areaDark: 0, counted: 0, missing: 0, beyond: 0, stray: 0 };
    for (const room of fuzzRooms(seed, trials, gap ?? false)) {
      const outline = roomOutline(room);
      const kind = KINDS[report.rooms % KINDS.length]!;
      const area = areaOf(kind, room, outline, rand);
      if (!area) continue;
      report.rooms++;
      report[kind]++;
      const walls = sealWalls(room.walls, sealTolerance(ruleTexel));
      const dim = 120 + rand() * 400;
      const middle = { x: area.reduce((s, p) => s + p.x, 0) / area.length, y: area.reduce((s, p) => s + p.y, 0) / area.length };
      const light: EngineLight = { key: 'lava', ...middle, bright: dim / 2, dim, flame: 0, color: [1, 1, 1], intensity: 1, animation: 'none', surface: area };

      engine.update({ bounds, albedo: null, walls, lights: [light], sight: SEES_ALL, sightRadius: 20, ambient: 0 });
      engine.flush();
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - middle.x * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - middle.y * scale + (rand() - 0.5) * 200;
      const lit = renderView(renderer, engine, target, bounds, scale, x, y);
      const core = wallCore(texel) + 1.5 / scale;
      const nearWall = (p: P): boolean => walls.some((wall) => distToSeg(p[0], p[1], segOf(wall)) < wallRadius(texel) + core);
      const areaRing = area.map(({ x: px, y: py }): P => [px, py]);
      for (let sy = 0; sy < SIZE; sy++) {
        for (let sx = 0; sx < SIZE; sx++) {
          const p: P = [(sx + 0.5 - x) / scale, (sy + 0.5 - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * SIZE + sx) * 4;
          const shown = lit[o]! + lit[o + 1]! + lit[o + 2]!;
          if (!insidePolygon(p, outline) && distToOutline(p, outline) > 0.01) {
            report.checked++;
            if (shown > 0) report.leaks++;
          } else if (insidePolygon(p, areaRing) && distToOutline(p, areaRing) > core && !nearWall(p)) {
            report.onArea++;
            if (shown === 0) report.areaDark++;
          }
        }
      }

      // The light map against the rule, texel by texel.
      world.update(walls, [light], null);
      world.flush();
      const map = readFloats(renderer, world.lightMap.texture);
      const width = world.lightMap.texture.source.pixelWidth;
      const sampling = { spacing: CELL / 4, clearance: wallRadius(ruleTexel) };
      // The rule's reach traced as far as the light's fade ends (and a texel of filtering): what lies beyond it is in no clear view of the lava within that.
      const [far] = new LightReaches().sync([{ ...light, dim: dim * LIGHT_REACH + 2 * texel }], walls, sampling);
      for (let t = 0; t < map.length; t += 4 * 3) {
        const p: P = [(((t / 4) % width) + 0.5) * texel, (Math.floor(t / 4 / width) + 0.5) * texel];
        if (!insidePolygon(p, outline) || distToOutline(p, outline) < 2 * wallRadius(texel) || nearWall(p)) continue;
        const d = areaDistance({ x: p[0], y: p[1] }, far!);
        if (d <= 0.8 * dim) {
          report.counted++;
          if (map[t]! <= 0) report.missing++;
        } else if (d === Infinity) {
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

/** `missing` is the share of counted texels the picture may leave dark: a coarser picture closes more for light than the rule (darker, never lighter). */
function holds(report: Report, trials: number, missing = 0.01): void {
  expect(report.rooms).toBeGreaterThan(trials * 0.6);
  expect(Math.min(report.pool, report.shore, report.cells)).toBeGreaterThan(0);
  expect(report.checked).toBeGreaterThan(trials * 1000);
  expect(report.onArea).toBeGreaterThan(trials * 10);
  expect(report.counted).toBeGreaterThan(trials * 100);
  expect(report).toMatchObject({ leaks: 0, areaDark: 0 });
  // A point counted through a sliver of the lava past a wall's end may show next to nothing.
  // A sliver of lava shorter than the rule's spacing past a wall's end lights a little the rule does not count.
  expect(report.missing / report.counted).toBeLessThan(missing);
  expect(report.stray / Math.max(1, report.beyond)).toBeLessThan(0.03);
}

describe('leak fuzz: area lights', () => {
  it('lights nothing past a room\'s walls, the lava wherever no wall stands on it, and as the rule counts', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 13, trials: TRIALS });
    console.info(`leak fuzz (area lights): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    holds(report, TRIALS);
  });

  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality on a map whose texels it coarsens', { timeout: 3_600_000 }, async (level) => {
    const report = await fuzz({ seed: 9, trials: SIDE_TRIALS, bounds: { width: 8192, height: 8192 }, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (area lights, ${level}): ${JSON.stringify(report)}`);
    holds(report, SIDE_TRIALS / 4, 0.03);
  });

  it('finds light past a wall with a gap (the check can fail)', async () => {
    const report = await fuzz({ seed: 13, trials: 12, gap: 0.9 });
    console.info(`negative control (area lights): ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(500);
  });
});
