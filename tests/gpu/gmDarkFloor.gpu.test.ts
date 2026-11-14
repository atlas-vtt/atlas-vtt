import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { GM_FLOOR } from '../../src/app/lighting/lightingConstants';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS } from '../../src/app/lighting/lightingQuality';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import type { LightingMode } from '../../src/app/pixi/lighting/engine/compositeFilter';
import type { EngineLight, EngineScene } from '../../src/app/pixi/lighting/engine/types';
import { createTestRenderer, renderThroughEngine, setGmFloor, type PixelReader } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl, type GlWatch } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { darkvision } from '../../src/app/vision/__tests__/senseSources';
import { computeSight, SEES_ALL, type Sight } from '../../src/app/vision/sight';

const SIZE = 256;
const MAP = 1024;
/** The whole map on screen: one screen pixel is four world pixels. */
const SCALE = SIZE / MAP;

/** A torch in the middle of the map: bright to 35 screen px around (128, 128), gone at 70. */
const torch: EngineLight = { key: 'torch', x: 512, y: 512, bright: 140, dim: 280, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'none' };
/** A Darkness in the lower left corner, out of the torch's reach: 25 screen px around (37, 220). */
const darkness: EngineLight = { key: 'darkness', x: 150, y: 880, bright: 0, dim: 100, flame: 12, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true };
/** A token in the lower right corner that sees 80 px: all the points below lie out of its sight. */
const farSight: Sight = computeSight([{ tokenId: 'far', origin: { x: 900, y: 900 }, range: 80, senses: [] }], []);
/** A token in the upper right corner with darkvision of 120 px, at screen (200, 50). */
const darkSight: Sight = computeSight([{ tokenId: 'dark', origin: { x: 800, y: 200 }, range: 250, senses: [darkvision(120)] }], []);

type Point = readonly [number, number];
/** Floor no light reaches and no token sees. */
const UNLIT: Point = [30, 30];
/** Floor in the torch's bright range. */
const BRIGHT: Point = [148, 128];
const IN_DARKNESS: Point = [37, 220];
/** Ten screen px from the darkvision token, and floor beyond its darkvision. */
const IN_DARKVISION: Point = [210, 50];
const PAST_DARKVISION: Point = [200, 110];

interface Shot {
  tint: number;
  ambient: number;
  sight?: Sight;
  lights?: EngineLight[];
  /** The GM's floor to draw with; unset, the one Atlas ships. */
  floor?: number;
  quality?: (typeof LIGHTING_QUALITY_LEVELS)[number];
}

type Colour = readonly [number, number, number];

/** The mean colour of the 9 × 9 screen pixels around a point, which evens out the composite's dither. */
function mean(at: PixelReader, [x, y]: Point): Colour {
  let r = 0, g = 0, b = 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const pixel = at(x + dx, y + dy);
      r += pixel[0];
      g += pixel[1];
      b += pixel[2];
    }
  }
  return [r / 81, g / 81, b / 81];
}

const luma = ([r, g, b]: Colour): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** How many channels of two renders differ, over the whole frame or within `radius` screen px of `centre`. */
function differing(a: PixelReader, b: PixelReader, centre?: Point, radius = 0): number {
  let count = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (centre && Math.hypot(x - centre[0], y - centre[1]) > radius) continue;
      const one = a(x, y), other = b(x, y);
      for (let c = 0; c < 3; c++) if (one[c] !== other[c]) count++;
    }
  }
  return count;
}

/** The grey value of a tint such as 0x808080. */
const grey = (tint: number): number => tint & 0xff;

