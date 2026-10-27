/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { LIGHTING_QUALITY, type LightingQuality, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import { ReflectionTiles } from '../../src/app/pixi/lighting/engine/ReflectionTiles';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import { profileCpu } from '../helpers/cpuProfile';
import { generatedDungeon, median, openDungeonView, percentile, round, settleGpu, TORCH, type DungeonView, type OutlineWalls } from '../helpers/generatedDungeonView';

vi.mock('events', async () => import('eventemitter3'));

/**
 * What one display frame of a token drag costs on a generated dungeon of three floors, as Fabian
 * drags his token: a vision token on the entry floor, the floors below seen through its opening,
 * lava, water and plants, six flickering torches, a 1440 × 900 canvas at resolution 2. Each step
 * writes the token's place to the store (every listener runs, as in a real drag) and runs one
 * display frame; measured are the CPU of both, the wall time until the graphics device finished
 * the frame (a pixel read back), the device's own time for it (`EXT_disjoint_timer_query_webgl2`,
 * which on ANGLE's Metal backend spans the gaps between command buffers too, so it reads high), and
 * whether the light the token carries was drawn where the token stands in that frame; then the
 * same drag at a display's pace (`pacedDrag`), whose time per frame is what the GM feels. The token
 * circles a column, then the middle of a room without one, each without and with a torch. Printed to
 * `out/perf-drag/`, not asserted. `VITE_QUALITY` picks a quality, `VITE_PX` the map's
 * pixels per cell (400: the maps of older builds), `VITE_OUTLINES` how the outlines of columns
 * and statues are given (`as-generated`, `two-way`, `none`), `VITE_PROFILE=drag|torch` prints a
 * CPU profile, `VITE_ABLATE` leaves parts out (below).
 */

const [WIDTH, HEIGHT, RESOLUTION] = [1440, 900, 2];
const STEPS = 60;

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

interface StepCost {
  /** CPU of the store write and its listeners. */
  write: number;
  /** CPU of the write and the display frame together. */
  cpu: number;
  /** Wall time from the write until the device finished the frame. */
  frame: number;
  /** The device's own time for the frame, where the timer could tell. */
  gpu: number | null;
  /** The carried light was not drawn at the token's place in this frame. */
  lightBehind: boolean;
}

interface Summary {
  writeMs: number;
  cpuMs: number;
  cpuP90: number;
  cpuMax: number;
  frameMs: number;
  frameP90: number;
  gpuMs: number | null;
  /** Frames in which the carried light lagged behind its token. */
  lightBehind: number;
}

/**
 * The same drag at the pace of a display: a step and its frame after another, the device left to
 * keep up as it can, one read back at the end. `frameMs` is the wall time per frame (CPU and GPU,
 * whichever is slower), `lightBehind` the frames whose carried light was not yet where its token
 * stood (the paced engine had not built its tile).
 */
interface Paced {
  frameMs: number;
  lightBehind: number;
}

/** Whether a light tile is still being built after the frame: the light map then shows that light's old tile, where it stood before. */
function tileBehind(ctx: DungeonView): boolean {
  const host = ctx.view.controller.renderer as unknown as { view: { engine?: { world: { tiles: { busy(): boolean } } | null } } };
  return host.view.engine?.world?.tiles.busy() ?? false;
}

function summary(steps: readonly StepCost[]): Summary {
  const gpu = steps.map((s) => s.gpu).filter((v): v is number => v !== null);
  return {
    writeMs: round(median(steps.map((s) => s.write))),
    cpuMs: round(median(steps.map((s) => s.cpu))),
    cpuP90: round(percentile(steps.map((s) => s.cpu), 0.9)),
    cpuMax: round(Math.max(...steps.map((s) => s.cpu))),
    frameMs: round(median(steps.map((s) => s.frame))),
    frameP90: round(percentile(steps.map((s) => s.frame), 0.9)),
    gpuMs: gpu.length ? round(median(gpu)) : null,
    lightBehind: steps.filter((s) => s.lightBehind).length,
  };
}

/** Each step's cost, the token circling `centre` at `radius` world px, one turn in `STEPS` steps. */
async function drag(ctx: DungeonView, centre: { x: number; y: number }, radius: number, carried: boolean): Promise<StepCost[]> {
  const { gl, view } = ctx;
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  const place = (i: number): { x: number; y: number } => ({ x: centre.x + Math.cos((i / STEPS) * Math.PI * 2) * radius, y: centre.y + Math.sin((i / STEPS) * Math.PI * 2) * radius });
  const step = (i: number): void => { view.store.getState().setTokenPositions([{ id: 'hero', ...place(i) }]); };
  // Put the token there and let everything settle before measuring.
  step(0);
  for (let i = 0; i < 30; i++) {
    ctx.frame();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  for (let i = 1; i <= 10; i++) { step(i); ctx.frame(); }
  const out: StepCost[] = [];
  settleGpu(gl);
  for (let i = 0; i < STEPS; i++) {
    const query = timer ? gl.createQuery() : null;
    if (query && timer) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    const started = performance.now();
    step(i);
    const written = performance.now();
    ctx.frame();
    const cpu = performance.now() - started;
    if (query && timer) gl.endQuery(timer.TIME_ELAPSED_EXT);
    const lightBehind = carried && tileBehind(ctx);
    settleGpu(gl);
    const frame = performance.now() - started;
    let gpu: number | null = null;
    if (query && timer) {
      // The result is there once the device is done; a disjoint frame (clocks changed) tells nothing.
      for (let tries = 0; tries < 20 && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE); tries++) await new Promise((resolve) => setTimeout(resolve, 1));
      if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(query);
    }
    out.push({ write: written - started, cpu, frame, gpu, lightBehind });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return out;
}

async function pacedDrag(ctx: DungeonView, centre: { x: number; y: number }, radius: number, carried: boolean): Promise<Paced> {
  const { gl, view } = ctx;
  const steps = 2 * STEPS;
  const place = (i: number): { x: number; y: number } => ({ x: centre.x + Math.cos((i / steps) * Math.PI * 2) * radius, y: centre.y + Math.sin((i / steps) * Math.PI * 2) * radius });
  view.store.getState().setTokenPositions([{ id: 'hero', ...place(0) }]);
  for (let i = 0; i < 30; i++) {
    ctx.frame();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  let behind = 0;
  // Three rounds, the median taken: other work on the machine slows a round now and then.
  const rounds: number[] = [];
  for (let round = 0; round < 3; round++) {
    settleGpu(gl);
    const started = performance.now();
    for (let i = 1; i <= steps; i++) {
      view.store.getState().setTokenPositions([{ id: 'hero', ...place(i) }]);
      ctx.frame();
      if (carried && tileBehind(ctx)) behind++;
    }
    settleGpu(gl);
    rounds.push((performance.now() - started) / steps);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { frameMs: round(median(rounds)), lightBehind: behind };
}

const levels = (import.meta.env.VITE_QUALITY ? [import.meta.env.VITE_QUALITY] : ['high', 'balanced', 'saver']) as LightingQualityLevel[];
const outlines = (import.meta.env.VITE_OUTLINES ?? 'as-generated') as OutlineWalls;
const pxPerCell = import.meta.env.VITE_PX ? Number(import.meta.env.VITE_PX) : undefined;

/**
 * `VITE_ABLATE` (comma separated) leaves parts of the lighting out, to tell what a frame's time is
 * made of: `bounce`, `reflection`, `memory` (explored memory), `below` (no openings), `rays1` (one ray a texel),
 * `composite` (the lighting layer not rendered).
 */
const ablate = new Set((import.meta.env.VITE_ABLATE ?? '').split(',').filter(Boolean));
if (ablate.has('reflection')) ReflectionTiles.prototype.sync = (): boolean => false;
function ablated(quality: LightingQuality): LightingQuality {
  return { ...quality, ...(ablate.has('bounce') && { bounceMaxSide: 0 }), ...(ablate.has('rays1') && { tileRays: 1 }) };
}

describe('the cost of a token drag on a generated dungeon of three floors (printed)', () => {
  const built = generatedDungeon({ outlines, ...(pxPerCell && { pxPerCell }) });
  const rows: string[] = [];
  afterAll(async () => {
    await commands.writeFile(`out/perf-drag/${levels.join('-')}-${built.pxPerCell}px-${outlines}${ablate.size ? `-no-${[...ablate].join('-')}` : ''}.txt`, rows.join('\n'));
  });

  it.each(levels)('at %s quality', async (level) => {
    const ctx = await openDungeonView(built, { quality: ablated(LIGHTING_QUALITY[level]), openings: !ablate.has('below'), pane: WIDTH, paneHeight: HEIGHT, resolution: RESOLUTION });
    try {
      const { view } = ctx;
      holdTokens(view.store, ['hero']);
      if (ablate.has('memory')) view.store.getState().setSceneLighting({ exploredMemory: false });
      // The lighting's work goes on, but its layer (the composite) is not drawn.
      if (ablate.has('composite')) view.viewport.children.find((child) => child.label === 'lighting')!.renderable = false;
      const radius = built.pxPerCell * 1.3;
      const result: Record<string, Summary> = {};
      const paced: Record<string, Paced> = {};
      for (const [where, centre] of [['column', built.column], ['open', built.openRoom]] as const) {
        view.store.getState().updateTokens([{ id: 'hero', changes: { light: undefined } }]);
        result[where] = summary(await drag(ctx, centre, radius, false));
        if (import.meta.env.VITE_PROFILE === 'drag' && where === 'column') {
          const taken = await profileCpu(async () => { await drag(ctx, centre, radius, false); }, 50);
          rows.push(`drag profile at ${where}, self:\n${taken.self.map(([n, ms]) => `${ms}\t${n}`).join('\n')}\ntotal:\n${taken.total.map(([n, ms]) => `${ms}\t${n}`).join('\n')}`);
        }
        paced[where] = await pacedDrag(ctx, centre, radius, false);
        view.store.getState().updateTokens([{ id: 'hero', changes: { light: TORCH } }]);
        result[`${where}+torch`] = summary(await drag(ctx, centre, radius, true));
        paced[`${where}+torch`] = await pacedDrag(ctx, centre, radius, true);
        if (import.meta.env.VITE_PROFILE === 'torch' && where === 'column') {
          const taken = await profileCpu(async () => { await drag(ctx, centre, radius, true); }, 50);
          rows.push(`torch profile at ${where}, self:\n${taken.self.map(([n, ms]) => `${ms}\t${n}`).join('\n')}\ntotal:\n${taken.total.map(([n, ms]) => `${ms}\t${n}`).join('\n')}`);
        }
      }
      holdTokens(view.store, []);
      const s = view.store.getState();
      const engine = (view.controller.renderer as unknown as { view: { engine?: { failed: boolean; hasWorld(): boolean } } }).view.engine;
      const scene = { lit: !!engine && !engine.failed && engine.hasWorld(), stageRenders: ctx.counts.stage, quality: level, mapPx: `${built.width}×${built.height}`, pxPerCell: built.pxPerCell, outlines, walls: Object.keys(s.objects.walls).length };
      rows.push(`${JSON.stringify(scene)}\n${Object.entries(result).map(([k, v]) => `  ${k.padEnd(13)} ${JSON.stringify(v)}\n  ${''.padEnd(13)} paced ${JSON.stringify(paced[k])}`).join('\n')}`);
      expect(result.column!.cpuMs).toBeGreaterThan(0);
    } finally {
      ctx.destroy();
    }
  });
});
