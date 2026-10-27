import { describe, expect, it } from 'vitest';
import { holdsCell } from '../../../../src/app/dungeons/geometry';
import { placeWater } from '../../../../src/app/dungeons/water';
import { room } from '../plannedFloorFixtures';

describe('water in a cave', () => {
  it('rises from the level only in the rooms it is given', () => {
    const rooms = [room(0, { x: 0, y: 0, w: 6, h: 6 }), room(1, { x: 7, y: 0, w: 6, h: 6 }), room(2, { x: 14, y: 0, w: 6, h: 6 })];
    for (let seed = 1; seed <= 20; seed++) {
      const { waterCells } = placeWater(seed, 0, rooms, { level: 0.9, pools: new Set(), rooms: new Set([1]) });
      expect(waterCells.length).toBeGreaterThan(0);
      expect(waterCells.every((c) => holdsCell(rooms[1]!, c.x, c.y))).toBe(true);
    }
  });
});
