import { beforeAll, describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { holdsCell } from '../../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonModel, DungeonTerrain } from '../../../../src/app/dungeons/model';
import { placeWater } from '../../../../src/app/dungeons/water';
import { room } from '../plannedFloorFixtures';

/**
 * The shapes Veins of the Earth gives a cave's hazards: lava, acid and streams that meander and
 * swell, never a straight file of cells; chasms as wide as their chamber makes them, and in great
 * chambers an abyss at the edge; rimstone whose pools are the water they border.
 */

const TAGS: string[][] = [['lava', 'deep'], ['acid'], ['large'], ['spacious', 'deep'], ['wet'], ['acid', 'large'], ['flooded', 'spacious']];
const CAVES = 84;

const key = (c: CellPoint): string => `${c.x},${c.y}`;

/** The longest straight file of single cells in the piece: cells in a row along a grid line with no cell of it to either side. */
function longestFile(cells: readonly CellPoint[]): number {
  const has = new Set(cells.map(key));
  const at = (x: number, y: number): boolean => has.has(`${x},${y}`);
  let longest = 0;
  for (const [sx, sy] of [[1, 0], [0, 1]] as const) {
    const single = (x: number, y: number): boolean => at(x, y) && !at(x + sy, y + sx) && !at(x - sy, y - sx);
    for (const c of cells) {
      let n = 0;
      while (single(c.x + sx * n, c.y + sy * n)) n++;
      longest = Math.max(longest, n);
    }
  }
  return longest;
}

/** A chasm's mean width: its cells over its length along its run. */
function meanWidth(cells: readonly CellPoint[]): number {
  const n = cells.length;
  const mx = cells.reduce((s, c) => s + c.x, 0) / n;
  const my = cells.reduce((s, c) => s + c.y, 0) / n;
  const [xx, yy, xy] = cells.reduce(([a, b, d], c) => [a + (c.x - mx) ** 2, b + (c.y - my) ** 2, d + (c.x - mx) * (c.y - my)], [0, 0, 0]);
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const along = cells.map((c) => c.x * Math.cos(angle) + c.y * Math.sin(angle));
  return n / (Math.max(...along) - Math.min(...along) + 1);
}

describe('a cave’s chasms and flows', () => {
  const models: DungeonModel[] = [];

  beforeAll(() => {
    for (let k = 0; k < CAVES; k++) models.push(generateDungeon({ seed: 7001 + k * 6337, theme: 'cavern', tags: TAGS[k % TAGS.length]!, floors: 1 + (k % 3) }));
  }, 120_000);

  const pieces = (which: (p: DungeonTerrain) => boolean): { model: DungeonModel; floor: number; piece: DungeonTerrain }[] =>
    models.flatMap((model) => model.floors.flatMap((floor, f) => floor.terrain.filter(which).map((piece) => ({ model, floor: f, piece }))));

  it('runs lava, acid and streams in channels that swell now and then, never a straight file of more than three cells', () => {
    const channels = pieces((p) => p.kind === 'channel');
    expect(channels.filter(({ piece }) => piece.traits.hazard === 'lava' || piece.traits.hazard === 'acid').length).toBeGreaterThan(5);
    expect(channels.filter(({ piece }) => longestFile(piece.cells) > 3).map(({ model, floor, piece }) => `seed ${model.seed} floor ${floor}: ${piece.traits.hazard} ${piece.id}`)).toEqual([]);
  });

  it('opens wider chasms in larger chambers', () => {
    const chasms = pieces((p) => p.kind === 'chasm' && p.facing === undefined && p.under === undefined);
    const widthIn = (tiers: readonly string[]): number[] => chasms.filter(({ model, floor, piece }) => tiers.includes(model.floors[floor]!.rooms[piece.room]!.tier ?? '')).map(({ piece }) => meanWidth(piece.cells));
    const mean = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
    const great = widthIn(['house', 'hall', 'gargantuan']);
    expect(great.length).toBeGreaterThan(10);
    expect(mean(great)).toBeGreaterThan(1.7);
    expect(mean(great)).toBeGreaterThan(mean(widthIn(['room', 'double', 'triple'])) + 0.3);
  });

  it('ends some great chambers at an abyss along one side', () => {
    expect(pieces((p) => p.kind === 'chasm' && p.facing !== undefined).length).toBeGreaterThan(3);
  });

  it('floods the rimstone that borders water, so its pools are that water, and leaves the rest dry', () => {
    const rimstone = pieces((p) => p.kind === 'rimstone');
    expect(rimstone.length).toBeGreaterThan(50);
    const split = rimstone.filter(({ model, floor, piece }) => {
      const wet = new Set(model.floors[floor]!.waterCells.map(key));
      const under = piece.cells.filter((c) => wet.has(key(c))).length;
      return under > 0 && under < piece.cells.length;
    });
    expect(split.length).toBeLessThanOrEqual(rimstone.length * 0.02);
    const besideWater = rimstone.filter(({ model, floor, piece }) => {
      const level = model.floors[floor]!;
      const own = level.rooms[piece.room]!;
      const water = new Set([...level.waterCells, ...level.terrain.filter((p) => p.traits.hazard === 'deep-water').flatMap((p) => p.cells)].map(key));
      const mine = new Set(piece.cells.map(key));
      return piece.cells.some((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const n = { x: c.x + dx!, y: c.y + dy! };
        return !mine.has(key(n)) && holdsCell(own, n.x, n.y) && water.has(key(n));
      }));
    });
    const flooded = besideWater.filter(({ model, floor, piece }) => piece.cells.every((c) => model.floors[floor]!.waterCells.some((w) => w.x === c.x && w.y === c.y)));
    expect(flooded.length).toBeGreaterThanOrEqual(besideWater.length * 0.9);
  });
});

describe('ground that floods with the water beside it', () => {
  const rooms = [room(0, { x: 0, y: 0, w: 8, h: 6 })];
  const deep = [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 3 }];

  it('takes the water it borders, as one body with it', () => {
    const { water, waterCells } = placeWater(5, 0, rooms, { level: 0, pools: new Set(), deep, natural: true, floods: [{ room: 0, cells: [{ x: 3, y: 2 }, { x: 4, y: 2 }] }] });
    expect(waterCells.map(key).sort()).toEqual(['3,2', '4,2']);
    expect(water).toHaveLength(1);
  });

  it('stays dry away from water, and where the dry ground keeps it so', () => {
    expect(placeWater(5, 0, rooms, { level: 0, pools: new Set(), deep, natural: true, floods: [{ room: 0, cells: [{ x: 5, y: 2 }, { x: 6, y: 2 }] }] }).waterCells).toEqual([]);
    expect(placeWater(5, 0, rooms, { level: 0, pools: new Set(), deep, natural: true, dry: new Set(['3,2']), floods: [{ room: 0, cells: [{ x: 3, y: 2 }] }] }).waterCells).toEqual([]);
  });
});
