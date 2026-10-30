import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';

describe('generateDungeon', () => {
  it('gives the same dungeon for the same request, over many seeds and every floor count', () => {
    const sets = [[], ['large', 'ordered', 'wet'], ['small', 'string'], ['secret', 'round', 'colonnades']];
    for (let seed = 1; seed <= 250; seed++) {
      const request = { seed: seed * 104_729, tags: sets[seed % sets.length]!, floors: 1 + (seed % 4) };
      expect(generateDungeon(request)).toEqual(generateDungeon(request));
    }
  }, 120_000);

  it('holds no text and no story: a dungeon is named by the GM alone', () => {
    const model = generateDungeon({ seed: 77, theme: 'fortress', tags: ['colonnades'], floors: 2 });
    expect(Object.keys(model).sort()).toEqual(['floors', 'seed', 'tags', 'theme', 'version']);
    for (const floor of model.floors) {
      expect(Object.keys(floor).sort()).toEqual(['columns', 'cracks', 'doors', 'growth', 'props', 'rooms', 'rubble', 'stairs', 'terrain', 'water', 'waterCells']);
      for (const room of floor.rooms) expect(['regular', 'secret']).toContain(room.wing);
      for (const door of floor.doors) expect(['opening', 'door', 'secret', 'steps']).toContain(door.kind);
    }
  });

  it('gives other seeds other dungeons', () => {
    const a = generateDungeon({ seed: 1, tags: [], floors: 1 });
    const b = generateDungeon({ seed: 2, tags: [], floors: 1 });
    expect(b.floors[0]!.rooms).not.toEqual(a.floors[0]!.rooms);
  });

  it('starts at an opening in (0, 0) on the entry floor', () => {
    const model = generateDungeon({ seed: 9, tags: [], floors: 1, theme: 'fortress' });
    expect(model.floors[0]!.doors[0]).toMatchObject({ x: 0, y: 0, kind: 'opening', from: null, to: 0 });
  });

  it('reads a floor count out of range as the nearest it can build', () => {
    expect(generateDungeon({ seed: 3, tags: [], floors: 0 }).floors).toHaveLength(1);
    expect(generateDungeon({ seed: 3, tags: [], floors: 9 }).floors).toHaveLength(4);
  });

  it('follows the water level the GM asks for', () => {
    const dry = generateDungeon({ seed: 5, tags: ['flooded'], floors: 1, waterLevel: 0 }).floors[0]!;
    const wet = generateDungeon({ seed: 5, tags: ['dry'], floors: 1, waterLevel: 0.7 }).floors[0]!;
    expect(dry.waterCells.length).toBeLessThan(wet.waterCells.length);
    expect(wet.water.length).toBeGreaterThan(0);
    wet.water.forEach((pool) => expect(pool.outline.length).toBeGreaterThan(5));
  });

  it('never moves a room when only the look is drawn anew: layout, stairs and props come from streams of their own', () => {
    const a = generateDungeon({ seed: 31, tags: ['wet'], floors: 2, waterLevel: 0.1 });
    const b = generateDungeon({ seed: 31, tags: ['wet'], floors: 2, waterLevel: 0.5 });
    // A cave's water level decides where its lakes lie, and with them the types of its low rooms.
    const layout = (model: typeof a): unknown[] => model.floors.map((f) => [f.rooms.map(({ type: _type, ...room }) => room), f.doors, f.stairs]);
    expect(layout(b)).toEqual(layout(a));
  });
});
