import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { inPocket, filledPockets } from '../../../src/app/dungeons/render/pockets';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { addDoor, addRoom, emptyModel, entryFloor } from '../../fixtures/dungeonModelBuilder';

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
    // Seed 606: a lozenge of rock the passages ring, open to the outer rock by a neck narrower than two bands.
    const cave = visibleDungeon(generateDungeon({ seed: 606, theme: 'cavern', tags: ['medium', 'wet'], floors: 2 }), DEFAULT_VIEW);
    const filled = filledPockets(cave, 0.62);
    expect(cave.field.distance(-16, -8)).toBeGreaterThan(1.24);
    expect(inPocket(filled, -16, -8)).toBe(true);
    expect(inPocket(filled, cave.bounds.minX - 1, cave.bounds.minY - 1)).toBe(false);
    expect(inPocket(filled, -23, -23)).toBe(false);
  });
});
