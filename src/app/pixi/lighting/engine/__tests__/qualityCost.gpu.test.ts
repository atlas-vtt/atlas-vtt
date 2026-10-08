/// <reference types="vite/client" />
import { Container, Matrix, RenderTexture, Sprite, Texture, type TextureSource, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS, type LightingQualityLevel } from '../../../../lighting/lightingQuality';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL } from '../../../../vision/sight';
import type { MapBounds } from '../../../../vision/visibility';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { rng } from './fuzzRooms';
import { createTestRenderer } from './gpuTestUtils';

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const SCREEN = { width: 1440, height: 900 };
const FRAMES = 7;

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** Bytes per texel of the formats the engine allocates. */
const BYTES: Record<string, number> = { rgba16float: 8, r16float: 2, r8unorm: 1, rgba8unorm: 4, bgra8unorm: 4, r32float: 4, rgba32float: 16 };

/** Graphics memory of the textures `renderer` holds now, by source. */
function heldTextures(renderer: WebGLRenderer): Map<TextureSource, number> {
  return new Map(renderer.texture.managedTextures.filter((source): source is TextureSource => !!source).map((source) => [source, source.pixelWidth * source.pixelHeight * (BYTES[source.format] ?? 4) * (source.mipLevelCount > 1 ? 4 / 3 : 1)]));
}

/** Bytes of the textures `renderer` holds now that it did not hold in `before`. */
function heldBytes(renderer: WebGLRenderer, before: Map<TextureSource, number>): number {
  let bytes = 0;
  for (const [source, size] of heldTextures(renderer)) if (!before.has(source)) bytes += size;
  return bytes;
}

async function gpuMs(gl: WebGL2RenderingContext, ext: TimerExt | null, fn: () => void): Promise<number | null> {
  if (!ext) {
    fn();
    return null;
  }
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  fn();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 5));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}

function median(values: (number | null)[]): number | null {
  const kept = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  return kept.length > 0 ? Math.round(kept[Math.floor(kept.length / 2)]! * 100) / 100 : null;
}

/** 1,000 walls in chains and 40 lights over `bounds`, ten of them torches. */
function scene(bounds: MapBounds, seed: number): EngineScene {
  const rand = rng(seed);
  const walls: WallSegment[] = [];
  while (walls.length < 1000) {
    let x = rand() * bounds.width, y = rand() * bounds.height;
    for (let z = 0; z < 8; z++) {
      const a = rand() * Math.PI * 2, l = 40 + rand() * 150;
      walls.push({ id: `w${walls.length}`, kind: 'wall', type: 'solid', p1: { x, y }, p2: { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l } });
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
    }
  }
  const px = 73.89 / 5;
  const lights: EngineLight[] = Array.from({ length: 40 }, (_, i) => ({ key: `l${i}`, x: rand() * bounds.width, y: rand() * bounds.height, bright: 20 * px, dim: 40 * px, flame: 40 * px * 0.12, color: [1, 0.6, 0.3], intensity: 1, animation: i < 10 ? 'torch' : 'none' }));
  return { bounds, albedo: null, walls, lights, sight: SEES_ALL, sightRadius: 37, ambient: 0.1 };
}

interface Cost {
  level: LightingQualityLevel;
  map: string;
  texel: number;
  /** Graphics memory the lighting holds for the map, MB: its world textures, and with the composite's screen-sized textures after rendering. */
  worldMb: number;
  memoryMb: number;
  /** GPU milliseconds: the first build, the bounce, one frame of the composite over the whole map and close up, one flicker redraw. */
  build: number | null;
  bounce: number | null;
  frameFit: number | null;
  frameClose: number | null;
  flicker: number | null;
}

