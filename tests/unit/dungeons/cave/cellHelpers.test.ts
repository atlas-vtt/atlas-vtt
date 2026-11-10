import { describe, expect, it } from 'vitest';
import { cellsOf, doorCells, floorCellsOf, floorRect, holdsCell } from '../../../../src/app/dungeons/geometry';

describe('a room’s floor cells', () => {
  const room = { x: 2, y: 3, w: 4, h: 3 };

  it('are its rectangle while it has no mask', () => {
    expect(floorCellsOf(room)).toEqual(cellsOf(floorRect(room)));
    expect(holdsCell(room, 2, 3)).toBe(true);
    expect(holdsCell(room, 5, 5)).toBe(true);
    expect(holdsCell(room, 6, 5)).toBe(false);
  });

  it('are its mask once it has one, in its order', () => {
    const cells = [
      { x: 3, y: 4 },
      { x: 2, y: 4 },
      { x: 6, y: 4 },
    ];
    const shaped = { ...room, cells };
    expect(floorCellsOf(shaped)).toEqual(cells);
    expect(holdsCell(shaped, 6, 4)).toBe(true);
    expect(holdsCell(shaped, 2, 3)).toBe(false);
  });
});

describe('a door’s cells', () => {
  it('are its own cell, and the one beside it when it is wide', () => {
    expect(doorCells({ x: 4, y: 7 })).toEqual([{ x: 4, y: 7 }]);
    expect(doorCells({ x: 4, y: 7, wide: { x: 0, y: 1 } })).toEqual([
      { x: 4, y: 7 },
      { x: 4, y: 8 },
    ]);
  });
});
