/// <reference types="vite/client" />
import { RenderTexture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExploredEdit } from '../../../../lighting/exploredEdits';
import { sealTolerance, wallBand, wallCore, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import type { ViewAtlasState, ViewAtlasStore } from '../../../../storeFactory';
import type { StrokeShape } from '../../../../tools/shapeStroke';
import type { MapBounds } from '../../../../vision/visibility';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { ExploredMemory } from '../../ExploredMemory';
import { LightingEngine } from '../LightingEngine';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import { createTestRenderer } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type P } from './fuzzRooms';
import { NO_SIGHT, renderView } from './leakFuzzScene';
import { watchGl } from './strictGl';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
/** The large map and the resolution 2 run take a third of the trials, 12 at least. */
const SIDE_TRIALS = Math.max(12, Math.round(TRIALS / 3));
/** A room revealed along its own walls, and a dab of the brush across one of them. */
const KINDS = ['room', 'dab'] as const;

interface Report {
  rooms: number;
  room: number;
  dab: number;
  /** Pixels inside a room revealed along its walls that show the memory, and pixels past its walls that do. */
  revealed: number;
  leaks: number;
  /** The same of that room after everything was forgotten and the forgetting undone: the texels the undo wrote back. */
  restored: number;
  restoredLeaks: number;
  /** Pixels away from the room's walls that still show memory after the same room was forgotten again. */
  leftovers: number;
  /** Pixels well inside a dab that show the memory, those of them beyond the wall it lies across, and those that show none. */
  dabbed: number;
  beyond: number;
  missing: number;
  /** Pixels farther from a dab than its radius and the blur that show memory all the same. */
  stray: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  /** The room is revealed this much larger than it is, past its walls (the negative control). */
  overshoot?: number;
  bounds?: MapBounds;
  resolution?: number;
  /** The lighting quality the engine draws at; the walls are sealed as the rules seal them, at the map's own texel. */
  quality?: LightingQuality;
}

const reveal = (area: ExploredEdit['area']): ExploredEdit => ({ mode: 'reveal', area });
const forget = (area: ExploredEdit['area']): ExploredEdit => ({ mode: 'forget', area });

/** What `ExploredMemory` needs of a view store: the count of edits, which undo and redo move. */
function editCountingStore(): { store: ViewAtlasStore; undo: () => void } {
  const listeners = new Set<(state: ViewAtlasState) => void>();
  const state = { mapPath: 'fuzz.atlasmap', isMapLoading: false, exploredEdits: 0, setExploredMask: (): void => undefined } as unknown as ViewAtlasState;
  const count = (exploredEdits: number): void => {
    Object.assign(state, { exploredEdits });
    listeners.forEach((listener) => listener(state));
  };
  Object.assign(state, { setExploredEdits: count });
  const store = { getState: () => state, subscribe: (listener: (state: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)) } as unknown as ViewAtlasStore;
  return { store, undo: () => count(state.exploredEdits - 1) };
}

/**
 * The GM's edits of the explored memory through `ExploredMemory` and the real engine, over the
 * leak fuzz's rooms, as the players see them with no one looking.
 *
 * A room revealed along its own walls (a lasso on their centre lines) shows inside the room and
 * never past its walls: the bound is the one the memory sight records is held to, one and a half
 * memory texels, or the wall's core where that is less. The same holds once everything was
 * forgotten and that step undone, which writes the room's texels back. Forgetting the same room
 * leaves nothing but a trace on the texels of its edge, which the reveal covered in part and the
 * eraser takes the same part of (undo is what takes an edit back exactly).
 *
 * A dab of the brush across a wall reveals both sides, since the GM decides what is explored;
 * it shows nowhere beyond its own radius and the blur the composite reads the memory through.
 */
