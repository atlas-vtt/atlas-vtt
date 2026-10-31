import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { cellKey, doorCells, holdsCell } from '../../../../src/app/dungeons/geometry';
import { floorBelow, stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import { draft } from '../../../../src/app/dungeons/terrain/catalog';
import { placeVerticalExits } from '../../../../src/app/dungeons/terrain/cavern/verticalExits';
import { holeProblems } from '../holeInvariants';
import { routeProblems } from '../terrainInvariants';
import { physicsProblems } from '../themeTerrainInvariants';
import { CHAMBER_A, asFloor, handCave } from './veinsTerrainFixtures';

const inA = (c: { x: number; y: number }): boolean => CHAMBER_A.some((a) => a.x === c.x && a.y === c.y);

describe('a chamber\'s exits in roof and floor, built by hand', () => {
  it('opens a shaft into the dark where no floor lies below, and an aven over a cell of the chamber for each roof exit, two at most', () => {
    const { work, floors } = handCave({ vertical: { up: [6, 3, 2], down: [5, 3, 2] } });
    placeVerticalExits(work, 0);
    const shafts = floors[0]!.pieces.filter((p) => p.kind === 'shaft');
    const avens = floors[0]!.pieces.filter((p) => p.kind === 'aven');
    expect(shafts).toHaveLength(2);
    expect(avens).toHaveLength(2);
    for (const shaft of shafts) {
      expect(shaft.opening?.bottom).toBeNull();
      expect(shaft.cells).toHaveLength(1);
      expect(shaft.cells.every(inA)).toBe(true);
    }
    for (const aven of avens) {
      expect(aven.cells).toHaveLength(1);
      expect(aven.cells.every(inA)).toBe(true);
      expect(aven.traits).toEqual({});
    }
    expect(routeProblems(asFloor(floors[0]!))).toEqual([]);
  });

  it('drops a shaft into the chamber of the floor below, with its rubble there', () => {
    const { work, floors } = handCave({ vertical: { up: [], down: [9] }, below: true });
    placeVerticalExits(work, 0);
    const shaft = floors[0]!.pieces.find((p) => p.kind === 'shaft');
    expect(shaft?.opening?.bottom).toBe(1);
    const foot = floors[1]!.pieces.find((p) => p.kind === 'chasm-floor');
    expect(foot?.under).toBe(shaft!.opening!.link);
    expect(keysOf(foot!.cells)).toEqual(keysOf(shaft!.cells));
  });

  it('counts a shaft its chamber already holds as one of its two', () => {
    const { work, floors } = handCave({ vertical: { up: [], down: [5, 4, 2] } });
    floors[0]!.place({ ...draft('shaft', 0, [{ x: 3, y: 3 }]), opening: { bottom: null, link: 99 } });
    placeVerticalExits(work, 0);
    expect(floors[0]!.pieces.filter((p) => p.kind === 'shaft')).toHaveLength(2);
  });

  it('keeps shafts and avens off the lane, the doors and the cells before them', () => {
    const lane = CHAMBER_A.filter((c) => c.y === 3 || c.y === 4);
    for (let seed = 1; seed <= 12; seed++) {
      const { work, floors } = handCave({ vertical: { up: [3, 2], down: [4, 2] }, lane }, seed);
      placeVerticalExits(work, 0);
      const laneKeys = keysOf(lane);
      const kept = keysOf([{ x: 1, y: 3 }, { x: 6, y: 3 }, ...floors[0]!.plan.doors.flatMap((d) => doorCells(d))]);
      for (const piece of floors[0]!.pieces) for (const c of piece.cells) {
        expect(laneKeys.has(cellKey(c.x, c.y)), `seed ${seed} ${piece.kind}`).toBe(false);
        expect(kept.has(cellKey(c.x, c.y)), `seed ${seed} ${piece.kind}`).toBe(false);
      }
    }
  });
});

function keysOf(cells: readonly { x: number; y: number }[]): Set<string> {
  return new Set(cells.map((c) => cellKey(c.x, c.y)));
}

describe('exits in roof and floor of generated caves', () => {
  const models = Array.from({ length: 40 }, (_, i) => generateDungeon({ seed: (i + 1) * 3_571, theme: 'cavern', tags: i % 2 ? ['wet'] : [], floors: 1 + (i % 3) }));

  it('lays avens of one cell, two at most a chamber, only in chambers whose roll gave them roof exits', () => {
    let avens = 0;
    for (const model of models) for (const floor of model.floors) {
      const lane = keysOf(floor.cave?.lane ?? []);
      for (const room of floor.rooms) {
        const own = floor.terrain.filter((p) => p.kind === 'aven' && p.room === room.id);
        avens += own.length;
        expect(own.length).toBeLessThanOrEqual(Math.min(2, room.vertical?.up.length ?? 0));
        for (const aven of own) {
          expect(aven.cells).toHaveLength(1);
          expect(lane.has(cellKey(aven.cells[0]!.x, aven.cells[0]!.y))).toBe(false);
        }
      }
    }
    expect(avens).toBeGreaterThan(0);
  });

  it('opens shafts that line up with the floors below, bottomless only where no floor lies below, none beside water', () => {
    for (const model of models) {
      expect([...holeProblems(model), ...physicsProblems(model)], `${model.seed}`).toEqual([]);
      const stack = stackOf(model);
      model.floors.forEach((floor, f) => {
        for (const shaft of floor.terrain.filter((p) => p.kind === 'shaft' && p.opening?.bottom === null)) expect(floorBelow(stack, f), `${model.seed} floor ${f}`).toBeNull();
        for (const room of floor.rooms) {
          const shafts = floor.terrain.filter((p) => p.kind === 'shaft' && p.room === room.id);
          // The roll's two, and the pitch of a shaft room's own.
          expect(shafts.length).toBeLessThanOrEqual(2);
          for (const shaft of shafts) expect(shaft.cells.every((c) => holdsCell(room, c.x, c.y))).toBe(true);
        }
      });
    }
  });
});
