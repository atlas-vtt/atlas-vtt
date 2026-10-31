/// <reference types="vite/client" />
import '../setup/obsidianDom';
import type { Container, RenderTexture, Renderer, WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { LIGHTING_QUALITY, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import { generatedDungeon, openDungeonView, round, settleGpu } from '../helpers/generatedDungeonView';

vi.mock('events', async () => import('eventemitter3'));

/** Every engine draw of the run: where it was asked from, its target's size and how long the device took for it alone. */
const draws = vi.hoisted(() => [] as { site: string; texels: number; ms: number }[]);

vi.mock('../../src/app/pixi/lighting/engine/gpu', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/app/pixi/lighting/engine/gpu')>();
  const siteOf = (): string => {
    const lines = (new Error().stack ?? '').split('\n');
    const line = lines.find((text) => /\/(engine|liquids)\//.test(text) && !/\/gpu\.ts/.test(text)) ?? '';
    return /\/([A-Za-z]+)\.ts/.exec(line)?.[1] ?? 'unknown';
  };
  return {
    ...original,
    renderInto(renderer: Renderer, container: Container, target: RenderTexture, clearColor?: [number, number, number, number]): void {
      const gl = (renderer as WebGLRenderer).gl;
      gl.finish();
      const started = performance.now();
      original.renderInto(renderer, container, target, clearColor);
      gl.finish();
      draws.push({ site: siteOf(), texels: target.width * target.height, ms: performance.now() - started });
    },
  };
});

const [WIDTH, HEIGHT, RESOLUTION] = [1440, 900, 2];

/**
 * The longest single draws of the lighting's first build on a generated dungeon, each measured
 * alone (the device finished before and after it): on Windows a driver resets after one packet
 * of two seconds, and a weak chip runs this device's work twenty to fifty times slower. Printed,
 * nothing asserted; `VITE_QUALITY` picks a level, `VITE_PX_PER_CELL` the map's scale.
 */
describe('the longest draws of a lit generated dungeon (printed)', () => {
  const levels = (import.meta.env.VITE_QUALITY ? [import.meta.env.VITE_QUALITY] : ['high']) as LightingQualityLevel[];
  for (const level of levels) {
    it(`at ${level}`, async () => {
      const built = generatedDungeon(import.meta.env.VITE_PX_PER_CELL ? { pxPerCell: Number(import.meta.env.VITE_PX_PER_CELL) } : {});
      draws.length = 0;
      const ctx = await openDungeonView(built, { quality: LIGHTING_QUALITY[level], openings: true, pane: WIDTH, paneHeight: HEIGHT, resolution: RESOLUTION });
      try {
        // Frames until the engine has nothing left to build (the pacer lets the rest through frame by frame).
        let quiet = 0;
        for (let i = 0; i < 2000 && quiet < 30; i++) {
          const before = draws.length;
          ctx.frame();
          settleGpu(ctx.gl);
          quiet = draws.length === before ? quiet + 1 : 0;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        const lights = Object.keys(ctx.view.store.getState().objects.lights ?? {}).length;
        const bySite = new Map<string, { count: number; total: number; longest: number; texels: number }>();
        for (const draw of draws) {
          const entry = bySite.get(draw.site) ?? { count: 0, total: 0, longest: 0, texels: 0 };
          entry.count++;
          entry.total += draw.ms;
          if (draw.ms > entry.longest) { entry.longest = draw.ms; entry.texels = draw.texels; }
          bySite.set(draw.site, entry);
        }
        const rows = [...bySite.entries()].sort((a, b) => b[1].longest - a[1].longest).map(([site, e]) => ({ site, draws: e.count, longestMs: round(e.longest), longestTexels: e.texels, totalMs: round(e.total) }));
        const longest = [...draws].sort((a, b) => b.ms - a.ms).slice(0, 8).map((d) => ({ site: d.site, texels: d.texels, ms: round(d.ms) }));
        console.log(JSON.stringify({ level, map: { width: built.width, height: built.height, pxPerCell: built.pxPerCell }, lights, draws: draws.length, totalMs: round(draws.reduce((sum, d) => sum + d.ms, 0)), bySite: rows, longest }, null, 1));
        expect(draws.length).toBeGreaterThan(0);
      } finally {
        ctx.destroy();
      }
    });
  }
});
