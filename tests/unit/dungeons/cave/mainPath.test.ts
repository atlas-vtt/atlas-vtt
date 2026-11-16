import { describe, expect, it } from 'vitest';
import { type PlannedFloor, planFloors } from '../../../../src/app/dungeons/floors/planFloors';
import { cellKey, floorRect, inRect } from '../../../../src/app/dungeons/geometry';
import { caveParams } from '../../../../src/app/dungeons/layout/cavern/caveParams';
import { CaveGrid } from '../../../../src/app/dungeons/layout/cavern/caveGrid';
import { type LaneEnd, laneEnds, laneFits, mainRoute, wideLane } from '../../../../src/app/dungeons/layout/cavern/mainPath';
import type { CellDir, DungeonDoor, DungeonStair } from '../../../../src/app/dungeons/model';
import { dungeonParams, dungeonTags } from '../../../../src/app/dungeons/params';
import { room } from '../plannedFloorFixtures';

const door = (x: number, y: number, dir: CellDir, from: number | null, to: number): DungeonDoor => ({ x, y, dir, kind: 'opening', from, to });

/** An entrance chamber, a corridor east, a junction, a corridor turning south, and the boss room. */
function winding(blocked = false): PlannedFloor {
  const rooms = [
    room(0, { x: -2, y: 1, w: 5, h: 4 }),
    room(1, { x: 4, y: 2, w: 4, h: 1, kind: 'corridor', axis: { x: 1, y: 0 } }),
    room(2, { x: 9, y: 2, w: 1, h: 1, kind: 'junction', axis: { x: 1, y: 0 } }),
    room(3, { x: 9, y: 4, w: 1, h: 3, kind: 'corridor', axis: { x: 0, y: 1 } }),
    { ...room(4, { x: 7, y: 8, w: 5, h: 5 }), boss: true },
  ];
  const doors = [door(0, 0, { x: 0, y: 1 }, null, 0), door(3, 2, { x: 1, y: 0 }, 0, 1), door(8, 2, { x: 1, y: 0 }, 1, 2), door(9, 3, { x: 0, y: 1 }, 2, 3), door(9, 7, { x: 0, y: 1 }, 3, 4)];
  const stairs: DungeonStair[] = [];
  if (blocked) {
    // Rooms above and below the corridor, each with stairwells against the wall they share with it.
    rooms.push(room(5, { x: 4, y: -2, w: 4, h: 3 }), room(6, { x: 4, y: 4, w: 4, h: 3 }));
    for (const [x, y] of [[4, -1], [6, -1], [4, 4], [6, 4]] as const) stairs.push({ x, y, w: 2, h: 2, down: { x: 0, y: 1 }, to: 1, link: stairs.length });
  }
  return { rooms, doors, stairs };
}

const FROM: LaneEnd = { kind: 'entrance' };
const TO: LaneEnd = { kind: 'room', id: 4 };

function inBlocks(lane: readonly { x: number; y: number }[]): boolean {
  const keys = new Set(lane.map((c) => cellKey(c.x, c.y)));
  const block = (ax: number, ay: number): boolean => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => keys.has(cellKey(ax + dx!, ay + dy!)));
  return lane.every((c) => [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([dx, dy]) => block(c.x + dx!, c.y + dy!)));
}

describe('the main path', () => {
  it('runs two cells wide from the entrance to the boss room', () => {
    const floor = winding();
    const route = mainRoute(floor, FROM, TO);
    expect(route).toEqual([0, 1, 2, 3, 4]);
    const lane = wideLane(new CaveGrid(floor, 0), floor, route, FROM, TO);
    expect(lane).not.toBeNull();
    expect(lane!.some((c) => c.x === 0 && c.y === 0)).toBe(true);
    expect(lane!.some((c) => inRect(floorRect(floor.rooms[4]!), c.x, c.y))).toBe(true);
    expect(inBlocks(lane!)).toBe(true);
    expect(laneFits(floor, FROM, TO)).toBe(true);
  });

  it('finds none where both side walls of a corridor on the way border other rooms’ stairwells', () => {
    const floor = winding(true);
    const route = mainRoute(floor, FROM, TO);
    expect(wideLane(new CaveGrid(floor, 0), floor, route, FROM, TO)).toBeNull();
    expect(laneFits(floor, FROM, TO)).toBe(false);
  });

  it('is found on every floor of planned caverns', () => {
    const sets = [[], ['small'], ['large'], ['winding'], ['cramped', 'compact'], ['string']];
    for (let seed = 1; seed <= 500; seed++) {
      for (const count of [1, 2, 3]) {
        const params = caveParams(dungeonParams(dungeonTags(seed, sets[seed % sets.length]!)));
        const floors = planFloors(seed * 31, params, count, true);
        floors.forEach((floor, index) => {
          const [from, to] = laneEnds(index, floors.length, floor, true);
          expect(laneFits(floor, from, to, index), `seed ${seed * 31}, ${count} floors, floor ${index}`).toBe(true);
        });
      }
    }
  }, 240_000);
});