async function fuzz({ seed, trials, overshoot = 1, bounds = { width: 2048, height: 2048 }, resolution = 1, quality = DEFAULT_LIGHTING_QUALITY }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE, resolution);
  const watch = watchGl(renderer.gl);
  const engine = new LightingEngine(renderer, quality);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const { store, undo } = editCountingStore();
  let memoryTexel = 1;
  const memory = new ExploredMemory({
    renderer,
    store,
    onTexture: (texture) => {
      if (!texture) return;
      engine.setExplored(texture);
      memoryTexel = Math.max(bounds.width, bounds.height) / Math.max(texture.width, texture.height);
    },
    onTravel: () => undefined,
    onChange: () => undefined,
    guard: (work) => work(),
  });
  const device = SIZE * resolution;
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    memory.sync(bounds, null);
    const rand = rng(seed + 9);
    const report: Report = { rooms: 0, room: 0, dab: 0, revealed: 0, leaks: 0, restored: 0, restoredLeaks: 0, leftovers: 0, dabbed: 0, beyond: 0, missing: 0, stray: 0 };
    for (const room of fuzzRooms(seed, trials)) {
      // The rules seal at the map's texel; the picture is held to the texel the engine draws at.
      const texel = worldTexel(bounds, quality.maxTexels);
      const walls = sealWalls(room.walls, sealTolerance(worldTexel(bounds)));
      const outline = roomOutline(room);
      if (!insidePolygon(room.centre, room.outline)) continue;
      const kind = KINDS[report.rooms % KINDS.length]!;
      report.rooms++;
      report[kind]++;
      const [cx, cy] = room.centre;
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - cx * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - cy * scale + (rand() - 0.5) * 200;
      const shoot = (): Uint8ClampedArray => {
        engine.update({ bounds, albedo: null, walls, lights: [], sightRadius: 31, sight: NO_SIGHT, ambient: 0 });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      const filter = 1.5 / scale + 0.01;
      const each = (visit: (p: P, shown: number) => void, pixels: Uint8ClampedArray): void => {
        for (let sy = 0; sy < device; sy++) {
          for (let sx = 0; sx < device; sx++) {
            const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
            if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
            const o = (sy * device + sx) * 4;
            visit(p, pixels[o]! + pixels[o + 1]! + pixels[o + 2]!);
          }
        }
      };

      // The composite reads the memory through a blur of two memory texels; a texel shows a diagonal beyond its centre.
      const blur = 3.5 * memoryTexel + filter;
      memory.edit(forget('everything'));
      if (kind === 'room') {
        const lasso: StrokeShape = { type: 'lasso', points: outline.map(([px, py]) => ({ x: cx + (px - cx) * overshoot, y: cy + (py - cy) * overshoot })) };
        const past = (p: P): boolean => !insidePolygon(p, outline) && distToOutline(p, outline) > Math.min(1.5 * memoryTexel, wallCore(texel)) + filter;
        memory.edit(reveal(lasso));
        each((p, shown) => {
          if (insidePolygon(p, outline) && shown > 0) report.revealed++;
          if (past(p) && shown > 0) report.leaks++;
        }, shoot());
        // Everything forgotten, and that undone: the room's texels are written back from the step.
        memory.edit(forget('everything'));
        undo();
        each((p, shown) => {
          if (insidePolygon(p, outline) && shown > 0) report.restored++;
          if (past(p) && shown > 0) report.restoredLeaks++;
        }, shoot());
        memory.edit(forget(lasso));
        each((p, shown) => {
          if (distToOutline(p, outline) > blur && shown > 0) report.leftovers++;
        }, shoot());
        continue;
      }

      // A dab on the middle of one of the room's own walls, half of it on either side.
      const wall = room.walls[Math.floor(rand() * room.roomWallCount)]!;
      const centre = { x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 };
      const radius = 40 + rand() * 60;
      memory.edit(reveal({ type: 'brush', brushRadius: radius, points: [centre] }));
      const clearOfWalls = (p: P, reach: number): boolean => !walls.some((w) => distSqToSegment({ x: p[0], y: p[1] }, w.p1, w.p2) < reach * reach);
      each((p, shown) => {
        const distance = Math.hypot(p[0] - centre.x, p[1] - centre.y);
        if (distance > radius + blur && shown > 0) report.stray++;
        if (distance > radius - blur || !clearOfWalls(p, wallBand(texel) + blur)) return;
        report.dabbed++;
        if (shown === 0) report.missing++;
        else if (!insidePolygon(p, outline)) report.beyond++;
      }, shoot());
    }
    watch.stop();
    expect(watch.findings).toEqual([]);
    return report;
  } finally {
    engine.destroy();
    target.destroy(true);
    memory.destroy();
    renderer.destroy();
  }
}

/** What every run holds. */
const CLEAN = { leaks: 0, restoredLeaks: 0, leftovers: 0, missing: 0, stray: 0 };

describe('leak fuzz: explored memory edited by hand', () => {
  // The memory's debounced save plays no part here.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a room revealed along its walls nowhere past them, and a dab across a wall on both sides and nowhere beyond itself', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 21, trials: TRIALS });
    console.info(`leak fuzz (memory brush): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.6);
    expect(Math.min(report.room, report.dab)).toBeGreaterThan(TRIALS / 4);
    expect(report.revealed).toBeGreaterThan(TRIALS * 100);
    // The undo wrote back exactly what the forget had taken.
    expect(report.restored).toBe(report.revealed);
    expect(report.dabbed).toBeGreaterThan(TRIALS * 20);
    // The GM decides: a dab across a wall is remembered beyond it too.
    expect(report.beyond).toBeGreaterThan(TRIALS * 5);
    expect(report).toMatchObject(CLEAN);
  });

  it('holds on a map large enough for memory texels wider than a wall', { timeout: 600_000 }, async () => {
    const report = await fuzz({ seed: 13, trials: SIDE_TRIALS, bounds: { width: 9000, height: 9000 } });
    console.info(`leak fuzz (memory brush, large map): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.revealed).toBeGreaterThan(SIDE_TRIALS * 40);
    expect(report.restored).toBe(report.revealed);
    expect(report.dabbed).toBeGreaterThan(SIDE_TRIALS * 8);
    expect(report).toMatchObject(CLEAN);
  });

  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality on a map whose texels it coarsens', { timeout: 600_000 }, async (level) => {
    const report = await fuzz({ seed: 13, trials: SIDE_TRIALS, bounds: { width: 8192, height: 8192 }, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (memory brush, ${level}): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.revealed).toBeGreaterThan(SIDE_TRIALS * 40);
    expect(report.restored).toBe(report.revealed);
    expect(report.dabbed).toBeGreaterThan(SIDE_TRIALS * 8);
    expect(report).toMatchObject(CLEAN);
  });

  it('holds at renderer resolution 2', { timeout: 600_000 }, async () => {
    const report = await fuzz({ seed: 17, trials: SIDE_TRIALS, resolution: 2 });
    console.info(`leak fuzz (memory brush, resolution 2): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expect(report.revealed).toBeGreaterThan(SIDE_TRIALS * 80);
    expect(report.restored).toBe(report.revealed);
    expect(report).toMatchObject(CLEAN);
  });

  it('finds the memory of a room revealed past its walls (the check can fail)', async () => {
    const report = await fuzz({ seed: 21, trials: 24, overshoot: 1.08 });
    console.info(`negative control (memory brush): ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(100);
    expect(report.restoredLeaks).toBeGreaterThan(100);
  });
});
