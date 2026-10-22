import { Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOUNCE, FLICKER_INTERVAL_MS, LIGHT_REACH } from '../../../../lighting/lightingConstants';
import { LightingWorld } from '../LightingWorld';
import { LIGHTING_QUALITY } from '../../../../lighting/lightingQuality';
import type { DrawnLight } from '../LightMap';
import type { EngineLight } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';

const torch: EngineLight = { key: 'torch', x: 300, y: 300, bright: 60, dim: 120, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'torch' };
const START = 10_000;

describe('LightingWorld.animate', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  /** A world with one torch whose bounce and first flicker frame were drawn at `START`. */
  async function setup(): Promise<{ renderer: WebGLRenderer; world: LightingWorld }> {
    const renderer = await createTestRenderer(256);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, { width: 1024, height: 1024 });
    cleanup.push(() => world.destroy());
    world.update([], [torch], null);
    expect(world.animate(START)).toBe(true);
    return { renderer, world };
  }

  it('redraws a flickering light only once per flicker interval', async () => {
    const { world } = await setup();
    const draw = vi.spyOn(world.lightMap, 'draw');

    expect(world.animate(START + 8)).toBe(false);
    expect(world.animate(START + FLICKER_INTERVAL_MS - 1)).toBe(false);
    expect(draw).not.toHaveBeenCalled();

    expect(world.animate(START + FLICKER_INTERVAL_MS)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(world.animate(START + FLICKER_INTERVAL_MS + 8)).toBe(false);
    expect(world.busy()).toBe(true);
  });

  it('flickers the brightness and the bright radius of a light, never where it ends', async () => {
    const { world } = await setup();
    const draw = vi.spyOn(world.lightMap, 'draw');
    for (let frame = 1; frame <= 40; frame++) world.animate(START + frame * 2 * FLICKER_INTERVAL_MS);
    const drawn = draw.mock.calls.map(([lights]) => lights[0] as DrawnLight);
    expect(drawn).toHaveLength(40);
    expect(new Set(drawn.map((light) => light.intensity)).size).toBeGreaterThan(10);
    expect(new Set(drawn.map((light) => light.bright)).size).toBeGreaterThan(10);
    for (const light of drawn) {
      expect(light.dim).toBe(torch.dim);
      expect(light.reach).toBe(torch.dim * LIGHT_REACH);
    }
  });

  it('puts the flicker back at once after a moved light was redrawn steady', async () => {
    const { world } = await setup();
    const draw = vi.spyOn(world.lightMap, 'draw');

    world.update([], [{ ...torch, x: 320 }], null);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(world.animate(START + 1)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('builds a dirty bounce when it is due, between flicker redraws too', async () => {
    const { world } = await setup();
    expect(world.animate(START + BOUNCE.throttleMs - 10)).toBe(true);
    const build = vi.spyOn(world.cascades!, 'build');
    const draw = vi.spyOn(world.lightMap, 'draw');

    world.update([], [torch], Texture.WHITE);
    expect(world.animate(START + BOUNCE.throttleMs - 5)).toBe(false);
    expect(build).not.toHaveBeenCalled();

    expect(world.animate(START + BOUNCE.throttleMs)).toBe(true);
    expect(build).toHaveBeenCalledTimes(1);
    // Steady for the bounce, then flickering again
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('keeps a flickering light steady and builds no bounce where the quality saves them', async () => {
    const renderer = await createTestRenderer(256);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, { width: 1024, height: 1024 }, LIGHTING_QUALITY.saver);
    cleanup.push(() => world.destroy());
    const draw = vi.spyOn(world.lightMap, 'draw');
    world.update([], [torch], Texture.WHITE);
    expect(world.cascades).toBeNull();
    expect(world.busy()).toBe(false);
    expect(world.animate(START)).toBe(false);
    expect(world.animate(START + 10 * FLICKER_INTERVAL_MS)).toBe(false);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('draws the lights steady at once when flicker is switched off', async () => {
    const { world } = await setup();
    world.animate(START + FLICKER_INTERVAL_MS);
    const draw = vi.spyOn(world.lightMap, 'draw');
    world.setFlicker(null);
    expect(draw).toHaveBeenCalledTimes(1);
    expect((draw.mock.calls[0]![0][0] as DrawnLight).intensity).toBe(torch.intensity);
    expect(world.busy()).toBe(false);
    world.setFlicker(66);
    expect(world.busy()).toBe(true);
    expect(world.animate(START + 10_000)).toBe(true);
  });

  it('holds its textures to the quality\'s texels on large maps, and keeps the finest texel on small ones', async () => {
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const sizes = (side: number, quality: typeof LIGHTING_QUALITY.high): [number, number] => {
      const world = new LightingWorld(renderer, { width: side, height: side }, quality);
      try {
        return [world.texel, world.lightMap.texture.source.pixelWidth];
      } finally {
        world.destroy();
      }
    };
    expect(sizes(8192, LIGHTING_QUALITY.high)).toEqual([2, 4096]);
    expect(sizes(8192, LIGHTING_QUALITY.balanced)).toEqual([4, 2048]);
    expect(sizes(8192, LIGHTING_QUALITY.saver)).toEqual([8, 1024]);
    expect(sizes(2048, LIGHTING_QUALITY.saver)).toEqual([2, 1024]);
    const balanced = new LightingWorld(renderer, { width: 4096, height: 4096 }, LIGHTING_QUALITY.balanced);
    cleanup.push(() => balanced.destroy());
    expect(balanced.cascades).not.toBeNull();
    expect(balanced.fits(LIGHTING_QUALITY.balanced)).toBe(true);
    expect(balanced.fits({ ...LIGHTING_QUALITY.high, tileRays: LIGHTING_QUALITY.balanced.tileRays })).toBe(true);
    // The same texel and bounce, but its tiles were traced with fewer rays.
    expect(balanced.fits(LIGHTING_QUALITY.high)).toBe(false);
    expect(balanced.fits(LIGHTING_QUALITY.saver)).toBe(false);
  });
});

describe('a paced LightingWorld', () => {
  it('builds a scene too large for one batch over several frames, to the light map built at once', async () => {
    const renderer = await createTestRenderer(64);
    const bounds = { width: 4096, height: 4096 };
    const paced = new LightingWorld(renderer, bounds, LIGHTING_QUALITY.saver, true);
    const atOnce = new LightingWorld(renderer, bounds, LIGHTING_QUALITY.saver);
    try {
      const walls = [{ id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 1000, y: 600 }, p2: { x: 1000, y: 3400 } }];
      const lights = Array.from({ length: 12 }, (_, i): EngineLight => ({ ...torch, key: `l${i}`, x: 500 + (i % 4) * 1000, y: 700 + Math.floor(i / 4) * 1200, bright: 300, dim: 600, flame: 70, animation: 'none' }));
      paced.update(walls, lights, null);
      expect(paced.busy()).toBe(true);
      let frames = 0;
      while (paced.busy() && frames < 2000) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        paced.animate(performance.now());
        frames++;
      }
      expect(paced.busy()).toBe(false);
      expect(frames).toBeGreaterThan(1);
      atOnce.update(walls, lights, null);
      expect(Array.from(readFloats(renderer, paced.lightMap.texture))).toEqual(Array.from(readFloats(renderer, atOnce.lightMap.texture)));
    } finally {
      atOnce.destroy();
      paced.destroy();
      renderer.destroy();
    }
  }, 120_000);
});
