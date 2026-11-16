import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../../types';
import type { SceneLighting } from '../../../types/lightingTypes';
import { readRgba } from '../engine/__tests__/gpuTestUtils';
import { watchGl, type GlWatch } from '../engine/__tests__/strictGl';
import type { ExploredTexture } from '../ExploredTexture';
import { createHarness, visionToken, type Harness } from './rendererHarness';

/** Two rooms, left and right of a wall at x = 128 with a doorway from y = 96 to 160. */
const WALLS = {
  north: { id: 'north', kind: 'wall', type: 'solid', p1: { x: 128, y: 0 }, p2: { x: 128, y: 96 } },
  south: { id: 'south', kind: 'wall', type: 'solid', p1: { x: 128, y: 160 }, p2: { x: 128, y: 256 } },
};
const START = { x: 48, y: 128 };
const END = { x: 208, y: 128 };
/** Across the doorway, on the way of the drag. */
const PATH = [80, 112, 144, 176, END.x];
/** A corner of the right room that the doorway hides from `START`, and one of the left room it hides from `END`. */
const RIGHT_CORNER = { x: 220, y: 30 };
const LEFT_CORNER = { x: 40, y: 30 };

const NO_LIGHTS = {};
const HERO = visionToken(START.x, START.y);
const TORCH_BEARER = { ...HERO, light: { bright: 2, dim: 4, color: '#ffffff', intensity: 1, animation: 'none' } } as TokenEntity;

