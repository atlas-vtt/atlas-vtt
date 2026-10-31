import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { entrancesAndAround, stairsAndAround } from '../../../../src/app/dungeons/floors/stairSpots';
import { cellKey, doorSide, doorwayCells, holdsCell } from '../../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonDoor, DungeonFloor, DungeonTerrain } from '../../../../src/app/dungeons/model';
import { pointInPolygon } from '../../../../src/app/dungeons/render/geometry';
import { placeWater, sumpMouths } from '../../../../src/app/dungeons/water';
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

/** A sump way from room 0 into room 1 through (7, 3), its water a cell past the mouth at (8, 3). */
const SUMP_DOOR: DungeonDoor = { x: 7, y: 3, dir: { x: 1, y: 0 }, kind: 'opening', from: 0, to: 1, way: 'sump' };
const SUMP = { name: 'dungeon.terrain.sump', kind: 'sump', room: 1, cells: [{ x: 9, y: 3 }], traits: { hazard: 'deep-water' } } as unknown as DungeonTerrain;

describe('a sump’s mouth', () => {
  it('joins the doorway and the cell before it to the sump', () => {
    expect(sumpMouths([SUMP_DOOR], [SUMP], new Set())).toEqual([{ x: 7, y: 3 }, { x: 8, y: 3 }]);
  });

  it('stays dry, doorway and all, where its cells must stay walkable: the lane, a stairwell’s surroundings, an entrance’s', () => {
    expect(sumpMouths([SUMP_DOOR], [SUMP], new Set(['8,3']))).toEqual([]);
    expect(sumpMouths([SUMP_DOOR], [SUMP], new Set(['7,3']))).toEqual([]);
  });
});

/** The cells a sump's mouth never takes on a generated floor. */
function keptDry(floor: DungeonFloor): Set<string> {
  return new Set([...(floor.cave?.lane ?? []).map((c) => cellKey(c.x, c.y)), ...stairsAndAround(floor.stairs), ...entrancesAndAround(floor.doors)]);
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
            const dry = keptDry(floor);
            if (!piece || [...doorwayCells(door), ...mouth].some((c) => dry.has(cellKey(c.x, c.y)))) continue;
            sumps++;
            for (const [what, cells] of [["doorway", doorwayCells(door)], ["mouth", mouth], ["piece", piece.cells]] as const) for (const c of cells) expect(underWater(floor, c), `seed ${model.seed} ${what} ${c.x},${c.y}`).toBe(true);
          }
        }
      }
    }
    expect(sumps).toBeGreaterThan(10);
  });
});
