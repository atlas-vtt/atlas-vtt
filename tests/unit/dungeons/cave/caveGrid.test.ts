import { describe, expect, it } from 'vitest';
import { cellKey } from '../../../../src/app/dungeons/geometry';
import { CaveGrid, ROCK, doorOwner } from '../../../../src/app/dungeons/layout/cavern/caveGrid';
import type { DungeonStair } from '../../../../src/app/dungeons/model';
import { plannedFloor } from '../plannedFloorFixtures';

/** Two 4 × 4 rooms side by side, a door between them, a stairwell against the second's far wall. */
function twoRooms(): ReturnType<typeof plannedFloor> {
  const stair: DungeonStair = { x: 7, y: 2, w: 2, h: 2, down: { x: 0, y: 1 }, to: 1, link: 0 };
  return plannedFloor(
    [
      { x: 0, y: 0, w: 4, h: 4, axis: { x: 1, y: 0 } },
      { x: 5, y: 0, w: 4, h: 4, axis: { x: 1, y: 0 } },
    ],
    [[0, 1, 4, 1, 'opening']],
    [stair],
  );
}

describe('a cave grid', () => {
  it('knows each room’s rectangle as its envelope and owns door cells by their doors', () => {
    const grid = new CaveGrid(twoRooms(), 0);
    expect(grid.envelope(0, 0)).toBe(0);
    expect(grid.envelope(8, 3)).toBe(1);
    expect(grid.envelope(4, 2)).toBe(ROCK);
    expect(grid.owner(4, 1)).toBe(doorOwner(1));
    expect(grid.owner(0, -1)).toBe(doorOwner(0));
  });

  it('lets a room take only cells no other room’s cells touch, and the cells across its own door', () => {
    const grid = new CaveGrid(twoRooms(), 0);
    grid.claim(3, 3, 0);
    expect(grid.mayClaim(4, 3, 1)).toBe(false);
    expect(grid.mayClaim(4, 4, 1)).toBe(false);
    expect(grid.mayClaim(5, 2, 1)).toBe(true);
    // Room 0's cell before the door and room 1's lie across the door from each other.
    expect(grid.holds(3, 1, 0)).toBe(true);
    expect(grid.holds(5, 1, 1)).toBe(true);
    expect(grid.mayClaim(4, 0, doorOwner(1))).toBe(true);
    // A door touches only the two rooms it joins: the entrance only room 0.
    grid.claim(5, 3, 1);
    expect(grid.mayClaim(4, 3, doorOwner(1))).toBe(true);
    expect(grid.mayClaim(4, 3, doorOwner(0))).toBe(false);
  });

  it('keeps the cells before doors, the stairwells and the rows they are reached from', () => {
    const grid = new CaveGrid(twoRooms(), 0);
    const kept = grid.required(1);
    for (const c of [{ x: 5, y: 1 }, { x: 7, y: 2 }, { x: 8, y: 3 }, { x: 7, y: 1 }, { x: 8, y: 1 }]) expect(kept.has(cellKey(c.x, c.y))).toBe(true);
    expect(kept.has(cellKey(7, 4))).toBe(false);
    expect(grid.required(0).has(cellKey(3, 1))).toBe(true);
    expect(grid.cellsOf(1).length).toBe(kept.size);
  });
});