describe('the GM\'s picture of a scene without light', () => {
  const cleanup: (() => void)[] = [];
  let watch: GlWatch | null = null;
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    watch = null;
  });

  async function setUp(): Promise<WebGLRenderer> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const watching = watchGl(renderer.gl);
    cleanup.push(() => watching.stop());
    watch = watching;
    return renderer;
  }

  function shoot(renderer: WebGLRenderer, mode: LightingMode, shot: Shot): PixelReader {
    const engine = new LightingEngine(renderer, LIGHTING_QUALITY[shot.quality ?? 'high']);
    try {
      engine.setEnabled(true);
      engine.setMode(mode);
      const scene: EngineScene = { bounds: { width: MAP, height: MAP }, albedo: null, walls: [], lights: shot.lights ?? [torch], sight: shot.sight ?? farSight, sightRadius: 20, ambient: shot.ambient };
      engine.update(scene);
      engine.flush();
      if (shot.floor !== undefined) setGmFloor(engine, shot.floor);
      return renderThroughEngine(engine, renderer, { size: SIZE, scale: SCALE, x: 0, y: 0, tint: shot.tint });
    } finally {
      engine.destroy();
    }
  }

  function expectCleanGl(): void {
    expect(watch?.findings).toEqual([]);
    expect(watch?.draws()).toBeGreaterThan(0);
  }

  it.each([0, 0.2, 0.5, 1])('leaves the players\' picture as it is without the floor: ambient light %s', async (ambient) => {
    const renderer = await setUp();
    for (const sight of [farSight, SEES_ALL, darkSight]) {
      for (const tint of [0x404040, 0x808080]) {
        const shot: Shot = { tint, ambient, sight, lights: [torch, darkness] };
        expect(differing(shoot(renderer, 'player', shot), shoot(renderer, 'player', { ...shot, floor: 0 }))).toBe(0);
      }
    }
    expectCleanGl();
  });

  it('shows the players nothing of unlit floor at ambient light 0', async () => {
    const renderer = await setUp();
    const at = shoot(renderer, 'player', { tint: 0x808080, ambient: 0 });
    expect(Math.max(...mean(at, UNLIT))).toBeLessThanOrEqual(1);
    expectCleanGl();
  });

  it.each([
    { name: '#404040', tint: 0x404040 },
    { name: '#808080', tint: 0x808080 },
    { name: '#c0c0c0', tint: 0xc0c0c0 },
  ])('shows the GM unlit floor at its share of the map\'s colours, cool, and well below lit floor: floor $name', async ({ tint }) => {
    const renderer = await setUp();
    const at = shoot(renderer, 'gm', { tint, ambient: 0 });
    const without = shoot(renderer, 'gm', { tint, ambient: 0, floor: 0 });
    const [r, g, b] = mean(at, UNLIT);
    const share = GM_FLOOR.shown * grey(tint);
    // The map's own colours at the floor's share, as a black overlay would leave them, shifted to the cool grey of low light.
    expect(r).toBeGreaterThan(share - 3);
    expect(g).toBeGreaterThan(share - 3);
    expect(b).toBeLessThan(share + 6);
    expect(b).toBeGreaterThan(r);
    // What the GM had to read before: far less.
    expect(luma(mean(without, UNLIT))).toBeLessThan(0.65 * luma([r, g, b]));
    // Lit floor stands out: at least half as bright again on a dark map, twice on a mid-grey one, and warm where the floor is cool.
    const lit = mean(at, BRIGHT);
    expect(luma(lit)).toBeGreaterThan((tint === 0x404040 ? 1.5 : 2) * luma([r, g, b]));
    expect(lit[0] - lit[2]).toBeGreaterThan(r - b + 12);
    expectCleanGl();
  });

  it('keeps the map\'s contrast in the dark: a floor twice as bright shows about twice as bright', async () => {
    const renderer = await setUp();
    const dark = luma(mean(shoot(renderer, 'gm', { tint: 0x404040, ambient: 0 }), UNLIT));
    const pale = luma(mean(shoot(renderer, 'gm', { tint: 0x808080, ambient: 0 }), UNLIT));
    expect(pale / dark).toBeGreaterThan(1.8);
    expect(pale / dark).toBeLessThan(2.2);
    expectCleanGl();
  });

  it('draws the light itself exactly as without the floor', async () => {
    const renderer = await setUp();
    for (const tint of [0x404040, 0x808080]) {
      const at = shoot(renderer, 'gm', { tint, ambient: 0 });
      const without = shoot(renderer, 'gm', { tint, ambient: 0, floor: 0 });
      // Within the torch's bright range (35 screen px).
      expect(differing(at, without, [128, 128], 30)).toBe(0);
    }
    expectCleanGl();
  });

  it.each([
    { name: '#202020', tint: 0x202020, ambient: 1 },
    { name: '#404040', tint: 0x404040, ambient: 1 },
    { name: '#808080', tint: 0x808080, ambient: 1 },
    { name: '#808080', tint: 0x808080, ambient: 0.5 },
    { name: '#c0c0c0', tint: 0xc0c0c0, ambient: 0.35 },
  ])('leaves the GM\'s picture of a scene lit above the floor as it is without it: floor $name, ambient light $ambient', async ({ tint, ambient }) => {
    const renderer = await setUp();
    for (const sight of [farSight, SEES_ALL]) {
      expect(differing(shoot(renderer, 'gm', { tint, ambient, sight }), shoot(renderer, 'gm', { tint, ambient, sight, floor: 0 }))).toBe(0);
    }
    expectCleanGl();
  });

  it('shows the GM what darkvision perceives on top of the floor', async () => {
    const renderer = await setUp();
    const at = shoot(renderer, 'gm', { tint: 0x808080, ambient: 0, sight: darkSight });
    expect(luma(mean(at, IN_DARKVISION))).toBeGreaterThan(luma(mean(at, PAST_DARKVISION)) + 12);
    expectCleanGl();
  });

  it('shows the GM magical darkness as the map under its veil: bluer than unlit floor, and darker on a pale map', async () => {
    const renderer = await setUp();
    for (const tint of [0x808080, 0xc0c0c0]) {
      const at = shoot(renderer, 'gm', { tint, ambient: 0, lights: [torch, darkness] });
      const veiled = mean(at, IN_DARKNESS);
      const plain = mean(at, UNLIT);
      expect(veiled[2] - veiled[0]).toBeGreaterThan(plain[2] - plain[0] + 15);
      expect(luma(veiled)).toBeGreaterThan(8);
      // The floor's share of the map under the veil is less than outside it.
      expect(veiled[1]).toBeLessThan(plain[1] + 6);
      if (tint === 0xc0c0c0) expect(luma(veiled)).toBeLessThan(luma(plain));
    }
    expectCleanGl();
  });

  it.each(LIGHTING_QUALITY_LEVELS)('has the same floor at the %s lighting quality, in the GM\'s picture alone', async (quality) => {
    const renderer = await setUp();
    const shot: Shot = { tint: 0x808080, ambient: 0, quality };
    const [r, , b] = mean(shoot(renderer, 'gm', shot), UNLIT);
    const share = GM_FLOOR.shown * grey(shot.tint);
    expect(r).toBeGreaterThan(share - 3);
    expect(b).toBeLessThan(share + 6);
    expect(differing(shoot(renderer, 'player', shot), shoot(renderer, 'player', { ...shot, floor: 0 }))).toBe(0);
    expectCleanGl();
  });
});
