import { describe, expect, it } from 'vitest';
import { cellKey, doorCells } from '../../../../src/app/dungeons/geometry';
import { ROCK, doorOwner } from '../../../../src/app/dungeons/layout/cavern/caveGrid';
import { carveTunnel, shapeDoors, tunnelEnds } from '../../../../src/app/dungeons/layout/cavern/tunnels';
import type { CellPoint, DungeonDoor } from '../../../../src/app/dungeons/model';
import { floorStream } from '../../../../src/app/dungeons/rng';
import { type ShapedFloor, shapedFloors } from './caveHarness';

interface Carved {
  shaped: ShapedFloor;
  doors: DungeonDoor[];
  tunnels: Map<number, CellPoint[]>;
}

function carved(): Carved[] {
  return shapedFloors(400).map((shaped) => {
    const { grid, floor, laneKeys, shaping, seed, index } = shaped;
    const tunnels = new Map<number, CellPoint[]>();
    for (const room of floor.rooms.filter((r) => r.kind !== 'room')) {
      const rng = floorStream(seed, 'cave', index, `tunnel:${room.id}`);
      const onLane = [...laneKeys].some((k) => grid.holds(Number(k.split(',')[0]), Number(k.split(',')[1]), room.id));
      const width = onLane || rng() < shaping.sideWide ? 2 : 1;
      carveTunnel(rng, grid, room, tunnelEnds(grid, room, floor.doors), width, laneKeys);
      tunnels.set(room.id, grid.cellsOf(room.id));
    }
    return { shaped, doors: shapeDoors(floor.doors, laneKeys, grid), tunnels };
  });
}

function reaches(cells: readonly CellPoint[], from: CellPoint, to: CellPoint): boolean {
  const keys = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const seen = new Set([cellKey(from.x, from.y)]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    if (c.x === to.x && c.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = cellKey(c.x + dx, c.y + dy);
      if (keys.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  return false;
}

describe('cave tunnels', () => {
  const all = carved();

  it('join their openings through their own cells', () => {
    for (const { shaped, tunnels } of all) {
      for (const [id, cells] of tunnels) {
        const room = shaped.floor.rooms[id]!;
        const ends = shaped.floor.doors.filter((d) => d.from === id || d.to === id).map((d) => (d.from === id ? { x: d.x - d.dir.x, y: d.y - d.dir.y } : { x: d.x + d.dir.x, y: d.y + d.dir.y }));
        for (const end of ends) expect(reaches(cells, ends[0]!, end), `seed ${shaped.seed} room ${room.id}`).toBe(true);
      }
    }
  });

  it('stay passages, never four cells wide both ways, and keep every lane cell', () => {
    for (const { shaped, tunnels } of all) {
      for (const [id, cells] of tunnels) {
        const keys = new Set(cells.map((c) => cellKey(c.x, c.y)));
        const block4 = cells.some((c) => [0, 1, 2, 3].every((dx) => [0, 1, 2, 3].every((dy) => keys.has(cellKey(c.x + dx, c.y + dy)))));
        expect(block4, `seed ${shaped.seed} room ${id}`).toBe(false);
      }
      for (const c of shaped.lane) expect(shaped.grid.owner(c.x, c.y)).not.toBe(ROCK);
    }
  });

  it('never touch another room’s cells, side or corner, but round the narrows joining them', () => {
    for (const { shaped, tunnels } of all) {
      const { grid, floor } = shaped;
      const byDoor = (k: number, x: number, y: number): boolean => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => grid.owner(x + dx, y + dy) === doorOwner(k)));
      for (const [id, cells] of tunnels) {
        for (const c of cells) {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const other = grid.owner(c.x + dx, c.y + dy);
              if (other === ROCK || other === id) continue;
              const ok =
                other <= -2
                  ? floor.doors[-2 - other]!.from === id || floor.doors[-2 - other]!.to === id
                  : floor.doors.some((d, k) => d.kind !== 'secret' && ((d.from === id && d.to === other) || (d.from === other && d.to === id)) && byDoor(k, c.x, c.y) && byDoor(k, c.x + dx, c.y + dy));
              expect(ok, `seed ${shaped.seed} floor ${shaped.index} room ${id} at ${c.x},${c.y} other ${other} at ${dx},${dy} rooms ${JSON.stringify([floor.rooms[id], floor.rooms[other]])} doors ${JSON.stringify(floor.doors.filter((d) => [d.from, d.to].some((r) => r === id || r === other)))} lane ${shaped.lane.filter((l) => Math.abs(l.x - c.x) <= 2 && Math.abs(l.y - c.y) <= 2).map((l) => l.x + "," + l.y).join(" ")}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('turn every door into a narrows, two cells wide where the lane passes', () => {
    for (const { shaped, doors } of all) {
      for (const door of doors) expect(door.kind).not.toBe('door');
      doors.forEach((door, k) => {
        const onLane = shaped.laneKeys.has(cellKey(door.x, door.y));
        if (door.wide) {
          expect(onLane).toBe(true);
          for (const c of doorCells(door)) expect(shaped.grid.owner(c.x, c.y)).toBe(doorOwner(k));
        } else if (door.kind !== 'secret' && onLane) {
          // One cell of its own: the lane's second cell beside it is the narrows of the junction's next door.
          const beside = [-1, 1].map((s) => ({ x: door.x + s * door.dir.y, y: door.y + s * door.dir.x })).filter((c) => shaped.laneKeys.has(cellKey(c.x, c.y)));
          expect(beside.length).toBeGreaterThan(0);
          for (const c of beside) expect(shaped.grid.owner(c.x, c.y)).toBeLessThanOrEqual(-2);
        }
      });
    }
  });

  it('are the same for the same seed', () => {
    const again = carved();
    expect(again.map((c) => [...c.tunnels.entries()])).toEqual(all.map((c) => [...c.tunnels.entries()]));
  }, 60_000);
});
