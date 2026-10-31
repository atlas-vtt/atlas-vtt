/// <reference types="vite/client" />
import { Container, Matrix, RenderTexture, Sprite, Texture, WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS, type LightingQualityLevel } from '../../../../lighting/lightingQuality';
import { computeSight, lightReach } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineScene } from '../types';
import { costScene } from './costScene';
import { readRgba } from './gpuTestUtils';

/**
 * What a frame of the lit map costs on a Retina-sized canvas (1440 × 900 points at resolution 2),
 * the map filling the screen, in the players' view with three tokens' sight: 1,000 walls and 40
 * lights on a 4,096 px map. Printed, wall clock until a pixel is read back, one render at a time
 * (what a frame waits for; timer queries do not hold on ANGLE): the world's first build, a frame
 * at rest, and a step of a drag that moves a light (its reach worked out beforehand, as the scene
 * model works it out for the rules whatever the picture). `VITE_QUALITY` picks a level (a software
 * renderer takes minutes for `high`); `VITE_PERF_STRICT` holds the polygon picture under the
 * traced ones.
 */

const SCREEN = { width: 1440, height: 900 };
const BOUNDS = { width: 4096, height: 4096 };
const SAMPLES = 7;
const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const levels = (import.meta.env.VITE_QUALITY ? [import.meta.env.VITE_QUALITY] : [...LIGHTING_QUALITY_LEVELS]) as LightingQualityLevel[];

interface Cost {
  level: LightingQualityLevel;
  build: number;
  frame: number;
  /** The same frame with the lighting layer hidden: the map alone, what the lighting adds to. */
  unlit: number;
  dragStep: number;
  /** Mean of the colour channels: the picture is lit at all. */
  lit: number;
}

/** Waits until the graphics device has drawn `target`: a pixel of it read back, bound through PIXI so its state stays true. */
function settle(renderer: WebGLRenderer, target: RenderTexture): void {
  renderer.renderTarget.bind({ target, clear: false });
  renderer.gl.readPixels(0, 0, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, new Uint8Array(4));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)]! * 100) / 100;
}

/** Wall-clock ms of `work` until the graphics device has done it. */
function timed(renderer: WebGLRenderer, target: RenderTexture, work: () => void): number {
  settle(renderer, target);
  const started = performance.now();
  work();
  settle(renderer, target);
  return performance.now() - started;
}

async function measure(renderer: WebGLRenderer, level: LightingQualityLevel): Promise<Cost> {
  const quality = { ...LIGHTING_QUALITY[level] };
  if (import.meta.env.VITE_ABLATE === 'ratio') delete quality.compositePixelRatio;
  const engine = new LightingEngine(renderer, quality);
  const target = RenderTexture.create({ ...SCREEN, resolution: 2 });
  const stage = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(BOUNDS.width, BOUNDS.height);
  const world = new Container();
  world.addChild(map, engine.layer);
  stage.addChild(world);
  const base = costScene(BOUNDS, 3);
  const tokens = [[1600, 1700], [2100, 2000], [2400, 1500]].map(([x, y], i) => ({ tokenId: `t${i}`, origin: { x: x!, y: y! }, range: 4000, senses: [] }));
  // The rule's reaches, worked out before any timing as the scene model works them out for every
  // quality: a drag step pays for its light's polygon whatever the picture.
  const sight = import.meta.env.VITE_ABLATE === 'sight' ? base.sight : computeSight(tokens, base.walls);
  const lightsAt = (step: number): EngineScene['lights'] => base.lights.map((light, i) => {
    const placed = i === 0 ? { ...light, x: 2000 + step * 7, y: 1800, moving: true as const } : { ...light, animation: 'none' as const };
    return { ...placed, area: lightReach({ x: placed.x, y: placed.y }, placed.dim, base.walls, placed.bright).polygon };
  });
  const scenes = Array.from({ length: SAMPLES + 1 }, (_, step): EngineScene => ({ ...base, lights: lightsAt(step), sight }));
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const scale = 1;
    world.position.set(SCREEN.width / 2 - 2000 * scale, SCREEN.height / 2 - 1800 * scale);
    engine.setView(new Matrix(scale, 0, 0, scale, world.x, world.y).invert(), scale);
    const render = (): void => renderer.render({ container: stage, target, clear: true });
    const build = timed(renderer, target, () => {
      engine.update(scenes[0]!);
      engine.flush();
      render();
    });
    const frames: number[] = [];
    for (let i = 0; i < SAMPLES; i++) frames.push(timed(renderer, target, render));
    engine.layer.visible = false;
    const unlit: number[] = [];
    for (let i = 0; i < SAMPLES; i++) unlit.push(timed(renderer, target, render));
    engine.layer.visible = true;
    const steps: number[] = [];
    for (let i = 1; i <= SAMPLES; i++) {
      steps.push(timed(renderer, target, () => {
        engine.update(scenes[i]!);
        engine.animate(performance.now());
        render();
      }));
    }
    const pixels = readRgba(renderer, target);
    let sum = 0;
    for (let o = 0; o < pixels.length; o += 4) sum += pixels[o]! + pixels[o + 1]! + pixels[o + 2]!;
    return { level, build: Math.round(build * 100) / 100, frame: median(frames), unlit: median(unlit), dragStep: median(steps), lit: Math.round((sum / (pixels.length * 0.75)) * 10) / 10 };
  } finally {
    engine.destroy();
    target.destroy(true);
    stage.destroy({ children: true });
  }
}

describe('the cost of a lit frame (printed)', () => {
  it('draws the players\' picture of a large lit map at each quality', { timeout: 1_800_000 }, async () => {
    // The filter system clips a filter to the renderer's own screen: it is the canvas' size, as in the app.
    const renderer = new WebGLRenderer();
    await renderer.init({ ...SCREEN, resolution: 2, antialias: false, backgroundAlpha: 1 });
    try {
      const debug = renderer.gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? String(renderer.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      // The first engine on a context compiles the shaders: measured once and dropped.
      for (const level of levels) await measure(renderer, level);
      const costs: Cost[] = [];
      for (const level of levels) costs.push(await measure(renderer, level));
      console.info(`lit frame cost (${gpu}):\n${costs.map((cost) => JSON.stringify(cost)).join('\n')}`);
      for (const cost of costs) expect(cost.lit).toBeGreaterThan(5);
      const saver = costs.find((cost) => cost.level === 'saver');
      const traced = costs.filter((cost) => cost.level !== 'saver');
      if (STRICT && saver) for (const other of traced) expect(saver.frame).toBeLessThanOrEqual(other.frame * 1.1);
    } finally {
      renderer.destroy();
    }
  });
});
