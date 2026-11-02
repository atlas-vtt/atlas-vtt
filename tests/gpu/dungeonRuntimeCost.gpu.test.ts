/// <reference types="vite/client" />
import '../setup/obsidianDom';
import type { TextureSource, WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import { LIGHTING_QUALITY, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import type { LightEmission } from '../../src/app/types/lightingTypes';
import { profileCpu } from '../helpers/cpuProfile';
import { generatedDungeon, median, openDungeonView, round, settleGpu, TORCH as FLICKERING_TORCH, type DungeonView } from '../helpers/generatedDungeonView';

vi.mock('events', async () => import('eventemitter3'));

/**
 * What a generated dungeon of three floors costs at runtime, on a Retina-sized canvas, as Fabian
 * plays one: the entry floor viewed, the floors below seen through its openings, lava, water and
 * plants, torches in the rooms and a vision token. Printed, nothing timed is
 * asserted: `VITE_QUALITY` picks a level, `VITE_PROFILE=idle|drag|torch` prints a CPU profile, `VITE_STEADY` keeps the
 * torches from flickering.
 */

const [WIDTH, HEIGHT, RESOLUTION] = [1440, 900, 2];
const BYTES: Record<string, number> = { rgba8unorm: 4, bgra8unorm: 4, rgba16float: 8, rgba32float: 16, r8unorm: 1, r16float: 2, r32float: 4, rg16float: 4, rg8unorm: 2 };
const TORCH: LightEmission = import.meta.env.VITE_STEADY ? { ...FLICKERING_TORCH, animation: 'none' } : FLICKERING_TORCH;

function textureMb(renderer: WebGLRenderer): number {
  const managed = (renderer.texture as unknown as { managedTextures: TextureSource[] }).managedTextures;
  return managed.filter((source) => !!source).reduce((sum, source) => sum + source.pixelWidth * source.pixelHeight * (BYTES[source.format] ?? 4) * (source.antialias ? 4 : 1), 0) / 1e6;
}

interface Measured { cpu: number; cpuMax: number; frame: number }

interface Opened extends DungeonView {
  level: LightingQualityLevel;
  /** Draws the composite on every pixel of the canvas (true) or at the quality's pixel ratio (false). */
  fullRatio: (on: boolean) => void;
}

describe('the cost of a generated dungeon of three floors at runtime (printed)', () => {
  const built = generatedDungeon();

  /** The view of the entry floor at `level`; with `openings` false the floors below are never seen (no opening on any floor). */
  async function open(level: LightingQualityLevel, openings: boolean): Promise<Opened> {
    const ctx = await openDungeonView(built, { quality: LIGHTING_QUALITY[level], openings, pane: WIDTH, paneHeight: HEIGHT, resolution: RESOLUTION });
    return {
      ...ctx, level,
      fullRatio: (on) => {
        const quality = { ...LIGHTING_QUALITY[level] };
        if (on) delete quality.compositePixelRatio;
        ctx.setQuality(quality);
      },
    };
  }


  /**
   * CPU of `step` and its display frame (median and worst), and the wall time until the graphics
   * device finished it (`frame`: CPU and GPU together, median), `count` times. Timer queries are no
   * use here: on ANGLE's Metal backend one spans the gaps between the command buffers a paced
   * engine commits.
   */
  async function measure(ctx: Opened, count: number, step: (i: number) => void): Promise<Measured> {
    const cpu: number[] = [];
    const frame: number[] = [];
    settleGpu(ctx.gl);
    for (let i = 0; i < count; i++) {
      const started = performance.now();
      step(i);
      ctx.frame();
      cpu.push(performance.now() - started);
      settleGpu(ctx.gl);
      frame.push(performance.now() - started);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { cpu: round(median(cpu)), cpuMax: round(Math.max(...cpu)), frame: round(median(frame)) };
  }

  /** Stage renders and pictures of levels below a second at rest, and how many ms of each second the frames take until the graphics device is done, in real time. */
  async function idleSecond(ctx: Opened): Promise<{ renders: number; belowDraws: number; busyMsPerSecond: number }> {
    const before = { ...ctx.counts };
    let busy = 0;
    settleGpu(ctx.gl);
    const end = performance.now() + 2000;
    while (performance.now() < end) {
      const started = performance.now();
      ctx.frame();
      settleGpu(ctx.gl);
      busy += performance.now() - started;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { renders: (ctx.counts.stage - before.stage) / 2, belowDraws: (ctx.counts.below - before.below) / 2, busyMsPerSecond: round(busy / 2) };
  }

  /**
   * Time (ms) one stage render takes the graphics device at full pace, as the scheduler draws it
   * (the levels below prepared first): 30 renders back to back, then a pixel read back. At rest,
   * moving (a camera a pixel off each render draws the levels below anew, as a zoom or pan does),
   * and with parts of the stage hidden.
   */
  async function throughput(ctx: Opened): Promise<Record<string, number>> {
    const { view, gl } = ctx;
    const lighting = view.viewport.children.find((child) => child.label === 'lighting')!;
    const liquids = view.viewport.children.find((child) => child.label === 'liquids')!;
    const time = async (setup: () => void): Promise<number> => {
      const runs: number[] = [];
      for (let run = 0; run < 5; run++) {
        settleGpu(gl);
        const started = performance.now();
        for (let i = 0; i < 30; i++) {
          setup();
          view.controller.renderer.prepareBelow?.();
          view.app.renderer.render({ container: view.app.stage });
        }
        settleGpu(gl);
        runs.push((performance.now() - started) / 30);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return round(median(runs));
    };
    const x0 = view.viewport.x;
    let nudge = 0;
    const moving = (): void => { view.viewport.x = x0 + (nudge++ % 2); };
    const out: Record<string, number> = {};
    out.atRest = await time(() => undefined);
    if (ctx.view.app.renderer.resolution > (LIGHTING_QUALITY[ctx.level].compositePixelRatio ?? Infinity)) {
      // The composite on every pixel against the quality's ratio, in turn, as the device's clocks drift:
      // back to back (the device's throughput) and one render at a time (what a frame waits for).
      const single = async (): Promise<number> => {
        const runs: number[] = [];
        for (let i = 0; i < 20; i++) {
          settleGpu(gl);
          const started = performance.now();
          view.controller.renderer.prepareBelow?.();
          view.app.renderer.render({ container: view.app.stage });
          settleGpu(gl);
          runs.push(performance.now() - started);
        }
        return median(runs);
      };
      const samples: Record<string, number[]> = { atRestEveryPixel: [], atRestReduced: [], frameEveryPixel: [], frameReduced: [] };
      for (let round = 0; round < 3; round++) {
        ctx.fullRatio(true);
        samples.atRestEveryPixel!.push(await time(() => undefined));
        samples.frameEveryPixel!.push(await single());
        ctx.fullRatio(false);
        samples.atRestReduced!.push(await time(() => undefined));
        samples.frameReduced!.push(await single());
      }
      for (const [name, values] of Object.entries(samples)) out[name] = round(median(values));
    }
    out.moving = await time(moving);
    liquids.visible = false;
    out.movingNoLiquids = await time(moving);
    lighting.visible = false;
    out.movingMapAlone = await time(moving);
    lighting.visible = true;
    liquids.visible = true;
    view.viewport.x = x0;
    return out;
  }

  const levels = (import.meta.env.VITE_QUALITY ? [import.meta.env.VITE_QUALITY] : ['high', 'balanced', 'saver']) as LightingQualityLevel[];
  const cases = levels.flatMap((level) => [[level, true], [level, false]] as const);

  it.each(cases)('at %s quality, floors below seen: %s', async (level, openings) => {
    const ctx = await open(level, openings);
    try {
      const { view } = ctx;
      // The build settles: tiles, bounce, the levels below.
      for (let i = 0; i < 90; i++) {
        ctx.frame();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const memoryMb = round(textureMb(view.app.renderer as WebGLRenderer));
      const idle = await idleSecond(ctx);
      if (import.meta.env.VITE_PROFILE === 'idle') {
        const taken = await profileCpu(async () => { await idleSecond(ctx); }, 40);
        console.info(`idle profile, self:\n${taken.self.map(([n, ms]) => `${ms}\t${n}`).join('\n')}\ntotal:\n${taken.total.map(([n, ms]) => `${ms}\t${n}`).join('\n')}`);
      }
      const render = await throughput(ctx);
      const zoom0 = view.viewport.scale.x;
      const belowBeforeZoom = ctx.counts.below;
      const zoom = await measure(ctx, 30, (i) => { view.viewport.scale.set(zoom0 * (1 + 0.5 * Math.sin(i / 5))); });
      const belowPerZoom = round((ctx.counts.below - belowBeforeZoom) / 30);
      view.viewport.scale.set(zoom0);
      holdTokens(view.store, ['hero']);
      const cell = built.pxPerCell;
      const step = (i: number): void => { view.store.getState().setTokenPositions([{ id: 'hero', x: built.hero.x + (i % 20) * cell * 0.15, y: built.hero.y + Math.sin(i / 4) * cell * 0.3 }]); };
      const belowBefore = ctx.counts.below;
      const drag = await measure(ctx, 40, step);
      const belowPerStep = round((ctx.counts.below - belowBefore) / 40);
      const profile = async (name: string): Promise<void> => {
        if (import.meta.env.VITE_PROFILE !== name) return;
        const taken = await profileCpu(async () => { await measure(ctx, 40, (i) => step(i + 3)); }, 60);
        console.info(`${name} profile, self:\n${taken.self.map(([n, ms]) => `${ms}\t${n}`).join('\n')}\ntotal:\n${taken.total.map(([n, ms]) => `${ms}\t${n}`).join('\n')}`);
      };
      await profile('drag');
      // The hero takes up a torch: its light follows every step.
      view.store.getState().updateTokens([{ id: 'hero', changes: { light: TORCH } }]);
      await measure(ctx, 10, step);
      const torchDrag = await measure(ctx, 40, step);
      await profile('torch');
      holdTokens(view.store, []);
      const s = view.store.getState();
      const snapshot = (view.controller.renderer as unknown as { view: { levelsBelow: { grid: { width: number; height: number; texel: number } | null } } }).view.levelsBelow.grid;
      const scene = { mapPx: `${built.width}×${built.height}`, pxPerCell: built.pxPerCell, walls: Object.keys(s.objects.walls).length, lights: Object.keys(s.objects.lights).length, liquids: Object.keys(s.objects.liquids ?? {}).length };
      console.info(`dungeon runtime cost at ${level}, floors below seen ${openings}: ${JSON.stringify({ ...scene, memoryMb, idle, render, zoom, belowPerZoom, ...(snapshot && { snapshot: `${snapshot.width}×${snapshot.height} at ${round(snapshot.texel)} px` }), drag, belowPerStep, torchDrag })}`);
      expect(drag.cpu).toBeGreaterThan(0);
    } finally {
      ctx.destroy();
    }
  });
});
