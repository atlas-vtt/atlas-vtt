import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { doorSide, doorwayCells, holdsCell } from '../../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonFloor } from '../../../../src/app/dungeons/model';
import { pointInPolygon } from '../../../../src/app/dungeons/render/geometry';
import { placeWater } from '../../../../src/app/dungeons/water';
import { room } from '../plannedFloorFixtures';

describe('water in a cave', () => {
  it('rises from the level only in the rooms it is given', () => {
    const rooms = [room(0, { x: 0, y: 0, w: 6, h: 6 }), room(1, { x: 7, y: 0, w: 6, h: 6 }), room(2, { x: 14, y: 0, w: 6, h: 6 })];
    for (let seed = 1; seed <= 20; seed++) {
      const { waterCells } = placeWater(seed, 0, rooms, { level: 0.9, pools: new Set(), rooms: new Set([1]) });
      expect(waterCells.length).toBeGreaterThan(0);
      expect(waterCells.every((c) => holdsCell(rooms[1]!, c.x, c.y))).toBe(true);
    }
  });
});

/** How far a shore may wander inside a cell's middle: it is roughened and smoothed, a lake's as much as a sump's. */
const SHORE_WANDER = 0.25;

/** Whether the middle of the cell lies in the floor's water as the map fills it, or within the shore's wander of it. */
function underWater(floor: DungeonFloor, c: CellPoint): boolean {
  const [x, y] = [c.x + 0.5, c.y + 0.5];
  if (floor.water.filter((pool) => pointInPolygon(pool.outline, x, y)).length % 2 === 1) return true;
  return floor.water.some((pool) => pool.outline.some((p, i) => {
    const q = pool.outline[(i + 1) % pool.outline.length]!;
    const t = Math.max(0, Math.min(1, ((x - p.x) * (q.x - p.x) + (y - p.y) * (q.y - p.y)) / Math.max(1e-9, (q.x - p.x) ** 2 + (q.y - p.y) ** 2)));
    return Math.hypot(p.x + t * (q.x - p.x) - x, p.y + t * (q.y - p.y) - y) < SHORE_WANDER;
  }));
}

describe('a sump behind its door', () => {
  it('is part of the floor’s water from the doorway on: no dry cell between the way and the water it dives into', () => {
    let sumps = 0;
    for (let k = 1; k <= 120; k++) {
      const model = generateDungeon({ seed: k * 6_131, theme: 'cavern', tags: k % 2 ? ['wet'] : [], floors: 1 + (k % 3) });
      for (const floor of model.floors) {
        for (const door of floor.doors.filter((d) => d.way === 'sump')) {
          for (const room of [door.from, door.to]) {
            const mouth = room === null ? [] : doorSide(door, room);
            const piece = floor.terrain.find((p) => p.room === room && p.name === 'dungeon.terrain.sump' && p.cells.some((c) => mouth.some((m) => Math.abs(m.x - c.x) + Math.abs(m.y - c.y) <= 1)));
            if (!piece) continue;
            sumps++;
            for (const [what, cells] of [["doorway", doorwayCells(door)], ["mouth", mouth], ["piece", piece.cells]] as const) for (const c of cells) expect(underWater(floor, c), `seed ${model.seed} ${what} ${c.x},${c.y}`).toBe(true);
          }
        }
      }
    }
    expect(sumps).toBeGreaterThan(10);
  });
});
