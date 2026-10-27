import { describe, expect, it } from 'vitest';
import { LIGHT_REST_MS, LightMotion } from '../lightMotion';
import { LightReaches } from '../lightReaches';
import type { EngineLight } from '../../pixi/lighting/engine/types';
import type { WallSegment } from '../../types/wallTypes';

const at = (key: string, x: number): { key: string; x: number; y: number } => ({ key, x, y: 0 });

describe('which lights are moving', () => {
  it('counts a light as moving from the moment it moves until it has kept its place for the rest time', () => {
    const motion = new LightMotion();
    expect([...motion.note([at('torch', 0), at('lamp', 500)], 0)]).toEqual([]);
    expect(motion.restsAt()).toBeNull();
    expect([...motion.note([at('torch', 10), at('lamp', 500)], 16)]).toEqual(['torch']);
    expect(motion.restsAt()).toBe(16 + LIGHT_REST_MS);
    expect([...motion.note([at('torch', 10), at('lamp', 500)], 16 + LIGHT_REST_MS - 1)]).toEqual(['torch']);
    expect([...motion.note([at('torch', 10), at('lamp', 500)], 16 + LIGHT_REST_MS)]).toEqual([]);
    expect(motion.restsAt()).toBeNull();
  });

  it('takes a light seen for the first time, or again after it was gone, as at rest', () => {
    const motion = new LightMotion();
    motion.note([at('torch', 0)], 0);
    motion.note([], 10);
    expect([...motion.note([at('torch', 40)], 20)]).toEqual([]);
  });

  it('says when the first moving light comes to rest', () => {
    const motion = new LightMotion();
    motion.note([at('a', 0), at('b', 0)], 0);
    motion.note([at('a', 1), at('b', 0)], 10);
    motion.note([at('a', 1), at('b', 1)], 50);
    expect(motion.restsAt()).toBe(10 + LIGHT_REST_MS);
  });
});

describe('the reflection of a moving light', () => {
  const walls: WallSegment[] = [
    { id: 'w1', kind: 'wall', type: 'solid', p1: { x: 0, y: -200 }, p2: { x: 0, y: 200 } },
    { id: 'w2', kind: 'wall', type: 'solid', p1: { x: 150, y: -200 }, p2: { x: 150, y: 20 } },
  ];
  const sampling = { spacing: 17.5, clearance: 3 };
  const reflection = { ...sampling, reach: 200 };
  const light: EngineLight = { key: 'torch', x: 60, y: 0, bright: 150, dim: 300, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };

  it('is there while it moves, worked out where the light now is', () => {
    const reaches = new LightReaches();
    const [resting] = reaches.sync([light], walls, sampling, reflection);
    expect(resting!.reflection?.length).toBeGreaterThan(0);
    const [moved] = reaches.sync([{ ...light, x: 70 }], walls, sampling, reflection);
    expect(moved!.reflection?.length).toBeGreaterThan(0);
    expect(moved!.reflection).not.toBe(resting!.reflection);
  });
});
