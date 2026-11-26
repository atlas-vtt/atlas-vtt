import { describe, expect, it } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { MAX_ONE_WAY, oneWayEnding } from '../oneWayBand';

const oneWay = (id: string, x: number, direction: 'left' | 'right'): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x, y: 0 }, p2: { x, y: 100 }, direction });
const everywhere = [-1000, -1000, 3000, 3000] as const;

describe('the one-way walls that end a light', () => {
  // A wall from (x, 0) to (x, 100) facing 'right' stops light from its east side.
  it('lists a wall the light stands on the blocking side of, with that side on its left', () => {
    expect(oneWayEnding([oneWay('a', 50, 'right')], { x: 80, y: 50 }, everywhere)).toEqual([[50, 100, 50, 0]]);
    expect(oneWayEnding([oneWay('a', 50, 'left')], { x: 20, y: 50 }, everywhere)).toEqual([[50, 0, 50, 100]]);
  });

  it('leaves out a wall the light shines through from its open side', () => {
    expect(oneWayEnding([oneWay('a', 50, 'right')], { x: 20, y: 50 }, everywhere)).toEqual([]);
  });

  it('leaves out walls outside the region the light is drawn in', () => {
    expect(oneWayEnding([oneWay('a', 50, 'right')], { x: 80, y: 50 }, [60, 0, 100, 100])).toEqual([]);
  });

  it('lists none where more than a light holds end it, so it takes the band of every one-way wall', () => {
    const walls = Array.from({ length: MAX_ONE_WAY + 1 }, (_, i) => oneWay(`w${i}`, i, 'right'));
    expect(oneWayEnding(walls, { x: 500, y: 50 }, everywhere)).toBeNull();
    expect(oneWayEnding(walls.slice(1), { x: 500, y: 50 }, everywhere)).toHaveLength(MAX_ONE_WAY);
  });
});
