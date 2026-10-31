import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { cellKey, doorCells } from '../../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonTerrain } from '../../../../src/app/dungeons/model';
import { placeSpecialRoutes } from '../../../../src/app/dungeons/terrain/cavern/specialRoutes';
import { cellProblems, clearanceProblems, routeProblems } from '../terrainInvariants';
import { breakdownProblems, geologyProblems, laneProblems, waterProblems } from '../caveRules';
import { mirrorProblems, physicsProblems } from '../themeTerrainInvariants';
import { floorStack } from '../../../../src/app/dungeons/floors/floorStack';
import { CHAMBER_A, PASSAGE, asFloor, handCave } from './veinsTerrainFixtures';

const keys = (cells: readonly CellPoint[]): Set<string> => new Set(cells.map((c) => cellKey(c.x, c.y)));
const ONE_FLOOR = floorStack('down', 1);
/** The passage's row along chamber A's door, and the row beside it, which the lane takes in some cases. */
const LANE_ROW = PASSAGE.filter((c) => c.y === 4);

function sound(floor: DungeonFloor): string[] {
  return [...cellProblems(floor), ...clearanceProblems(floor, 0, ONE_FLOOR), ...routeProblems(floor), ...laneProblems(floor)];
}

describe('the ground of a special way, built by hand', () => {
  it('fills a short passage with a sump off the lane, keeping the way through', () => {
    const { work, floors } = handCave({ way: 'sump', lane: LANE_ROW });
    placeSpecialRoutes(work, 0);
    const water = floors[0]!.pieces.filter((p) => p.name === 'dungeon.terrain.sump');
    expect(water).toHaveLength(1);
    const lane = keys(LANE_ROW);
    const passage = keys(PASSAGE);
    for (const c of water[0]!.cells) {
      expect(passage.has(cellKey(c.x, c.y))).toBe(true);
      expect(lane.has(cellKey(c.x, c.y))).toBe(false);
    }
    expect(water[0]!.traits.hazard).toBe('deep-water');
    expect(water[0]!.room).toBe(1);
    expect(sound(asFloor(floors[0]!))).toEqual([]);
  });

  it('never lays two sumps as mirror images of each other in one chamber', () => {
    // Two sump ways at mirrored places once filled the cells nearest each as the other's mirror image: nature makes no such pair.
    const { work, floors } = handCave({ twinSumps: true });
    placeSpecialRoutes(work, 0);
    const floor = asFloor(floors[0]!);
    expect(floor.terrain.filter((p) => p.name === 'dungeon.terrain.sump' && p.room === 0)).toHaveLength(2);
    const model = { version: 1, seed: 1, theme: 'cavern', tags: [], floors: [{ ...floor, rooms: floor.rooms.map((r) => ({ ...r, type: 'passage-chamber' })) }] } as unknown as DungeonModel;
    expect(mirrorProblems(model)).toEqual([]);
  });

  it('lays no sump in a dry cave', () => {
    const { work, floors } = handCave({ way: 'sump', tags: ['dry'] });
    placeSpecialRoutes(work, 0);
    expect(floors[0]!.pieces).toEqual([]);
  });

  it('chokes the passage by the door with boulders, walked over', () => {
    const { work, floors } = handCave({ way: 'breakdown', lane: LANE_ROW });
    placeSpecialRoutes(work, 0);
    const [choke] = floors[0]!.pieces;
    expect(choke?.kind).toBe('boulder-choke');
    expect(choke!.cells.length).toBeGreaterThanOrEqual(1);
    expect(choke!.cells.length).toBeLessThanOrEqual(4);
    for (const c of choke!.cells) expect(Math.abs(c.x - 7) + Math.abs(c.y - 3)).toBeLessThanOrEqual(3);
    expect(choke!.traits.difficult).toBe(true);
    expect(sound(asFloor(floors[0]!))).toEqual([]);
  });

  it('cuts a traverse along the passage, bottomless where no floor lies below, with a ledge beside it where one runs its length', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { work, floors } = handCave({ way: 'traverse' }, seed);
      placeSpecialRoutes(work, 0);
      const chasm = floors[0]!.pieces.find((p) => p.kind === 'chasm');
      expect(chasm, `seed ${seed}`).toBeDefined();
      expect(chasm!.opening?.bottom).toBeNull();
      const passage = keys(PASSAGE);
      for (const c of chasm!.cells) expect(passage.has(cellKey(c.x, c.y))).toBe(true);
      const ledge = floors[0]!.pieces.find((p) => p.kind === 'ledge');
      if (ledge) for (const c of chasm!.cells) expect(ledge.cells.some((l) => Math.max(Math.abs(l.x - c.x), Math.abs(l.y - c.y)) <= 1)).toBe(true);
      expect(sound(asFloor(floors[0]!))).toEqual([]);
    }
  });

  it('falls back on the chamber beside the door, a few cells near it, where no passage lies between', () => {
    const { work, floors } = handCave({ way: 'breakdown', noPassage: true });
    placeSpecialRoutes(work, 0);
    const [choke] = floors[0]!.pieces;
    expect(choke?.kind).toBe('boulder-choke');
    expect(choke!.cells.length).toBeLessThanOrEqual(3);
    expect([0, 1]).toContain(choke!.room);
    expect(sound(asFloor(floors[0]!))).toEqual([]);
  });

  it('lays nothing for a walk, a crawl or a squeeze', () => {
    for (const way of ['walk', 'crawl', 'squeeze', 'letterbox'] as const) {
      const { work, floors } = handCave({ way });
      placeSpecialRoutes(work, 0);
      expect(floors[0]!.pieces, way).toEqual([]);
    }
  });

  it('never fills the lane: where the passage is all lane, a chamber beside the door takes the sump', () => {
    const { work, floors } = handCave({ way: 'sump', lane: [...LANE_ROW, ...PASSAGE.filter((c) => c.y === 3)] });
    placeSpecialRoutes(work, 0);
    const chamber = keys(CHAMBER_A);
    // The whole passage is the lane: the sump falls back on the chamber, a few cells by the door.
    const [water] = floors[0]!.pieces;
    expect(water?.room).toBe(0);
    expect(water!.cells.length).toBeLessThanOrEqual(3);
    for (const c of water!.cells) expect(chamber.has(cellKey(c.x, c.y))).toBe(true);
    expect(sound(asFloor(floors[0]!))).toEqual([]);
  });
});

