import { describe, expect, it } from 'vitest';
import { cellKey, doorCells } from '../../../../../src/app/dungeons/geometry';
import { generateDungeon } from '../../../../../src/app/dungeons/generate';
import { continuingCell, withContinuing } from '../../../../../src/app/dungeons/layout/cavern/veins/continuing';
import type { CellPoint, DungeonDoor, DungeonFloor, DungeonModel, DungeonRoom } from '../../../../../src/app/dungeons/model';
import { rngFrom } from '../../../../../src/app/dungeons/rng';

const square = (x0: number, y0: number, size: number): CellPoint[] => Array.from({ length: size * size }, (_, k) => ({ x: x0 + (k % size), y: y0 + Math.floor(k / size) }));

const chamber = (id: number, cells: CellPoint[]): DungeonRoom => ({ id, x: cells[0]!.x, y: cells[0]!.y, w: 5, h: 5, kind: 'room', rotunda: false, wing: 'regular', group: id, parent: null, axis: { x: 0, y: 1 }, colonnade: false, boss: false, cells });

/** The problems of one floor's squeezes: each from a chamber cell, rock beyond and clear of doors (two cells, or one where every dead end must lead on). */
function squeezeProblems(floor: DungeonFloor, tight: boolean): string[] {
  const space = tight ? 1 : 2;
  const out: string[] = [];
  const floorKeys = new Set([...floor.rooms.flatMap((r) => r.cells ?? []), ...floor.doors.flatMap(doorCells)].map((c) => cellKey(c.x, c.y)));
  for (const room of floor.rooms.filter((r) => r.continuing)) {
    const cell = continuingCell(room);
    const d = room.continuing!;
    if (!cell) {
      out.push(`room ${room.id}: no cell for its squeeze`);
      continue;
    }
    if (!(room.cells ?? []).some((c) => c.x === cell.x && c.y === cell.y)) out.push(`room ${room.id}: squeeze off its floor`);
    if (Array.from({ length: space }, (_, k) => k + 1).some((k) => floorKeys.has(cellKey(cell.x + d.x * k, cell.y + d.y * k)))) out.push(`room ${room.id}: squeeze into floor`);
    if (floor.doors.some((door) => doorCells(door).some((c) => Math.abs(c.x - cell.x) <= space && Math.abs(c.y - cell.y) <= space))) out.push(`room ${room.id}: squeeze beside a door`);
    const ways = floor.doors.filter((door) => door.from === room.id || door.to === room.id).length;
    if (room.kind !== 'room' || ways !== 1) out.push(`room ${room.id}: a squeeze from no dead end`);
  }
  return out;
}

const deadEnds = (floor: DungeonFloor): DungeonRoom[] => {
  const inStairs = (room: DungeonRoom): boolean => {
    const keys = new Set((room.cells ?? []).map((c) => cellKey(c.x, c.y)));
    return floor.stairs.some((s) => Array.from({ length: s.w * s.h }, (_, k) => cellKey(s.x + (k % s.w), s.y + Math.floor(k / s.w))).some((k) => keys.has(k)));
  };
  return floor.rooms.filter((room) => room.kind === 'room' && floor.doors.filter((d) => d.from === room.id || d.to === room.id).length === 1 && !inStairs(room));
};

describe('a squeeze leading on from a dead end', () => {
  it('leaves a lone chamber by a wall clear of its door, from the cell continuingCell finds', () => {
    const room = chamber(0, square(0, 0, 5));
    const door: DungeonDoor = { x: 2, y: -1, dir: { x: 0, y: 1 }, kind: 'opening', from: null, to: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const [shaped] = withContinuing(rngFrom(seed), [room], { doors: [door], stairs: [] }, 1);
      expect(shaped!.continuing).toBeDefined();
      const cell = continuingCell(shaped!)!;
      expect(Math.abs(cell.x - door.x) > 2 || Math.abs(cell.y - door.y) > 2).toBe(true);
      // The farthest cell that way, in the middle across it.
      const d = shaped!.continuing!;
      expect(cell.x * d.x + cell.y * d.y).toBe(Math.max(...room.cells!.map((c) => c.x * d.x + c.y * d.y)));
    }
  });

  it('is never given to a chamber with two ways, and is drawn the same for the same seed', () => {
    const rooms = [chamber(0, square(0, 0, 5)), chamber(1, square(0, 8, 5))];
    const doors: DungeonDoor[] = [
      { x: 2, y: -1, dir: { x: 0, y: 1 }, kind: 'opening', from: null, to: 0 },
      { x: 2, y: 6, dir: { x: 0, y: 1 }, kind: 'opening', from: 0, to: 1 },
    ];
    const shaped = withContinuing(rngFrom(9), rooms, { doors, stairs: [] }, 1);
    expect(shaped[0]!.continuing).toBeUndefined();
    expect(shaped[1]!.continuing).toBeDefined();
    expect(withContinuing(rngFrom(9), rooms, { doors, stairs: [] }, 1)).toEqual(shaped);
    expect(withContinuing(rngFrom(9), rooms, { doors, stairs: [] }, 0).every((room) => !room.continuing)).toBe(true);
  });

  it('leads on from every dead end a cave that never has dead passages can, and from about half elsewhere', () => {
    const models: DungeonModel[] = Array.from({ length: 160 }, (_, k) => generateDungeon({ seed: 9_001 + k * 37, tags: [], floors: 1 + (k % 2), theme: 'cavern' }));
    let always = 0;
    let given = 0;
    let ends = 0;
    for (const model of models) {
      for (const floor of model.floors) {
        expect(squeezeProblems(floor, model.cave?.character?.never === 'dead-passages'), `seed ${model.seed}`).toEqual([]);
        const leaves = deadEnds(floor);
        if (model.cave?.character?.never === 'dead-passages') {
          always += leaves.length;
          expect(leaves.filter((room) => room.continuing).length / Math.max(1, leaves.length), `seed ${model.seed}`).toBeGreaterThanOrEqual(leaves.length > 0 ? 0.5 : 0);
        } else {
          ends += leaves.length;
          given += leaves.filter((room) => room.continuing).length;
        }
      }
    }
    expect(always).toBeGreaterThan(0);
    expect(given / ends).toBeGreaterThan(0.3);
    expect(given / ends).toBeLessThan(0.6);
  });
});
