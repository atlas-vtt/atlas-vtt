import type { DungeonDoor, DungeonModel } from '../../../../src/app/dungeons/model';
import { addRoom, emptyModel, entryFloor } from '../../../fixtures/dungeonModelBuilder';

/**
 * A small house on one floor, its walls on cell edges: a hall (0) with the front door, a corridor (1)
 * reached by a two-cell opening, two rooms (2, 3) off the corridor, a closet (4) behind a secret
 * door from room 2, a chimney stack between rooms 2 and 3, and three windows.
 *
 *   x: 0  1  2  3 | 4  5  6 | 7 | 8  9 10
 *   y0 [ hall    ]  corridor (1)
 *   y1 [         ]  corridor (1)
 *   y2 [         ] [ room 2 ][st][ room 3 ]
 *   y3 [         ] [        ][c4][        ]
 *   y4 [         ] [        ][c4][        ]
 *   front door below the hall at x = 1.
 */
export function edgeHouse(): DungeonModel {
  const model: DungeonModel = { ...emptyModel(11), theme: 'mansion' };
  const floor = entryFloor(model);
  floor.walls = 'edges';
  addRoom(floor, { x: 0, y: 0, w: 4, h: 5 });
  addRoom(floor, { x: 4, y: 0, w: 7, h: 2, kind: 'corridor' });
  addRoom(floor, { x: 4, y: 2, w: 3, h: 3 });
  addRoom(floor, { x: 8, y: 2, w: 3, h: 3 });
  addRoom(floor, { x: 7, y: 3, w: 1, h: 2, kind: 'room' });
  const door = (input: Omit<DungeonDoor, 'edge'>): void => {
    floor.doors.push({ ...input, edge: true });
  };
  door({ x: 1, y: 5, dir: { x: 0, y: -1 }, kind: 'door', from: null, to: 0 });
  door({ x: 3, y: 0, dir: { x: 1, y: 0 }, kind: 'opening', from: 0, to: 1, wide: { x: 0, y: 1 } });
  door({ x: 5, y: 1, dir: { x: 0, y: 1 }, kind: 'door', from: 1, to: 2 });
  door({ x: 9, y: 1, dir: { x: 0, y: 1 }, kind: 'door', from: 1, to: 3 });
  door({ x: 6, y: 3, dir: { x: 1, y: 0 }, kind: 'secret', from: 2, to: 4 });
  floor.stacks = [{ x: 7, y: 2, w: 1, h: 1 }];
  floor.windows = [
    { x: 3, y: 4, dir: { x: 0, y: 1 }, room: 0 },
    { x: 5, y: 4, dir: { x: 0, y: 1 }, room: 2 },
    { x: 10, y: 3, dir: { x: 1, y: 0 }, room: 3 },
  ];
  return model;
}