/** The pieces near a special door of its rooms, within the reach its ground takes. */
function groundOf(floor: DungeonFloor, door: DungeonFloor['doors'][number]): DungeonTerrain[] {
  return floor.terrain.filter((p) => (p.room === door.from || p.room === door.to) && p.cells.every((c) => Math.max(Math.abs(c.x - door.x), Math.abs(c.y - door.y)) <= 6));
}

describe('the ground of special ways in generated caves', () => {
  const models = Array.from({ length: 40 }, (_, i) => generateDungeon({ seed: (i + 1) * 7_919, theme: 'cavern', tags: i % 3 === 0 ? ['wet'] : [], floors: 1 + (i % 3) }));

  it('keeps every piece off the lane, the doors and the cells before them, and every floor walkable', () => {
    for (const model of models) {
      const stack = floorStack('down', model.floors.length);
      model.floors.forEach((floor, f) => {
        expect([...cellProblems(floor), ...clearanceProblems(floor, f, stack), ...routeProblems(floor), ...laneProblems(floor)], `${model.seed} floor ${f}`).toEqual([]);
        const doorKeys = keys(floor.doors.flatMap((d) => doorCells(d)));
        for (const piece of floor.terrain) for (const c of piece.cells) expect(doorKeys.has(cellKey(c.x, c.y))).toBe(false);
      });
      expect([...waterProblems(model), ...geologyProblems(model, true), ...breakdownProblems(model).problems, ...physicsProblems(model)], `${model.seed}`).toEqual([]);
    }
  });

  it('gives most sumps and breakdowns their ground, of the kind the way is', () => {
    let routes = 0;
    let laid = 0;
    for (const model of models) for (const floor of model.floors) for (const door of floor.doors) {
      if (door.way !== 'sump' && door.way !== 'breakdown') continue;
      routes++;
      const ground = groundOf(floor, door);
      if (door.way === 'sump' && ground.some((p) => p.name === 'dungeon.terrain.sump')) laid++;
      if (door.way === 'breakdown' && ground.some((p) => p.kind === 'boulder-choke')) laid++;
    }
    expect(routes).toBeGreaterThan(10);
    expect(laid / routes).toBeGreaterThan(0.6);
  });
});
