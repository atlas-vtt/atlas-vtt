import { describe, expect, it } from 'vitest';
import { readRoomSizes, roomSizesOf } from '../../src/app/stores/roomsSlice';

describe('room sizes', () => {
  it('follow the grid until a scene has its own: the brush 90 % of a cell across, the bucket seven brushes', () => {
    expect(roomSizesOf({ grid: { size: 70 } })).toEqual({ brushSize: 32, bucketRadius: 224 });
    expect(roomSizesOf({ grid: { size: 800 } })).toEqual({ brushSize: 300, bucketRadius: 1500 });
    expect(roomSizesOf({ grid: null })).toEqual({ brushSize: 32, bucketRadius: 224 });
    expect(roomSizesOf({ grid: { size: 70 }, roomSizes: { brushSize: 20, bucketRadius: 100 } })).toEqual({ brushSize: 20, bucketRadius: 100 });
  });

  it('are read from a map file within their limits, nested, or not at all', () => {
    expect(readRoomSizes({ brushSize: 5000, bucketRadius: 60 })).toEqual({ brushSize: 300, bucketRadius: 300 });
    expect(readRoomSizes({ brushSize: '40', bucketRadius: 60 })).toBeUndefined();
    expect(readRoomSizes(null)).toBeUndefined();
  });
});
