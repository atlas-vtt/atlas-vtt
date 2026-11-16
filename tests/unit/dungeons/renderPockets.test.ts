import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { cellsOf } from '../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonModel, DungeonRoom } from '../../../src/app/dungeons/model';
import { inPocket, filledPockets } from '../../../src/app/dungeons/render/pockets';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { addDoor, addRoom, emptyModel, entryFloor } from '../../fixtures/dungeonModelBuilder';

/** Cells x0..x1 × y0..y1, both ends included. */
const block = (x0: number, y0: number, x1: number, y1: number): CellPoint[] => cellsOf({ x0, y0, x1, y1 });

/**
 * A cave of two passages, built by hand so the generator's changes never move it. A ring round a
 * 4 × 4 lozenge of rock, broken by one cell of rock (5, 4) at its south-east corner: a neck one
 * cell wide, which bands 0.62 wide close. East of it a U whose arms stand seven cells apart round
 * a bay of rock, open to the south.
 */
function bandedCave(): DungeonModel {
  const model: DungeonModel = { ...emptyModel(10), theme: 'cavern' };
  const floor = entryFloor(model);
  floor.cave = { lane: [], heights: [], faults: [], basins: [], streams: [], dams: [] };
  const ring = [...block(0, 0, 5, 0), ...block(0, 5, 5, 5), ...block(0, 1, 0, 4), ...block(5, 1, 5, 3)];
  const u = [...block(6, 0, 16, 0), ...block(8, 1, 8, 6), ...block(16, 1, 16, 6)];
  addRoom(floor, { x: 0, y: 0, w: 6, h: 6, axis: { x: 0, y: 1 }, cells: ring } as DungeonRoom);
  addRoom(floor, { x: 6, y: 0, w: 11, h: 7, axis: { x: 1, y: 0 }, parent: 0, cells: u } as DungeonRoom);
  addDoor(floor, 2, -1, { x: 0, y: 1 }, 'opening', null, 0);
  addDoor(floor, 6, 0, { x: 1, y: 0 }, 'opening', 0, 1);
  return model;
}

describe('rock the rooms close in on', () => {
  // A dungeon with rock walled in between its rooms.
  const dungeon = visibleDungeon(generateDungeon({ seed: 16, tags: [], floors: 1 }), DEFAULT_VIEW);
  const pockets = filledPockets(dungeon, 0.5);

  it('finds rock walled in on all sides, where the band did not reach', () => {
    expect(pockets.length).toBeGreaterThan(0);
    // Farther than the hatching distance from every floor somewhere inside, yet walled in on all sides.
    const deep = pockets.flatMap(({ bounds }) => {
      const out: { x: number; y: number }[] = [];
      for (let y = bounds.minY; y < bounds.maxY; y += 0.1) for (let x = bounds.minX; x < bounds.maxX; x += 0.1) out.push({ x, y });
      return out;
    }).find(({ x, y }) => inPocket(pockets, x, y) && dungeon.field.distance(x, y) > 0.5);
    expect(deep).toBeDefined();
  });

  it('never counts a floor or the open ground outside as a pocket', () => {
    const { bounds } = dungeon;
    for (let y = bounds.minY - 2; y < bounds.maxY + 2; y += 0.25) {
      for (let x = bounds.minX - 2; x < bounds.maxX + 2; x += 0.25) {
        if (inPocket(pockets, x, y)) expect(dungeon.field.distance(x, y), `${x},${y}`).toBeGreaterThan(-0.05);
      }
    }
    expect(inPocket(pockets, bounds.minX - 1, bounds.minY - 1)).toBe(false);
  });

  it('leaves a courtyard wider than the band open ground', () => {
    const model = emptyModel(1);
    const floor = entryFloor(model);
    // Four halls around a 4 × 4 yard, joined at the corners by single cells.
    addRoom(floor, { x: 0, y: 0, w: 6, h: 1 });
    addRoom(floor, { x: 0, y: 5, w: 6, h: 1 });
    addRoom(floor, { x: 0, y: 1, w: 1, h: 4 });
    addRoom(floor, { x: 5, y: 1, w: 1, h: 4 });
    addDoor(floor, -1, 0, { x: 1, y: 0 }, 'opening', null, 0);
    const ring = visibleDungeon(model, DEFAULT_VIEW);
    expect(filledPockets(ring, 0.5)).toEqual([]);
    expect(filledPockets(ring, 1.5)).toHaveLength(1);
  });

  it('in a cave, fills the rock the band closes off however wide, but never the open paper round it', () => {
    const cave = visibleDungeon(bandedCave(), DEFAULT_VIEW);
    const filled = filledPockets(cave, 0.62);
    // The lozenge the ring walls in, two cells from its floor, open to the outer rock by a neck narrower than two bands.
    expect(cave.field.distance(3, 3)).toBeGreaterThan(1.24);
    expect(inPocket(filled, 3, 3)).toBe(true);
    expect(inPocket(filled, cave.bounds.minX - 1, cave.bounds.minY - 1)).toBe(false);
    // The bay between the arms of the U, open wide onto the outer rock.
    expect(cave.field.distance(12.5, 4)).toBeGreaterThan(1.24);
    expect(inPocket(filled, 12.5, 4)).toBe(false);
  });
});
