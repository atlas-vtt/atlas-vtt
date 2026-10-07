import { describe, expect, it } from 'vitest';
import { LightReaches } from '../lightReaches';
import type { EngineLight } from '../../pixi/lighting/engine/types';
import type { WallSegment } from '../../types/wallTypes';

function light(key: string, x: number, dim = 100, bright = dim / 2): EngineLight {
  return { key, x, y: 0, bright, dim, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };
}

const walls: WallSegment[] = [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 50, y: -100 }, p2: { x: 50, y: 100 } }];

describe('LightReaches', () => {
  it('traces a light again only when it moved, its reach changed or the walls changed', () => {
    const cache = new LightReaches();
    const [a, b] = cache.sync([light('a', 0), light('b', 200)], walls);
    const same = cache.sync([light('a', 0), light('b', 200)], walls);
    expect(same[0]).toBe(a);
    expect(same[1]).toBe(b);

    const moved = cache.sync([light('a', 10), light('b', 200, 150)], walls);
    expect(moved[0]).not.toBe(a);
    expect(moved[0]!.origin).toEqual({ x: 10, y: 0 });
    expect(moved[1]!.dim).toBe(150);

    const rewalled = cache.sync([light('a', 10), light('b', 200, 150)], [...walls]);
    expect(rewalled[0]).not.toBe(moved[0]);
  });

  it('carries each light\'s bright radius', () => {
    expect(new LightReaches().sync([light('a', 0), light('b', 200, 150, 30)], walls).map((reach) => [reach.bright, reach.dim]))
      .toEqual([[50, 100], [30, 150]]);
  });

  it('takes a new bright radius without tracing the light again', () => {
    const cache = new LightReaches();
    const [before] = cache.sync([light('a', 0, 100, 50)], walls);
    const [after] = cache.sync([light('a', 0, 100, 80)], walls);
    expect(after!.bright).toBe(80);
    expect(after!.polygon).toBe(before!.polygon);
    expect(cache.sync([light('a', 0, 100, 80)], walls)[0]).toBe(after);
  });

  it('carries what a light is: a darkness and its priority, taken without tracing it again', () => {
    const cache = new LightReaches();
    const [before] = cache.sync([light('a', 0)], walls);
    expect(before).not.toHaveProperty('darkness');
    const [dark] = cache.sync([{ ...light('a', 0), darkness: true, priority: 1 }], walls);
    expect(dark).toMatchObject({ darkness: true, priority: 1 });
    expect(dark!.polygon).toBe(before!.polygon);
    expect(cache.sync([{ ...light('a', 0), darkness: true, priority: 1 }], walls)[0]).toBe(dark);
    const [again] = cache.sync([light('a', 0)], walls);
    expect(again).not.toHaveProperty('darkness');
    expect(again).not.toHaveProperty('priority');
  });

  it('traces a light again when its cone turns or widens, and clips its reach to the cone', () => {
    const cache = new LightReaches();
    const cone = { facing: Math.PI, angle: Math.PI / 2, apex: 5 };
    const [all] = cache.sync([light('a', 0)], walls);
    const [left] = cache.sync([{ ...light('a', 0), cone }], walls);
    expect(left!.cone).toEqual(cone);
    expect(left!.polygon).not.toBe(all!.polygon);
    expect(Math.max(...left!.polygon.map((point) => point.x))).toBeLessThanOrEqual(5.001);
    expect(cache.sync([{ ...light('a', 0), cone: { ...cone } }], walls)[0]).toBe(left);
    const [turned] = cache.sync([{ ...light('a', 0), cone: { ...cone, facing: 0 } }], walls);
    expect(turned!.polygon).not.toBe(left!.polygon);
    expect(Math.min(...turned!.polygon.map((point) => point.x))).toBeGreaterThanOrEqual(-5.001);
    expect(cache.sync([light('a', 0)], walls)[0]).not.toHaveProperty('cone');
  });

  it('drops lights that are gone', () => {
    const cache = new LightReaches();
    cache.sync([light('a', 0), light('b', 200)], walls);
    expect(cache.sync([light('b', 200)], walls).map((reach) => reach.origin.x)).toEqual([200]);
  });
});
