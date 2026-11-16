import { BufferImageSource, Texture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { lightFade } from '../../../../lighting/lightingConstants';
import { srgbToLinear } from '../../../../lighting/srgb';
import type { UnitScale } from '../../../../lighting/lightingUnits';
import type { LightEmission } from '../../../../types/lightingTypes';
import type { Point } from '../../../../types/visionTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { LightReaches } from '../../../../vision/lightReaches';
import { areaDistance } from '../../../../vision/areaReach';
import { engineLight } from '../../../../vision/lightSources';
import { SEES_ALL } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight } from '../types';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 512;
const MAP = 1024;
const FLOOR = 0x808080;
/** 5 ft cells of 35 px: bright 10 ft is 70 px, dim 30 ft is 210 px from the shore. */
const SCALE: UnitScale = { unitDistance: 5, cellSize: 35 };
const LAVA: LightEmission = { bright: 10, dim: 30, color: '#ffffff', intensity: 1, animation: 'none' };
/** An L of lava, its eastern shore at x 500 from y 420 to 600, with a notch at (450, 420). */
const POOL: Point[] = [{ x: 350, y: 350 }, { x: 450, y: 350 }, { x: 450, y: 420 }, { x: 500, y: 420 }, { x: 500, y: 600 }, { x: 350, y: 600 }];

function flatMap(colour: number): Texture {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff, 255], i);
  return new Texture({ source: new BufferImageSource({ resource: pixels, width: 4, height: 4 }) });
}

function luminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255);
}

describe('an area light in the picture', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The players' picture of the lava on a grey floor without ambient light, as luminance by world point. */
  async function picture(walls: WallSegment[] = []): Promise<{ at: (point: Point) => number; light: EngineLight }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const albedo = flatMap(FLOOR);
    cleanup.push(() => albedo.destroy(true));
    const light = engineLight({ key: 'lava', x: 425, y: 475, emission: LAVA, area: POOL }, SCALE);
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update({ bounds: { width: MAP, height: MAP }, albedo, walls, lights: [light], sight: SEES_ALL, sightRadius: 20, ambient: 0 });
    engine.flush();
    const read = renderThroughEngine(engine, renderer, { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: FLOOR, map: MAP });
    // The area's passes, its distance field and its slot in the light map are valid under the strict context.
    expect(watch.findings).toEqual([]);
    return { light, at: (point) => luminance(read(Math.floor((point.x * SIZE) / MAP), Math.floor((point.y * SIZE) / MAP))) };
  }

  it('is brightest on the lava, falls off from its shore as a light from its flame, and ends at its dim radius', async () => {
    const { at, light } = await picture();
    const fromShore = (d: number): number => at({ x: 500 + d, y: 510 });
    const level = fromShore(light.bright / 2);
    for (const inside of [{ x: 425, y: 475 }, { x: 360, y: 590 }, { x: 495, y: 430 }]) expect(at(inside)).toBeGreaterThanOrEqual(level);
    // The dim range fades from its bright radius, lit halfway and nearly dark at its edge, and nothing is left past it.
    expect(fromShore((light.bright + light.dim) / 2)).toBeGreaterThan(0.05 * level);
    expect(fromShore(light.dim - 6)).toBeLessThan(0.1 * level);
    expect(fromShore(light.dim + 8)).toBeLessThan(0.02 * level);
    // It only falls with distance, and nowhere steeply: no ring.
    let steepest = 0;
    for (let d = 2; d < light.dim + 8; d += 2) {
      const drop = fromShore(d) - fromShore(d + 2);
      expect(drop).toBeGreaterThan(-0.01 * level);
      steepest = Math.max(steepest, drop / 2);
    }
    expect((steepest * light.dim) / 100 / level).toBeLessThan(0.12);
  });

  /**
   * Where the rule counts a point lit through a narrow view of the lava past a wall's end, the
   * picture gives it the share of the lava it sees, which may be little: such points are counted,
   * and must be few. Straight behind the wall nothing may show at all.
   */
  it('agrees with the rule: lit where the rule counts it, dark where it counts nothing', async () => {
    const walls: WallSegment[] = [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 560, y: 380 }, p2: { x: 560, y: 640 } }];
    const { at, light } = await picture(walls);
    const reaches = new LightReaches().sync([light], walls, { spacing: SCALE.cellSize / 4, clearance: 3 });
    const level = at({ x: 500 + light.bright / 2, y: 510 });
    let lit = 0;
    let unlit = 0;
    let dark = 0;
    for (let y = 300; y < 760; y += 6) {
      for (let x = 250; x < 900; x += 6) {
        const point = { x, y };
        const rule = lightLevelAt(point, { ambient: 0 }, reaches);
        // Away from the wall (its capsule and the filtering beside it) and from the rule's edges.
        if (Math.abs(x - 560) < 8) continue;
        // The picture fades to nothing at the dim radius: where it has faded to under a fifth, it is not asked.
        if (rule !== 'dark' && lightFade(light.bright, light.dim, areaDistance(point, reaches[0]!)) < 0.2) continue;
        if (rule !== 'dark') {
          lit++;
          if (at(point) < 0.02 * level) unlit++;
        } else if (x > 560 && y > 400 && y < 620) {
          // Straight behind the wall, beyond its ends' penumbrae.
          dark++;
          expect(at(point), `dark at ${x}, ${y}`).toBeLessThan(0.02 * level);
        }
      }
    }
    console.info(`area light: ${lit} points the rule counts lit, ${unlit} of them dark in the picture; ${dark} dark behind the wall`);
    expect(lit).toBeGreaterThan(2000);
    expect(unlit / lit).toBeLessThan(0.03);
    expect(dark).toBeGreaterThan(200);
  });
});
