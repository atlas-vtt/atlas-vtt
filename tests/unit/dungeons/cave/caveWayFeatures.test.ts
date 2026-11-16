import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { CaveWay, DungeonModel } from '../../../../src/app/dungeons/model';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { floorFeatures } from '../../../../src/app/dungeons/scene/toFeatures';
import { floorCellsOf } from '../../../../src/app/dungeons/geometry';
import { draft } from '../../../../src/app/dungeons/terrain/catalog';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { MAX_MAP_FEATURES } from '../../../../src/app/mapFeatures/mapFeatures';
import type { MapFeature } from '../../../../src/app/types/mapFeatureTypes';

const PX = 100;

function featuresOf(model: DungeonModel, index = 0): MapFeature[] {
  const layout = mapLayout(model, PX, DEFAULT_VIEW);
  return Object.values(floorFeatures(visibleDungeon(model, DEFAULT_VIEW, index), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: PX }, 'f'));
}

/** What each way's feature is called and does to movement. */
const EXPECTED: readonly [CaveWay, string, boolean][] = [
  ['crawl', 'Crawl', true],
  ['squeeze', 'Squeeze', true],
  ['letterbox', 'Letterbox squeeze', true],
  ['sump', 'Sump', true],
  ['breakdown', 'Breakdown choke', true],
  ['traverse', 'Traverse', false],
];

describe('a cave\'s ways as map features', () => {
  it('names every way that is no walk on its door\'s cells, difficult where a body squeezes, crawls, climbs or swims through', () => {
    const model = generateDungeon({ seed: 5_151, theme: 'cavern', tags: [], floors: 1 });
    const floor = model.floors[0]!;
    for (const door of floor.doors) delete door.way;
    const doors = floor.doors.filter((d) => d.from !== null && d.to !== null && d.kind === 'opening').slice(0, EXPECTED.length);
    expect(doors).toHaveLength(EXPECTED.length);
    doors.forEach((door, i) => (door.way = EXPECTED[i]![0]));
    const features = featuresOf(model);
    const { originCell } = mapLayout(model, PX, DEFAULT_VIEW);
    doors.forEach((door, i) => {
      const [, name, difficult] = EXPECTED[i]!;
      const centre = { x: (door.x + 0.5 - originCell.x) * PX, y: (door.y + 0.5 - originCell.y) * PX };
      const own = features.filter((f) => f.name === name && f.polygon.some((p) => Math.abs(p.x - centre.x) <= PX && Math.abs(p.y - centre.y) <= PX));
      // The ground of a sump nearby may carry the same name: one of them is the door's.
      expect(own.some((f) => (f.terrain?.difficult === true) === difficult), name).toBe(true);
    });
  });

  it('names a climb within the floor with its depth, difficult', () => {
    const model = generateDungeon({ seed: 5_151, theme: 'cavern', tags: ['dry'], floors: 1 });
    const floor = model.floors[0]!;
    for (const door of floor.doors) delete door.way;
    const door = floor.doors.find((d) => d.from !== null && d.to !== null && d.kind === 'opening')!;
    door.way = 'climb';
    door.drop = { depth: 20, kind: 'chimney' };
    const climbs = featuresOf(model).filter((f) => f.name === 'Climb, 20 ft');
    expect(climbs).toHaveLength(1);
    expect(climbs[0]!.terrain?.difficult).toBe(true);
  });

  it('gives a walk no feature', () => {
    // A dry cave: no sump's water carries a way's name.
    const model = generateDungeon({ seed: 5_151, theme: 'cavern', tags: ['dry'], floors: 1 });
    for (const door of model.floors[0]!.doors) door.way = 'walk';
    for (const room of model.floors[0]!.rooms) delete room.narrow;
    const names = new Set(EXPECTED.map(([, name]) => name));
    expect(featuresOf(model).filter((f) => names.has(f.name))).toEqual([]);
  });

  it('names a narrow route along its whole passage, one difficult stretch with its doors', () => {
    let found = 0;
    for (const seed of [5_151, 6_262, 7_373, 8_484]) {
      const model = generateDungeon({ seed, theme: 'cavern', tags: ['dry'], floors: 1 });
      const { originCell } = mapLayout(model, PX, DEFAULT_VIEW);
      const features = featuresOf(model);
      for (const room of model.floors[0]!.rooms.filter((r) => r.narrow)) {
        const name = EXPECTED.find(([way]) => way === room.narrow)![1];
        const inside = (f: MapFeature, c: { x: number; y: number }): boolean => {
          const x = (c.x + 0.5 - originCell.x) * PX;
          const y = (c.y + 0.5 - originCell.y) * PX;
          let odd = false;
          for (let i = 0, j = f.polygon.length - 1; i < f.polygon.length; j = i++) {
            const a = f.polygon[i]!;
            const b = f.polygon[j]!;
            if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) odd = !odd;
          }
          return odd;
        };
        for (const c of floorCellsOf(room)) expect(features.some((f) => f.name === name && f.terrain?.difficult === true && inside(f, c)), `${seed} room ${room.id} at ${c.x},${c.y}`).toBe(true);
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('names a way up or down by how it is passed, with its depth', () => {
    const model = generateDungeon({ seed: 5_151, theme: 'cavern', tags: [], floors: 1 });
    const floor = model.floors[0]!;
    floor.terrain = floor.terrain.filter((p) => p.kind !== 'aven' && p.kind !== 'shaft');
    const room = floor.rooms.find((r) => r.kind === 'room' && floorCellsOf(r).length >= 4)!;
    const cells = floorCellsOf(room);
    const pieces = [
      ['shaft', 30, 'shaft', 'Shaft, 30 ft'],
      ['shaft', 20, 'chimney', 'Chimney, 20 ft'],
      ['aven', 40, 'shaft', 'Aven, 40 ft'],
      ['aven', 10, 'squeeze', 'Vertical squeeze, 10 ft'],
    ] as const;
    pieces.forEach(([kind, depth, way], k) => {
      floor.terrain.push({ ...draft(kind, room.id, [cells[k]!], { traits: { drop: { depth, kind: way } } }), ...(kind === 'shaft' && { opening: { bottom: null, link: 90 + k } }), id: floor.terrain.length });
    });
    const names = featuresOf(model).map((f) => f.name);
    for (const [, , , name] of pieces) expect(names).toContain(name);
  });

  it('keeps a large cave within the features a level holds', () => {
    for (const seed of [11, 12, 13]) {
      const model = generateDungeon({ seed, theme: 'cavern', tags: ['large', 'spacious'], floors: 1 });
      expect(featuresOf(model).length).toBeLessThanOrEqual(MAX_MAP_FEATURES);
    }
  });
});
