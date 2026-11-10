import { describe, expect, it } from 'vitest';
import { doorApproaches } from '../../../../src/app/dungeons/floors/stairSpots';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { cellKey, cellsOf, floorRect, holdsCell, roomArea, wallRect } from '../../../../src/app/dungeons/geometry';
import { GrowthSpace } from '../../../../src/app/dungeons/growth/growthSpace';
import { RUN_STEP, wallRuns } from '../../../../src/app/dungeons/growth/wallRuns';
import type { CellPoint, DungeonDoor, DungeonFloor, DungeonModel, DungeonRoom } from '../../../../src/app/dungeons/model';
import { frameOf } from '../../../../src/app/dungeons/props/roomFrame';
import { isFree, roomSpace } from '../../../../src/app/dungeons/props/space';
import { RoomCells } from '../../../../src/app/dungeons/terrain/roomCells';
import { floorMarks, gridAround, wallMarks } from '../../../../src/app/dungeons/water/wetGrid';
import { roomAt } from '../../../../src/app/packages/components/dungeon-generator/mapHits';
import { room } from '../plannedFloorFixtures';

/** A 6 × 5 chamber whose bottom right 3 × 2 corner is rock, entered from the top. */
function lRoom(): DungeonRoom {
  const cells = cellsOf({ x0: 0, y0: 0, x1: 5, y1: 4 }).filter((c) => !(c.x >= 3 && c.y >= 3));
  return { ...room(0, { x: 0, y: 0, w: 6, h: 5, axis: { x: 0, y: 1 } }), cells };
}

const entrance: DungeonDoor = { x: 1, y: -1, dir: { x: 0, y: 1 }, kind: 'opening', from: null, to: 0, wide: { x: 1, y: 0 } };
const keys = (cells: readonly CellPoint[]): Set<string> => new Set(cells.map((c) => cellKey(c.x, c.y)));

describe('a chamber shaped by its cells', () => {
  it('is terrain on its cells alone, and keeps its lane free of anything that blocks', () => {
    const lane = keys([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    const rc = new RoomCells(lRoom(), [entrance], [], () => 'lower', [], lane);
    expect(rc.floorCount).toBe(24);
    expect(rc.isFree({ x: 4, y: 4 })).toBe(false);
    expect(rc.isFloor({ x: 4, y: 4 })).toBe(false);
    expect(rc.inLane({ x: 1, y: 1 })).toBe(true);
    expect(rc.allows([{ x: 2, y: 1 }], 'block')).toBe(false);
    expect(rc.allows([{ x: 2, y: 1 }], 'walk')).toBe(true);
    expect(rc.allows([{ x: 4, y: 1 }], 'block')).toBe(true);
  });

  it('is reached through both cells of a wide door', () => {
    expect(doorApproaches({ id: 0 }, [entrance])).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('takes no disc that reaches its rock', () => {
    const shaped = lRoom();
    const space = roomSpace(frameOf(shaped), new Set(), [], keys(shaped.cells ?? []));
    expect(isFree(space, { x: 2.5, y: 3.5 }, 0.4)).toBe(true);
    expect(isFree(space, { x: 2.8, y: 3.5 }, 0.4)).toBe(false);
  });

  it('has its back wall round the cut corner', () => {
    const shaped = lRoom();
    const back = new RoomCells(shaped, [], [], () => 'lower', []).wallCells('back');
    expect(keys(back)).toEqual(keys([0, 1, 2].map((x) => ({ x, y: 4 })).concat([3, 4, 5].map((x) => ({ x, y: 2 })))));
  });

  it('counts its cells as its area', () => {
    expect(roomArea(lRoom())).toBe(24);
  });

  it('grows climbers along its six sides', () => {
    const shaped = lRoom();
    const floor = { rooms: [shaped], doors: [], stairs: [], columns: [], props: [], terrain: [], waterCells: [] };
    const runs = wallRuns(shaped, [], new GrowthSpace(floor));
    expect(runs).toHaveLength(1);
    const points = runs[0]!.points;
    expect(points).toHaveLength(22 / RUN_STEP);
    const mask = keys(shaped.cells ?? []);
    for (const p of points) {
      const onEdge = [-0.01, 0.01].some((dx) => [-0.01, 0.01].some((dy) => mask.has(cellKey(Math.floor(p.x + dx), Math.floor(p.y + dy))))) &&
        [-0.01, 0.01].some((dx) => [-0.01, 0.01].some((dy) => !mask.has(cellKey(Math.floor(p.x + dx), Math.floor(p.y + dy)))));
      expect(onEdge).toBe(true);
    }
    const turns = points.filter((p, i) => {
      const a = points[(i - 1 + points.length) % points.length]!;
      const b = points[(i + 1) % points.length]!;
      return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
    });
    expect(turns).toHaveLength(6);
  });
});

describe('water walls', () => {
  it('are the floor marks grown by a cell, as the walled rectangles were', () => {
    for (let k = 1; k <= 50; k++) {
      const model = generateDungeon({ seed: k * 7919, theme: k % 2 ? 'fortress' : 'mansion', tags: [], floors: 1 + (k % 2) });
      for (const floor of model.floors) {
        const grid = gridAround(floor.rooms);
        const walls = wallMarks(grid, floorMarks(grid, floor.rooms));
        const rects = keys(floor.rooms.flatMap((r) => cellsOf(wallRect(r))));
        for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) expect(walls[y * grid.w + x] === 1).toBe(rects.has(cellKey(x + grid.x0, y + grid.y0)));
      }
    }
  });
});

describe('the map preview', () => {
  it('roomAt answers the tunnel for a cell its mask claimed outside its rectangle', () => {
    const chamber = lRoom();
    const tunnel: DungeonRoom = {
      ...room(1, { x: 6, y: 1, w: 3, h: 1, kind: 'corridor', axis: { x: 1, y: 0 } }),
      cells: [
        { x: 6, y: 1 },
        { x: 7, y: 1 },
        { x: 7, y: 2 },
        { x: 8, y: 2 },
      ],
    };
    const floor: DungeonFloor = {
      rooms: [chamber, tunnel],
      doors: [entrance],
      columns: [],
      props: [],
      rubble: [],
      cracks: [],
      water: [],
      waterCells: [],
      stairs: [],
      terrain: [],
      growth: [],
    };
    const model: DungeonModel = { version: 3, seed: 1, theme: 'cavern', tags: [], floors: [floor] };
    const map = { originCell: { x: 0, y: 0 }, cellsWide: 10, cellsHigh: 6, widthPx: 100, heightPx: 60, pxPerCell: 10 };
    expect(holdsCell(tunnel, 8, 2)).toBe(true);
    expect(floorRect(tunnel).y1).toBe(1);
    expect(roomAt(model, { secrets: true }, map, { x: 85, y: 25 })).toBe(1);
    expect(roomAt(model, { secrets: true }, map, { x: 45, y: 45 })).toBeNull();
    expect(roomAt(model, { secrets: true }, map, { x: 25, y: 45 })).toBe(0);
  });
});
