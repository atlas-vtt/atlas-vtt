import { afterEach, describe, expect, it } from 'vitest';
import { REFLECTION, wallRadius } from '../../../../lighting/lightingConstants';
import type { WallSegment } from '../../../../types/wallTypes';
import { LightReaches } from '../../../../vision/lightReaches';
import { reflectedAt } from '../../../../vision/reflectedLight';
import { pointInPolygon } from '../../../../vision/visibility';
import { LightingWorld } from '../LightingWorld';
import type { EngineLight } from '../types';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import { watchGl } from './strictGl';

const MAP = 1024;
const CELL = 50;

function wall(x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id: `w${x1},${y1},${x2},${y2}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

/** Room A (0..400 square) and room B (520..900 × 0..400), joined at their south ends by a corridor (400..520 × 320..400). */
const ROOMS = [
  wall(0, 0, 400, 0), wall(0, 0, 0, 400), wall(0, 400, 900, 400), wall(400, 0, 400, 320),
  wall(400, 320, 520, 320), wall(520, 320, 520, 0), wall(520, 0, 900, 0), wall(900, 0, 900, 400),
];
const TORCH: EngineLight = { key: 'torch', x: 300, y: 250, bright: 200, dim: 400, flame: 20, color: [1, 1, 1], intensity: 1, animation: 'none' };

/**
 * A light's reflection in the light map (`ReflectionTiles`, the light map's own pass): drawn under
 * the strict context, lit where the rule counts it, nothing past the walls, and gone with its light.
 */
describe('reflected light in the light map', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  it('lights the room round the corner where the rule counts it, past no wall, under a strict context', async () => {
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    const sampling = { spacing: CELL / 4, clearance: wallRadius(2) };
    const [reach] = new LightReaches().sync([TORCH], ROOMS, sampling, { ...sampling, reach: REFLECTION.cells * CELL });
    const light = { ...TORCH, reflection: reach!.reflection! };
    const world = new LightingWorld(renderer, { width: MAP, height: MAP });
    cleanup.push(() => world.destroy());
    world.update(ROOMS, [light], null);
    world.flush();
    expect(watch.findings).toEqual([]);
    const texels = readFloats(renderer, world.lightMap.texture);
    const width = world.lightMap.texture.source.pixelWidth;
    const at = (x: number, y: number): number => texels[(Math.floor(y / 2) * width + Math.floor(x / 2)) * 4]!;
    // In room B, round the corner, where only the reflection reaches: lit next to the points it comes from, fading towards its edge.
    expect(pointInPolygon({ x: 560, y: 330 }, reach!.polygon)).toBe(false);
    expect(reflectedAt({ x: 560, y: 330 }, light.reflection)).toBe(true);
    let brightest = 0;
    for (let x = 524; x < 640; x += 2) {
      for (let y = 322; y < 398; y += 2) {
        const near = light.reflection.some((part) => Math.hypot(x - part.origin.x, y - part.origin.y) < 0.3 * part.reach && pointInPolygon({ x, y }, part.polygon));
        if (near && !pointInPolygon({ x, y }, reach!.polygon)) brightest = Math.max(brightest, at(x, y));
      }
    }
    expect(brightest).toBeGreaterThan(0.1 * REFLECTION.level);
    // Nothing above the corridor's roof, in the rock between the rooms, nor north of room B's south-west corner past its wall.
    for (let x = 404; x < 518; x += 2) for (let y = 4; y < 316; y += 6) expect([x, y, at(x, y)]).toEqual([x, y, 0]);
    // Without its reflection the room round the corner is dark.
    world.update(ROOMS, [TORCH], null);
    world.flush();
    expect(readFloats(renderer, world.lightMap.texture)[(Math.floor(330 / 2) * width + Math.floor(560 / 2)) * 4]).toBe(0);
  });
});
