import { expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { floorLiquids } from '../../../src/app/dungeons/scene/toLiquids';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { liquidList, liquidsFromFile } from '../../../src/app/liquids/liquids';

it('keeps engraved acid in the map ink palette through a scene round trip', () => {
  const style = dungeonStyle('blueprint');
  const liquidsOf = (seed: number): ReturnType<typeof floorLiquids>['liquids'] => {
    const model = generateDungeon({ seed, tags: ['acid', 'large'], floors: 1 });
    return floorLiquids(visibleDungeon(model, DEFAULT_VIEW), style, DEFAULT_VIEW, { originCell: { x: 0, y: 0 }, pxPerCell: 100 }, { unitType: 'ft', ruleDistance: 5 }, 'acid').liquids;
  };
  // The first dungeon from seed 43 on that holds acid.
  let liquids = liquidsOf(43);
  for (let seed = 44; seed < 80 && !Object.values(liquids).some((surface) => surface.liquid === 'acid'); seed++) liquids = liquidsOf(seed);
  const read = liquidList(liquidsFromFile(JSON.parse(JSON.stringify(liquids))));
  const acid = read.filter(surface => surface.liquid === 'acid');
  expect(acid.length).toBeGreaterThan(0);
  expect(acid[0]).toMatchObject({ art: 'engraved', colors: { deep: style.colors.ink, glint: style.colors.ink } });
});

it('reads old acid surfaces without inventing an art direction and ignores unknown directions', () => {
  const base = { liquid: 'acid', polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] };
  const surfaces = liquidList(liquidsFromFile({ old: base, bad: { ...base, art: 'neon' }, ink: { ...base, art: 'engraved' } }));
  expect(surfaces[0]).not.toHaveProperty('art');
  expect(surfaces[1]).not.toHaveProperty('art');
  expect(surfaces[2]).toHaveProperty('art', 'engraved');
});

it('keeps monochrome acid between the illustration’s two pigments', () => {
  for (const look of ['parchment', 'night', 'blueprint', 'print']) {
    const style = dungeonStyle(look);
    const view = { ...DEFAULT_VIEW, monochrome: true };
    const model = generateDungeon({ seed: 43, tags: ['acid', 'large'], floors: 1 });
    const { liquids } = floorLiquids(visibleDungeon(model, view), style, view, { originCell: { x: 0, y: 0 }, pxPerCell: 100 }, { unitType: 'ft', ruleDistance: 5 }, 'mono');
    for (const acid of Object.values(liquids).filter(surface => surface.liquid === 'acid')) {
      // A grey engraving must not gain green; blue reversed ink must remain blue dominant.
      for (const color of Object.values(acid.colors)) {
        const channels = [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16));
        if (look === 'print') expect(channels[0]).toBe(channels[1]);
        if (look === 'blueprint') expect(channels[2]).toBeGreaterThanOrEqual(channels[1]!);
      }
    }
  }
});
