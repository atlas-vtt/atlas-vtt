import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL } from '../../../../vision/sight';
import type { MapBounds } from '../../../../vision/visibility';
import type { EngineLight, EngineScene } from '../types';
import { rng } from './fuzzRooms';

/** 1,000 walls in chains and 40 lights over `bounds`, ten of them flickering torches: what the cost tests light. */
export function costScene(bounds: MapBounds, seed: number): EngineScene {
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
