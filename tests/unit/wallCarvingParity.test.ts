/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import type { RoomArea } from '../../src/app/lighting/rooms';
import { carvedWalls, filledWalls, type CarvedWalls } from '../../src/app/lighting/wallCarving';
import { floorOf } from '../../src/app/lighting/wallSpaces';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { brushStroke, rectangle, seeded, withEdit } from '../helpers/carvedCaves';
import { carvedWalls as carvedBefore, filledWalls as filledBefore } from '../oracles/roomCarvingBaseline/wallCarving';
import { floorOf as floorBefore } from '../oracles/roomCarvingBaseline/wallSpaces';

/** More maps with `VITE_CARVE_PARITY_TRIALS` (each is a dozen edits, the former code's cost growing with the walls). */
const TRIALS = Number(import.meta.env.VITE_CARVE_PARITY_TRIALS ?? 6);
const SIZE = 1400;

/** The walls an edit reaches: those whose box meets the shape's, a few pixels grown. */
function reached(area: RoomArea, walls: readonly WallSegment[]): Set<string> {
  const xs = area.flatMap((ring) => ring.filter((_, index) => index % 2 === 0)).map((value) => value / 8);
  const ys = area.flatMap((ring) => ring.filter((_, index) => index % 2 === 1)).map((value) => value / 8);
  const [left, right, top, bottom] = [Math.min(...xs) - 4, Math.max(...xs) + 4, Math.min(...ys) - 4, Math.max(...ys) + 4];
  return new Set(walls.filter(({ p1, p2 }) => Math.max(p1.x, p2.x) >= left && Math.min(p1.x, p2.x) <= right && Math.max(p1.y, p2.y) >= top && Math.min(p1.y, p2.y) <= bottom).map((wall) => wall.id));
}

/**
 * The former edit without what it did to walls away from the shape. It cut every wall of the map
 * where the ground beside it turned, and two cuts a rounding apart split a wall in two wherever it
 * stood; an edit now leaves a wall it does not reach alone.
 */
function nearShape(edit: CarvedWalls, area: RoomArea, walls: readonly WallSegment[]): CarvedWalls {
  const near = reached(area, walls);
  const far = walls.filter((wall) => edit.remove.includes(wall.id) && !near.has(wall.id));
  const onFar = (piece: CarvedWalls['add'][number]): boolean => far.some((wall) => [piece.p1, piece.p2].every((point) => Math.abs((wall.p2.x - wall.p1.x) * (point.y - wall.p1.y) - (wall.p2.y - wall.p1.y) * (point.x - wall.p1.x)) / Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y) < 1e-6 && wall.chainId === piece.chainId));
  return { remove: edit.remove.filter((id) => near.has(id)), add: far.length === 0 ? edit.add : edit.add.filter((piece) => !onFar(piece)) };
}

describe('carving and the floor, held to the code before they looked only at what is near', () => {
  it('makes the same walls and the same floor, edit after edit', { timeout: 600_000 }, () => {
    for (let seed = 1; seed <= TRIALS; seed++) {
      const random = seeded(seed * 7919);
      let walls: WallSegment[] = [];
      for (let edit = 0; edit < 12; edit++) {
        const kind = random();
        const area = kind < 0.55 ? brushStroke(random, SIZE, 40 + random() * 30, 6 + Math.floor(random() * 14)) : rectangle(random, SIZE);
        const filling = kind > 0.85;
        const floors = floorOf(walls);
        expect(floors, `floor, seed ${seed} edit ${edit}`).toEqual(floorBefore(walls));
        const now = (filling ? filledWalls : carvedWalls)(area, walls, floors, `c${edit}`);
        const before = nearShape((filling ? filledBefore : carvedBefore)(area, walls, floors, `c${edit}`), area, walls);
        expect(now, `walls, seed ${seed} edit ${edit}`).toEqual(before);
        walls = withEdit(walls, now, edit);
      }
      expect(floorOf(walls), `floor, seed ${seed} at the end`).toEqual(floorBefore(walls));
    }
  });

  it('leaves a wall away from the shape as it is', () => {
    const random = seeded(4242);
    let walls: WallSegment[] = [];
    for (let edit = 0; edit < 10; edit++) walls = withEdit(walls, carvedWalls(brushStroke(random, SIZE), walls, floorOf(walls), `c${edit}`), edit);
    for (let edit = 0; edit < 20; edit++) {
      const area = rectangle(random, SIZE, 40, 200);
      const near = reached(area, walls);
      const { remove } = carvedWalls(area, walls, floorOf(walls), 'c');
      expect(remove.filter((id) => !near.has(id))).toEqual([]);
    }
  });
});
