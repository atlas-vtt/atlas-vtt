import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../../src/app/dungeons/generate';
import { branchesOf } from '../../../../../src/app/dungeons/layout/branches';
import { caveParams, withVeins } from '../../../../../src/app/dungeons/layout/cavern/caveParams';
import { REGULAR_ZONE, type WorkRoom } from '../../../../../src/app/dungeons/layout/workLayout';
import type { CaveWay, DungeonFloor } from '../../../../../src/app/dungeons/model';
import { dungeonParams } from '../../../../../src/app/dungeons/params';
import { rngFrom, stream } from '../../../../../src/app/dungeons/rng';
import { readTags } from '../../../../../src/app/dungeons/tags';

/** A corridor three cells wide (one of floor) and ten deep, running east from (0, 0). */
const PASSAGE: WorkRoom = { id: 1, origin: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, width: 3, depth: 10, group: 0, parent: 0, removed: false, wing: 'regular', zone: REGULAR_ZONE, rotunda: false, colonnade: false, fixed: false, boss: false };
/** The ways only a doubles roll makes. */
const SPECIAL: ReadonlySet<CaveWay> = new Set<CaveWay>(['traverse', 'sump']);

describe('a passage entered by a way', () => {
  const params = withVeins(caveParams(dungeonParams(readTags([]))), stream(1, 'cave', 'character'));

  it('passes the way on through its far door alone: a side way off it carries none', () => {
    let sides = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const groups = branchesOf(rngFrom(seed), PASSAGE, false, params, { exits: null, passageSides: 0.5, through: { way: 'sump', width: 8, special: true } });
      for (const branch of groups.flat()) {
        const ahead = branch.axis.x === PASSAGE.axis.x && branch.axis.y === PASSAGE.axis.y;
        if (!ahead) sides++;
        expect(branch.exit?.way, `seed ${seed}`).toBe(ahead ? 'sump' : undefined);
      }
    }
    expect(sides).toBeGreaterThan(50);
  });
});

/** The doors of a passage other than the one it was entered by from its parent. */
function onwardDoors(floor: DungeonFloor, id: number): DungeonFloor['doors'] {
  const room = floor.rooms[id]!;
  return floor.doors.filter((door) => (door.from === id || door.to === id) && !(door.to === id && door.from === room.parent));
}

describe('special ways in generated caves', () => {
  it('cross a passage once: of its other doors only its far one keeps the way, and a passage past the first keeps none', () => {
    let routes = 0;
    for (let k = 1; k <= 100; k++) {
      const model = generateDungeon({ seed: k * 7_717, theme: 'cavern', tags: k % 2 ? ['wet'] : [], floors: 1 + (k % 3) });
      for (const floor of model.floors) {
        for (const room of floor.rooms) {
          if (room.kind === 'room') continue;
          const special = onwardDoors(floor, room.id).filter((door) => SPECIAL.has(door.way ?? 'walk'));
          const parent = room.parent === null || room.parent === undefined ? undefined : floor.rooms[room.parent];
          const entered = floor.doors.find((door) => door.to === room.id && door.from === room.parent);
          if (entered && SPECIAL.has(entered.way ?? 'walk')) routes++;
          expect(special.length, `seed ${model.seed} passage ${room.id}`).toBeLessThanOrEqual(parent && parent.kind !== 'room' ? 0 : 1);
        }
      }
    }
    expect(routes).toBeGreaterThan(10);
  });
});
