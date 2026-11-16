import { describe, expect, it } from 'vitest';
import { cellsOf } from '../../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonDoor } from '../../../../src/app/dungeons/model';
import { int, stream } from '../../../../src/app/dungeons/rng';
import { naturalPool } from '../../../../src/app/dungeons/terrain/cavern/cavePools';
import { RoomCells } from '../../../../src/app/dungeons/terrain/roomCells';
import { room } from '../plannedFloorFixtures';

const entrance: DungeonDoor = { x: 1, y: -1, dir: { x: 0, y: 1 }, kind: 'opening', from: null, to: 0 };

/** A rectangle of `w` × `h` cells entered from the top, with a few of its cells taken by blocks. */
function chamber(w: number, h: number, blocked: readonly CellPoint[] = []): RoomCells {
  const rc = new RoomCells(room(0, { x: 0, y: 0, w, h, axis: { x: 0, y: 1 } }), [entrance], [], () => 'lower', []);
  rc.take(blocked, 'block');
  return rc;
}

/** What `keepsCover` answered when it tried every free cell with a flood fill of its own. */
function keepsCoverByHand(rc: RoomCells, cells: readonly CellPoint[], over: readonly CellPoint[]): boolean {
  const own = new Set(cells.map((c) => `${c.x},${c.y}`));
  for (let i = 0; i < rc.depth; i++) {
    for (let j = 0; j < rc.width; j++) {
      const c = rc.cell(i, j);
      if (!own.has(`${c.x},${c.y}`) && rc.isFree(c) && rc.allows([...cells, c], 'block', over)) return true;
    }
  }
  return false;
}

describe('the cost of a cave chamber’s terrain', () => {
  it('answers whether a place for cover is left as trying every cell would', () => {
    const rng = stream(1, 'terrain', 'keepsCover');
    for (let trial = 0; trial < 400; trial++) {
      const w = int(rng, 2, 9);
      const h = int(rng, 2, 9);
      const all = cellsOf({ x0: 0, y0: 0, x1: w - 1, y1: h - 1 });
      const pickSome = (n: number): CellPoint[] => Array.from({ length: n }, () => all[Math.floor(rng() * all.length)]!);
      const rc = chamber(w, h, pickSome(int(rng, 0, Math.floor(w * h * 0.3))));
      const cells = pickSome(int(rng, 0, Math.max(1, Math.floor(w * h * 0.3))));
      const over = rng() < 0.3 ? cells.slice(0, int(rng, 0, cells.length)) : [];
      expect(rc.keepsCover(cells, over), `trial ${trial}`).toBe(keepsCoverByHand(rc, cells, over));
    }
  });

  it('fills a large chamber with a lake of at most sixty cells', () => {
    const pool = naturalPool(chamber(23, 26), stream(2, 'terrain'), 0.38, () => true);
    expect(pool?.length).toBe(60);
  });
});