describe('LightingRenderer sight on drop', () => {
  let harness: Harness | null = null;
  let watch: GlWatch | null = null;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
  });

  afterEach(() => {
    watch?.stop();
    watch = null;
    harness?.dispose();
    harness = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A move changes only the token's place, as in the store: its vision and light stay the same objects. */
  function tokenAt(x: number, token: TokenEntity): Record<string, unknown> {
    return { objects: { walls: WALLS, lights: NO_LIGHTS, tokens: { t: { ...token, x } } } };
  }

  /** A scene that waits for the drop, the option under test, unless `waits` is false: then it says nothing of it but what `lighting` does. */
  async function setup(lighting: Partial<SceneLighting> = {}, token = HERO, waits = true): Promise<Harness> {
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 1, ...(waits && { sightOnDrop: true }), ...lighting }, ...tokenAt(START.x, token) } });
    await harness.settle();
    watch = watchGl(harness.renderer.gl);
    return harness;
  }

  /** The explored memory, every texel of it. */
  function memory({ renderer, lighting }: Harness): Uint8ClampedArray {
    const { texture } = (lighting as unknown as { memory: { texture: ExploredTexture } }).memory;
    return readRgba(renderer, texture.texture).slice();
  }

  /** How many values of the explored memory differ from `before`. */
  function changedSince(before: Uint8ClampedArray, h: Harness): number {
    return memory(h).reduce((count, value, index) => count + (value === before[index] ? 0 : 1), 0);
  }

  /** The token is taken and dragged along `PATH`, each position written to the store as a drag does. */
  function drag(h: Harness, token = HERO): void {
    h.change({ heldTokens: { t: START } });
    for (const x of PATH) {
      h.change(tokenAt(x, token));
      h.renderStage();
      h.tick();
    }
  }

  it('leaves the explored memory as it is while a vision token is dragged through a doorway, and records at the drop', async () => {
    const h = await setup();
    expect(h.redAt(LEFT_CORNER.x, LEFT_CORNER.y)).toBe(255);
    expect(h.redAt(RIGHT_CORNER.x, RIGHT_CORNER.y)).toBe(0);
    h.renderStage();
    const before = memory(h);

    drag(h);
    expect(h.lighting.currentSight().regions.map((region) => region.origin)).toEqual([START]);
    expect(changedSince(before, h)).toBe(0);

    h.change({ heldTokens: {} });
    expect(h.lighting.currentSight().regions.map((region) => region.origin)).toEqual([END]);
    expect(h.redAt(RIGHT_CORNER.x, RIGHT_CORNER.y)).toBe(255);
    h.renderStage();
    expect(watch!.findings).toEqual([]);
  });

  it('draws nothing for sight or light while the token is dragged: only the drop rebuilds', async () => {
    const h = await setup({ ambient: 0 }, TORCH_BEARER);
    h.renderStage();
    h.tick();
    const sight = h.lighting.currentSight();
    const reach = h.lighting.lightReaches()[0];
    expect(reach?.origin).toEqual(START);

    h.change({ heldTokens: { t: START } });
    const draws = watch!.draws();
    for (const x of PATH) h.change(tokenAt(x, TORCH_BEARER));
    expect(watch!.draws()).toBe(draws);
    expect(h.lighting.currentSight()).toBe(sight);
    expect(h.lighting.lightReaches()[0]).toBe(reach);

    h.change({ heldTokens: {} });
    expect(watch!.draws()).toBeGreaterThan(draws);
    expect(h.lighting.currentSight().regions.map((region) => region.origin)).toEqual([END]);
    expect(h.lighting.lightReaches()[0]?.origin).toEqual(END);
    expect(watch!.findings).toEqual([]);
  });

  it('keeps a carried light, and what it shows, where the drag began', async () => {
    const h = await setup({ ambient: 0 }, TORCH_BEARER);
    // In the dark only what the torch lights is remembered: the token's surroundings.
    expect(h.redAt(START.x + 10, START.y)).toBe(255);
    expect(h.redAt(END.x + 10, END.y)).toBe(0);
    h.renderStage();
    const before = memory(h);

    drag(h, TORCH_BEARER);
    expect(changedSince(before, h)).toBe(0);

    h.change({ heldTokens: {} });
    expect(h.redAt(END.x + 10, END.y)).toBe(255);
    expect(watch!.findings).toEqual([]);
  });

  it('keeps the light of a dragged token without vision where the drag began, though the party looks on', async () => {
    const bearer = { ...TORCH_BEARER, id: 'b', x: 88, vision: undefined } as unknown as TokenEntity;
    const scene = (x: number): Record<string, unknown> => ({ objects: { walls: WALLS, lights: NO_LIGHTS, tokens: { t: HERO, b: { ...bearer, x } } } });
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 0, sightOnDrop: true }, ...scene(88) } });
    const h = harness;
    await h.settle();
    watch = watchGl(h.renderer.gl);
    expect(h.redAt(98, START.y)).toBe(255);
    expect(h.redAt(END.x + 10, END.y)).toBe(0);
    h.renderStage();
    const before = memory(h);

    h.change({ heldTokens: { b: { x: 88, y: START.y } } });
    const draws = watch.draws();
    for (const x of PATH) h.change(scene(x));
    expect(watch.draws()).toBe(draws);
    expect(h.lighting.lightReaches()[0]?.origin).toEqual({ x: 88, y: START.y });
    h.renderStage();
    expect(changedSince(before, h)).toBe(0);

    h.change({ heldTokens: {} });
    expect(h.lighting.lightReaches()[0]?.origin).toEqual(END);
    expect(h.redAt(END.x + 10, END.y)).toBe(255);
    expect(watch.findings).toEqual([]);
  });

  it('draws nothing while a token that neither sees nor carries a light is dragged, alone or with the party', async () => {
    const mule = { id: 'm', x: 60, y: 60 } as unknown as TokenEntity;
    const scene = (dx: number, heroToo: boolean): Record<string, unknown> => ({
      objects: { walls: WALLS, lights: NO_LIGHTS, tokens: { t: heroToo ? { ...HERO, x: START.x + dx } : HERO, m: { ...mule, x: 60 + dx } } },
    });
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 1, sightOnDrop: true }, ...scene(0, false) } });
    const h = harness;
    await h.settle();
    watch = watchGl(h.renderer.gl);
    h.renderStage();

    for (const heroToo of [false, true]) {
      h.change({ heldTokens: heroToo ? { t: START, m: { x: 60, y: 60 } } : { m: { x: 60, y: 60 } } });
      const draws = watch.draws();
      for (const dx of [30, 60, 90, 120]) h.change(scene(dx, heroToo));
      expect(watch.draws()).toBe(draws);
      h.change({ heldTokens: {} });
      h.change(scene(0, false));
    }
    expect(watch.findings).toEqual([]);
  });

  it('follows the drag and records along the way in a scene that does not wait for the drop: by default, or because it says so', async () => {
    for (const lighting of [{}, { sightOnDrop: false }]) {
      const h = await setup(lighting, HERO, false);
      drag(h);
      // A drag's sight goes into the memory at most every 100 ms: the last waits for its turn.
      await new Promise((resolve) => setTimeout(resolve, 120));
      h.tick();
      expect(h.lighting.currentSight().regions.map((region) => region.origin)).toEqual([END]);
      expect(h.redAt(RIGHT_CORNER.x, RIGHT_CORNER.y)).toBe(255);
      expect(watch!.findings).toEqual([]);
      watch!.stop();
      h.dispose();
      harness = null;
    }
  });
});
