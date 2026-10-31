import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { CaveWay, DungeonModel } from '../../../../src/app/dungeons/model';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { floorFeatures } from '../../../../src/app/dungeons/scene/toFeatures';
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

  it('gives a walk no feature', () => {
    // A dry cave: no sump's water carries a way's name.
    const model = generateDungeon({ seed: 5_151, theme: 'cavern', tags: ['dry'], floors: 1 });
    for (const door of model.floors[0]!.doors) door.way = 'walk';
    const names = new Set(EXPECTED.map(([, name]) => name));
    expect(featuresOf(model).filter((f) => names.has(f.name))).toEqual([]);
  });

  it('keeps a large cave within the features a level holds', () => {
    for (const seed of [11, 12, 13]) {
      const model = generateDungeon({ seed, theme: 'cavern', tags: ['large', 'spacious'], floors: 1 });
      expect(featuresOf(model).length).toBeLessThanOrEqual(MAX_MAP_FEATURES);
    }
  });
});
