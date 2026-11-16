import { describe, expect, it } from 'vitest';
import { cellKey } from '../../../src/app/dungeons/geometry';
import type { CellPoint } from '../../../src/app/dungeons/model';
import { onShore } from '../../../src/app/dungeons/props/arrangeGroups';
import { atBackWall, againstWall, atCentre, inCorner, inRows, onWall } from '../../../src/app/dungeons/props/cellVerbs';
import { type FurnishSpace, placePiece } from '../../../src/app/dungeons/props/furnishSpace';
import type { PropKind } from '../../../src/app/dungeons/props/propKinds';
import { draft } from '../../../src/app/dungeons/terrain/catalog';
import { reserveLanes } from '../../../src/app/dungeons/terrain/roomLanes';
import { furnished } from './furnishFixtures';

const placedCells = (fs: FurnishSpace): CellPoint[] => fs.placed.flatMap((p) => [...p.cells]);

/** Whether the room's walkable cells fall apart, or a cell it must keep reachable is blocked or cut off. */
function splits(fs: FurnishSpace, w: number, h: number): boolean {
  const walk = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && !fs.cells.isBlocked({ x, y });
  const cells: CellPoint[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (walk(x, y)) cells.push({ x, y });
  const seen = new Set([cellKey(cells[0]!.x, cells[0]!.y)]);
  const queue = [cells[0]!];
  while (queue.length) {
    const c = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = cellKey(c.x + dx, c.y + dy);
      if (!seen.has(key) && walk(c.x + dx, c.y + dy)) {
        seen.add(key);
        queue.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  return seen.size !== cells.length || fs.cells.needed.some((c) => !seen.has(cellKey(c.x, c.y)));
}

describe('cell pieces', () => {
  it('builds a fireplace into a wall with the row before it free', () => {
    const fs = furnished(5, 5);
    expect(againstWall(fs, 'hearth', ['left', 'right', 'back'])).not.toBeNull();
    const piece = fs.placed[0]!;
    expect(piece.cells).toHaveLength(2);
    const onWallCell = (c: CellPoint): boolean => c.x === 0 || c.x === 4 || c.y === 0 || c.y === 4;
    expect(piece.cells.every(onWallCell)).toBe(true);
    expect(piece.clear).toHaveLength(2);
    for (const c of piece.clear) expect(fs.cells.isBlocked(c)).toBe(false);
  });

  it('rings a fire pit with free cells', () => {
    const fs = furnished(6, 6);
    expect(atCentre(fs, 'campfire')).not.toBeNull();
    const fire = fs.placed[0]!;
    expect(fire.clear).toHaveLength(4);
    for (const c of fire.clear) expect(fs.cells.isBlocked(c)).toBe(false);
  });

  it('keeps lanes between doors and stairs straight and clear', () => {
    const fs = furnished(7, 7, { north: true });
    reserveLanes(fs.cells);
    inRows(fs, 'boulder', 3);
    inCorner(fs, 'stalagmites');
    const taken = new Set(placedCells(fs).map((c) => cellKey(c.x, c.y)));
    // The lane from the south door to the north one runs straight up the middle column.
    for (let y = 0; y < 7; y++) expect(taken.has(cellKey(3, y)), `cell 3,${y}`).toBe(false);
  });

  it('lays stones in a row across the middle, a ring\'s width apart', () => {
    const fs = furnished(9, 7);
    const stones = inRows(fs, 'boulder', 3);
    expect(stones).toHaveLength(3);
    expect(new Set(stones.map((p) => p.y)).size).toBe(1);
    const xs = stones.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBe(3);
  });

  it('places no wall or back-wall piece in a round room or across a door', () => {
    const round = furnished(7, 7, { rotunda: true });
    expect(atBackWall(round, 'hearth')).toBeNull();
    expect(againstWall(round, 'crystals', ['left', 'right', 'back', 'near'])).toBeNull();
    expect(onWall(round, 'flowstone', 3)).toEqual([]);
    const doors = furnished(3, 3, { north: true });
    for (let k = 0; k < 6; k++) onWall(doors, 'curtain', 1);
    for (const p of doors.placed) {
      // No curtain hangs on the cell before a door.
      expect(p.prop.x === 1.5 && (p.prop.y < 0.5 || p.prop.y > 2.5)).toBe(false);
    }
  });

  it('hangs no wall piece in a corner or beside a door, where its drawing would cover the next wall', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const fs = furnished(5, 4, { seed, north: true });
      onWall(fs, 'curtain', 8);
      expect(fs.placed.length).toBeGreaterThan(0);
      for (const { prop } of fs.placed) {
        // Never in the corner cells of the 5 × 4 room, never beside the middle of the north or south wall's door.
        const x = Math.floor(prop.x);
        const y = Math.floor(prop.y);
        expect(x === 0 || x === 4 ? y >= 1 && y <= 2 : true, `seed ${seed} at ${prop.x},${prop.y}`).toBe(true);
        expect((y <= 0 || y >= 3) && Math.abs(x - 2) <= 1, `seed ${seed} at ${prop.x},${prop.y}`).toBe(false);
      }
    }
  });

  it('never splits a room', () => {
    const kinds: PropKind[] = ['hearth', 'campfire', 'boulder', 'stalagmites', 'crystals', 'column-formation', 'statue', 'well', 'fountain', 'bust', 'boulder', 'stalagmites'];
    for (let seed = 1; seed <= 200; seed++) {
      const w = 4 + (seed % 5);
      const h = 4 + (seed % 3);
      const fs = furnished(w, h, { seed, north: true });
      reserveLanes(fs.cells);
      kinds.forEach((kind, k) => {
        const verb = [atCentre, inCorner, atBackWall][k % 3]!;
        verb(fs, kind);
      });
      expect(splits(fs, w, h), `seed ${seed}`).toBe(false);
    }
  });

  it('offers nothing it was not offered', () => {
    const fs = furnished(5, 5, { offered: new Set() });
    expect(placePiece(fs, 'hearth', [{ x: 1, y: 0 }, { x: 2, y: 0 }], { x: 0, y: 1 })).toBeNull();
    expect(atCentre(fs, 'boulder')).toBeNull();
    expect(onWall(fs, 'flowstone', 2)).toEqual([]);
  });

  it('asks the room\'s placeAllowed', () => {
    const veto = { x: 2, y: 2 };
    const fs = furnished(5, 5, { placeAllowed: (_, at) => at.x !== veto.x || at.y !== veto.y });
    atCentre(fs, 'campfire');
    atCentre(fs, 'boulder');
    inCorner(fs, 'stalagmites');
    expect(placedCells(fs).some((c) => c.x === veto.x && c.y === veto.y)).toBe(false);
  });

  it('lays shore pieces only beside liquid', () => {
    const wet = furnished(6, 6);
    wet.floor.place(draft('deep-water', 0, [{ x: 2, y: 2 }, { x: 3, y: 2 }]));
    const crystals = onShore(wet, 'crystals', 3);
    expect(crystals.length).toBeGreaterThan(0);
    for (const p of wet.placed) expect(p.cells.some((c) => Math.abs(c.x - 2.5) + Math.abs(c.y - 2) <= 1.5)).toBe(true);
    expect(onShore(furnished(6, 6), 'crystals', 3)).toEqual([]);
  });
});

describe('room walls', () => {
  it('lists the wall cells of each side of a room', () => {
    const fs = furnished(4, 3);
    expect(fs.cells.wallCells('back').map((c) => c.y)).toEqual([0, 0, 0, 0]);
    expect(fs.cells.wallCells('near').map((c) => c.y)).toEqual([2, 2, 2, 2]);
    expect(fs.cells.wallCells('left').length + fs.cells.wallCells('right').length).toBe(6);
    expect(fs.cells.doorOn('near', { x: 2, y: 2 })).toBe(true);
    expect(fs.cells.doorOn('near', { x: 1, y: 2 })).toBe(false);
  });
});
