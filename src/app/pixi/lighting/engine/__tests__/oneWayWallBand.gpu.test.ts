import { afterEach, describe, expect, it } from 'vitest';
import { LIGHTING_QUALITY } from '../../../../lighting/lightingQuality';
import type { WallSegment } from '../../../../types/wallTypes';
import { PolygonWorld } from '../PolygonWorld';
import { MAX_ONE_WAY } from '../oneWayBand';
import type { EngineLight } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import { watchGl } from './strictGl';

/** At the saver quality a texel of this map is 4 world px, so a wall's band is about three texels wide. */
const bounds = { width: 4096, height: 4096 };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, direction?: 'left' | 'right'): WallSegment => ({
  id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...(direction && { direction }),
});
/** A corridor from x 600 to 1400 between y 900 and 1100, closed at both ends. */
const CORRIDOR = [wall('top', 600, 900, 1400, 900), wall('bottom', 600, 1100, 1400, 1100), wall('west', 600, 900, 600, 1100), wall('east', 1400, 900, 1400, 1100)];
/** Across the corridor at x 1000; light from the west (its open side) passes it, light from the east ends at it. */
const ONE_WAY = wall('one-way', 1000, 900, 1000, 1100, 'right');
const TWO_WAY = wall('two-way', 1000, 900, 1000, 1100);
const lamp = (x: number): EngineLight => ({ key: 'lamp', x, y: 1000, bright: 120, dim: 260, flame: 1, color: [1, 1, 1], intensity: 1, animation: 'none' });
const lava = (x: number): EngineLight => ({
  ...lamp(x), key: 'lava', bright: 40, dim: 160,
  surface: [{ x: x - 20, y: 980 }, { x: x + 20, y: 980 }, { x: x + 20, y: 1020 }, { x: x - 20, y: 1020 }],
});

function largestDifference(a: Float32Array, b: Float32Array): number {
  let most = 0;
  for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs(a[i]! - b[i]!));
  return most;
}

describe('one-way walls in the polygon picture', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The light map's red channel of a polygon world showing `walls` and `lights`. */
  async function lightMap(walls: readonly WallSegment[], lights: readonly EngineLight[]): Promise<{ red: (x: number, y: number) => number; all: Float32Array }> {
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    const world = new PolygonWorld(renderer, bounds, LIGHTING_QUALITY.saver);
    cleanup.push(() => world.destroy());
    world.update(walls, lights, null);
    const all = readFloats(renderer, world.lightMap.texture);
    expect(watch.findings).toEqual([]);
    const width = world.lightMap.texture.source.pixelWidth;
    const red = (x: number, y: number): number => all[(Math.floor(y / world.texel) * width + Math.floor(x / world.texel)) * 4]!;
    return { red, all };
  }

  it('lets a light from its open side through without a dark stripe, as if the wall were not there', async () => {
    const withWall = await lightMap([...CORRIDOR, ONE_WAY], [lamp(900)]);
    const without = await lightMap(CORRIDOR, [lamp(900)]);
    for (let x = 960; x <= 1060; x += 2) expect([x, withWall.red(x, 1000)]).toEqual([x, without.red(x, 1000)]);
    expect(withWall.red(1004, 1000)).toBeGreaterThan(0.1);
    expect(largestDifference(withWall.all, without.all)).toBe(0);
  });

  it('ends a light from its blocking side at it, as a wall that stops light both ways does', async () => {
    const oneWay = await lightMap([...CORRIDOR, ONE_WAY], [lamp(1100)]);
    const twoWay = await lightMap([...CORRIDOR, TWO_WAY], [lamp(1100)]);
    for (let x = 960; x <= 1000; x += 2) expect([x, oneWay.red(x, 1000)]).toEqual([x, 0]);
    expect(largestDifference(oneWay.all, twoWay.all)).toBeLessThan(1e-3);
  });

  it('ends an area light at it from either side, as the rule does', async () => {
    for (const x of [900, 1100]) {
      const withWall = await lightMap([...CORRIDOR, ONE_WAY], [lava(x)]);
      const beyond = x < 1000 ? [1000, 1010, 1020, 1060] : [940, 980, 990, 1000];
      for (const at of beyond) expect([x, at, withWall.red(at, 1000)]).toEqual([x, at, 0]);
    }
  });

  it('still ends a light at it where more one-way walls than a light lists stand in its reach', async () => {
    // Short one-way walls along the corridor's north wall, each blocking from the lamp's side.
    const crowd = Array.from({ length: MAX_ONE_WAY + 4 }, (_, i) => wall(`crowd-${i}`, 1010 + i * 5, 904, 1012 + i * 5, 904, 'left'));
    const oneWay = await lightMap([...CORRIDOR, ONE_WAY, ...crowd], [lamp(1100)]);
    for (let x = 960; x <= 1000; x += 2) expect([x, oneWay.red(x, 1000)]).toEqual([x, 0]);
  });
});
