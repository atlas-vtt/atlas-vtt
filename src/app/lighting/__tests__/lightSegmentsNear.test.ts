import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../types/wallTypes';
import { placeLight } from '../lightPlacement';
import { lightSegmentsNear } from '../lightSegmentsNear';
import { solidSegments, splitBlocking } from '../segments';

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rooms of short walls on a 70 px lattice with doors, windows, one-way and limited walls, and loose walls at any angle. */
function wallsOf(random: () => number, count: number): WallSegment[] {
  return Array.from({ length: count }, (_, i): WallSegment => {
    const lattice = random() < 0.6;
    const p1 = lattice ? { x: Math.round(random() * 20) * 70, y: Math.round(random() * 14) * 70 } : { x: random() * 1400, y: random() * 1000 };
    const p2 = lattice ? (random() < 0.5 ? { x: p1.x + 70, y: p1.y } : { x: p1.x, y: p1.y + 70 }) : { x: p1.x + (random() - 0.5) * 300, y: p1.y + (random() - 0.5) * 300 };
    const kind = random();
    return {
      id: `w${i}`, kind: 'wall', p1, p2,
      type: kind < 0.1 ? 'door' : 'solid',
      ...(kind < 0.1 && { closed: random() < 0.5 }),
      ...(kind >= 0.1 && kind < 0.18 && { direction: random() < 0.5 ? 'left' as const : 'right' as const }),
      ...(kind >= 0.18 && kind < 0.24 && { limited: true as const }),
      ...(kind >= 0.24 && kind < 0.3 && { blocks: random() < 0.5 ? 'sight' as const : 'movement' as const }),
    } as WallSegment;
  });
}

describe('lightSegmentsNear', () => {
  it('places every light where asking every wall places it', () => {
    const random = rng(23);
    let cases = 0;
    for (let trial = 0; trial < 12; trial++) {
      const walls = wallsOf(random, 40 + Math.floor(random() * 400));
      const segments = solidSegments(splitBlocking(walls, 'light'));
      const near = lightSegmentsNear(walls);
      expect(near).toBeDefined();
      for (let k = 0; k < 40; k++) {
        // On walls, beside them and in the open, with flames from a pixel to a cell.
        const onWall = walls[Math.floor(random() * walls.length)]!;
        const t = random();
        const x = k % 2 ? onWall.p1.x + (onWall.p2.x - onWall.p1.x) * t + (random() - 0.5) * 8 : random() * 1400;
        const y = k % 2 ? onWall.p1.y + (onWall.p2.y - onWall.p1.y) * t + (random() - 0.5) * 8 : random() * 1000;
        const flame = 1 + random() * 70;
        const texel = random() < 0.5 ? 2 : 1 + random() * 6;
        expect(placeLight(x, y, flame, segments, texel, near)).toEqual(placeLight(x, y, flame, segments, texel));
        cases++;
      }
    }
    expect(cases).toBe(480);
  });
});