/** A white map lit by `engine`; each call renders one frame through a camera at `scale` centred on the map. */
function framer(renderer: WebGLRenderer, engine: LightingEngine, target: RenderTexture, bounds: MapBounds): (scale: number) => () => void {
  const stage = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(bounds.width, bounds.height);
  const world = new Container();
  world.addChild(map, engine.layer);
  stage.addChild(world);
  return (scale) => () => {
    world.scale.set(scale);
    world.position.set(SCREEN.width / 2 - (bounds.width / 2) * scale, SCREEN.height / 2 - (bounds.height / 2) * scale);
    engine.setView(new Matrix(scale, 0, 0, scale, world.x, world.y).invert(), scale);
    renderer.render({ container: stage, target, clear: true });
  };
}

async function measure(renderer: WebGLRenderer, ext: TimerExt | null, level: LightingQualityLevel, bounds: MapBounds): Promise<Cost> {
  const before = heldTextures(renderer);
  const engine = new LightingEngine(renderer, LIGHTING_QUALITY[level]);
  const target = RenderTexture.create(SCREEN);
  const lit = scene(bounds, 3);
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const build = await gpuMs(renderer.gl, ext, () => engine.update(lit));
    const bounce = await gpuMs(renderer.gl, ext, () => engine.flush());
    const worldBytes = heldBytes(renderer, before);
    const frame = framer(renderer, engine, target, bounds);
    const fit = frame(Math.min(SCREEN.width / bounds.width, SCREEN.height / bounds.height));
    const close = frame(1);
    const fits: (number | null)[] = [];
    const closes: (number | null)[] = [];
    const flickers: (number | null)[] = [];
    for (let i = 0; i < FRAMES; i++) {
      fits.push(await gpuMs(renderer.gl, ext, fit));
      closes.push(await gpuMs(renderer.gl, ext, close));
      flickers.push(await gpuMs(renderer.gl, ext, () => engine.animate(10_000 + i * 1000)));
    }
    const bytes = heldBytes(renderer, before);
    const texel = Math.max(2, Math.max(bounds.width, bounds.height) / LIGHTING_QUALITY[level].maxTexels);
    return {
      level, map: `${bounds.width}x${bounds.height}`, texel: Math.round(texel * 100) / 100, worldMb: Math.round(worldBytes / 1e5) / 10, memoryMb: Math.round(bytes / 1e5) / 10,
      build: median([build]), bounce: median([bounce]), frameFit: median(fits), frameClose: median(closes), flicker: LIGHTING_QUALITY[level].flickerMs === null ? 0 : median(flickers),
    };
  } finally {
    engine.destroy();
    target.destroy(true);
  }
}

describe('lighting quality cost', () => {
  it('holds less graphics memory at each lower quality on a large map, and measures the GPU time of each (budgets with VITE_PERF_STRICT)', { timeout: 600_000 }, async () => {
    const renderer = await createTestRenderer(64);
    try {
      const debug = renderer.gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? String(renderer.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      const timer = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      const ext = timer && !gpu.includes('SwiftShader') ? timer : null;
      // The first engine on a context compiles the shaders: measured once and dropped.
      await measure(renderer, ext, 'high', { width: 1024, height: 1024 });
      const costs: Cost[] = [];
      for (const bounds of [{ width: 3682, height: 4555 }, { width: 8192, height: 8192 }]) {
        for (const level of LIGHTING_QUALITY_LEVELS) costs.push(await measure(renderer, ext, level, bounds));
      }
      console.info(`lighting quality cost (${gpu}):\n${costs.map((cost) => JSON.stringify(cost)).join('\n')}`);
      const large = (level: LightingQualityLevel): Cost => costs.find((cost) => cost.level === level && cost.map === '8192x8192')!;
      expect(large('balanced').worldMb).toBeLessThan(large('high').worldMb / 2);
      expect(large('saver').worldMb).toBeLessThan(large('balanced').worldMb / 2);
      expect(large('saver').worldMb).toBeLessThan(30);
      if (STRICT && ext) {
        expect(large('saver').frameFit!).toBeLessThanOrEqual(large('high').frameFit! * 1.1);
      }
    } finally {
      renderer.destroy();
    }
  });
});
