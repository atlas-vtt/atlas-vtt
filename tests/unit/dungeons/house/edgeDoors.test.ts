import { describe, expect, it } from 'vitest';
import { doorCells, doorMiddle, doorSide, doorwayCells } from '../../../../src/app/dungeons/geometry';
import type { DungeonDoor } from '../../../../src/app/dungeons/model';
import { houseCells } from '../../../../src/app/dungeons/geometry';
import { doorwayShape, houseRoomShape, INNER_WALL, OUTER_WALL } from '../../../../src/app/dungeons/render/houseShapes';
import { visibleFloor } from '../../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { edgeHouse } from './edgeFixtures';

const cellDoor: DungeonDoor = { x: 4, y: 2, dir: { x: 1, y: 0 }, kind: 'door', from: 0, to: 1 };
const edgeDoor: DungeonDoor = { ...cellDoor, edge: true };

describe('doors on edges', () => {
  it('stand in no cell, and open on the cell of each room beside their edge', () => {
    expect(doorwayCells(cellDoor)).toEqual(doorCells(cellDoor));
    expect(doorwayCells(edgeDoor)).toEqual([]);
    expect(doorSide(cellDoor, 0)).toEqual([{ x: 3, y: 2 }]);
    expect(doorSide(cellDoor, 1)).toEqual([{ x: 5, y: 2 }]);
    expect(doorSide(edgeDoor, 0)).toEqual([{ x: 4, y: 2 }]);
    expect(doorSide(edgeDoor, 1)).toEqual([{ x: 5, y: 2 }]);
    expect(doorSide(edgeDoor, 7)).toEqual([]);
  });

  it('have their middle on the edge', () => {
    expect(doorMiddle(cellDoor)).toEqual({ x: 4.5, y: 2.5 });
    expect(doorMiddle(edgeDoor)).toEqual({ x: 5, y: 2.5 });
    expect(doorMiddle({ ...edgeDoor, wide: { x: 0, y: 1 } })).toEqual({ x: 5, y: 3 });
  });

  it('draw rooms back from their walls and join them through doorways', () => {
    const model = edgeHouse();
    const floor = model.floors[0]!;
    const house = houseCells(floor);
    expect(house.has('7,2')).toBe(true);
    // The hall faces the outside on its left, top and bottom, and the corridor on its right.
    expect(houseRoomShape(floor.rooms[0]!, house)).toEqual({ kind: 'rect', x: OUTER_WALL / 2, y: OUTER_WALL / 2, w: 4 - OUTER_WALL / 2 - INNER_WALL / 2, h: 5 - OUTER_WALL });
    const rooms = new Map(floor.rooms.map((room) => [room.id, room]));
    const opening = doorwayShape(floor.doors[1]!, rooms, house);
    expect(opening.y).toBe(OUTER_WALL / 2);
    expect(opening.h).toBeCloseTo(2 - OUTER_WALL / 2 - INNER_WALL / 2);
    expect(opening.x).toBeLessThan(4 - INNER_WALL / 2);
    expect(opening.x + opening.w).toBeGreaterThan(4 + INNER_WALL / 2);
    // The front door's doorway reaches the wall's outer face.
    const front = doorwayShape(floor.doors[0]!, rooms, house);
    expect(front.y + front.h).toBeCloseTo(5 + OUTER_WALL / 2);
  });

  it('leave a secret door wall and every other door a doorway, the openings drawn as wide as they are', () => {
    const visible = visibleFloor(edgeHouse(), DEFAULT_VIEW);
    expect(visible.floors).toHaveLength(5 + 4);
    expect([...visible.wide].map((door) => door.kind)).toEqual(['opening']);
  });
});
