import { Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOUNCE, FLICKER_INTERVAL_MS } from '../../../../lighting/lightingConstants';
import { LightingWorld } from '../LightingWorld';
import { GpuPacer } from '../GpuPacer';
import { LIGHTING_QUALITY } from '../../../../lighting/lightingQuality';
import type { DrawnLight } from '../LightMap';
import type { EngineLight } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import { ANIMATION_SLOT_MS } from '../../../utils/animationFrames';

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

  it('redraws a flickering light once per slot of the map\'s animation clock', async () => {
    const { world } = await setup();
    const draw = vi.spyOn(world.lightMap, 'draw');
    // START opens a slot: the next opens a slot's length later, whatever the frame rate.
    const next = (Math.floor(START / ANIMATION_SLOT_MS) + 1) * ANIMATION_SLOT_MS;

    expect(world.animate(START + 8)).toBe(false);
    expect(world.animate(next - 1)).toBe(false);
    expect(draw).not.toHaveBeenCalled();

    expect(world.animate(next + 0.5)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(world.animate(next + 8)).toBe(false);
    expect(world.busy()).toBe(true);
  });

  it('redraws a slow swell every second slot, and nothing for lights outside the view', async () => {
    const renderer = await createTestRenderer(256);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, { width: 1024, height: 1024 });
    cleanup.push(() => world.destroy());
    world.update([], [{ ...torch, animation: 'smoulder' }], null);
    world.animate(START);
    const draw = vi.spyOn(world.lightMap, 'draw');
    const slot = (k: number): number => (Math.floor(START / ANIMATION_SLOT_MS) + k) * ANIMATION_SLOT_MS + 0.5;
    for (let k = 1; k <= 8; k++) world.animate(slot(k));
    expect(draw).toHaveBeenCalledTimes(4);
    // A view far from the light: its flicker waits.
    const away = { minX: 2000, minY: 2000, maxX: 3000, maxY: 3000 };
    for (let k = 9; k <= 16; k++) world.animate(slot(k), false, away);
    expect(draw).toHaveBeenCalledTimes(4);
    world.animate(slot(18), false, { minX: 0, minY: 0, maxX: 500, maxY: 500 });
    expect(draw).toHaveBeenCalledTimes(5);
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
    const begin = vi.spyOn(world.cascades!, 'begin');
    const draw = vi.spyOn(world.lightMap, 'draw');

    world.update([], [torch], Texture.WHITE);
    expect(world.animate(START + BOUNCE.throttleMs - 5)).toBe(false);
    expect(begin).not.toHaveBeenCalled();

    expect(world.animate(START + BOUNCE.throttleMs)).toBe(true);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(world.cascades!.building).toBe(false);
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

  it('builds the bounce as coarse per cell as on a map of 70 px cells, and anew when the cell changes it', async () => {
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const world = (cell?: number): LightingWorld => {
      const made = new LightingWorld(renderer, { width: 512, height: 512 }, LIGHTING_QUALITY.high, false, cell);
      cleanup.push(() => made.destroy());
      return made;
    };
    expect(world().cascades!.scale).toBe(1);
    expect(world(50).cascades!.scale).toBe(1);
    expect(world(140).cascades!.scale).toBe(2);
    const ordinary = world(70);
    expect(ordinary.cascades!.scale).toBe(1);
    // A cell of 90 px keeps the texel (2 px) and coarsens the bounce.
    expect(ordinary.fits(LIGHTING_QUALITY.high, 90)).toBe(false);
    expect(ordinary.fits(LIGHTING_QUALITY.high, 60)).toBe(true);
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
      const lights = Array.from({ length: 12 }, (_, i): EngineLight => ({ ...torch, key: `l${i}`, x: 500 + (i % 4) * 1000, y: 700 + Math.floor(i / 4) * 1200, bright: 350, dim: 700, flame: 70, animation: 'none' }));
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

describe('a moving light in a paced world', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  type Shown = { x: number; moving?: true } | undefined;
  const tiles = (world: LightingWorld): { tiles(): ReadonlyMap<string, Shown>; busy(): boolean } => (world as unknown as { tiles: { tiles(): ReadonlyMap<string, Shown>; busy(): boolean } }).tiles;
  const shown = (world: LightingWorld): Shown => tiles(world).tiles().get('torch');

  it('is drawn where it is in every frame, however far behind the device is, and traced in full once it rests', async () => {
    const renderer = await createTestRenderer(256);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, { width: 1024, height: 1024 }, LIGHTING_QUALITY.high, true);
    cleanup.push(() => world.destroy());
    const steady = { ...torch, animation: 'none' as const };
    world.update([], [steady], null);
    world.flush();
    expect(shown(world)).toMatchObject({ x: 300 });
    // The device runs as much as it may: nothing paced goes out.
    vi.spyOn(GpuPacer.prototype, 'allowance').mockReturnValue(0);
    world.update([], [{ ...steady, x: 340 }], null);
    expect(shown(world)).toMatchObject({ x: 300 });
    for (const x of [360, 380, 400]) {
      world.update([], [{ ...steady, x, moving: true }], null);
      expect(shown(world)).toMatchObject({ x, moving: true });
      expect(tiles(world).busy()).toBe(false);
    }
    // At rest it is traced in full as the pacer lets it through, the quick tile shown meanwhile.
    world.update([], [{ ...steady, x: 400 }], null);
    expect(shown(world)).toMatchObject({ x: 400, moving: true });
    expect(tiles(world).busy()).toBe(true);
    vi.restoreAllMocks();
    world.flush();
    expect(shown(world)).toEqual(expect.objectContaining({ x: 400 }));
    expect(shown(world)?.moving).toBeUndefined();
  });

  it('builds the bounce of a moving light a band a frame, and whole when it rests', async () => {
    const renderer = await createTestRenderer(256);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, { width: 4096, height: 4096 });
    cleanup.push(() => world.destroy());
    world.update([], [{ ...torch, animation: 'none', x: 2048, y: 2048 }], null);
    world.flush();
    const cascades = world.cascades!;
    const step = vi.spyOn(cascades, 'step');
    world.update([], [{ ...torch, animation: 'none', x: 2100, y: 2048, moving: true }], null);
    let frames = 0;
    for (let now = START + 10 * BOUNCE.throttleMs; frames === 0 || cascades.building; now += 16) {
      world.animate(now);
      frames++;
      expect(frames).toBeLessThan(100);
    }
    expect(frames).toBeGreaterThan(1);
    expect(step.mock.calls.every(([, texels]) => texels === BOUNCE.movingTexels)).toBe(true);

    step.mockClear();
    world.update([], [{ ...torch, animation: 'none', x: 2100, y: 2048 }], null);
    world.animate(START + 20 * BOUNCE.throttleMs);
    expect(step).toHaveBeenCalledTimes(1);
    expect(step.mock.calls[0]![1]).toBe(Infinity);
    expect(cascades.building).toBe(false);
  });
});
