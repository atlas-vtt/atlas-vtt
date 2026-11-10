import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { paletteOf, mixColours, luminance, parseHex } from '../../../src/app/dungeons/render/palette';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { floorLiquids } from '../../../src/app/dungeons/scene/toLiquids';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { DUNGEON_STYLES } from '../../../src/app/dungeons/styleCatalog';
import { liquidList } from '../../../src/app/liquids/liquids';

function modelWithLava(): ReturnType<typeof generateDungeon> {
  for (let seed = 1; seed < 200; seed++) {
    const model = generateDungeon({ seed, tags: ['dry', 'lava'], floors: 1 });
    if (model.floors[0]!.terrain.some(t => t.traits.hazard === 'lava')) return model;
  }
  throw new Error('No lava');
}
const model = modelWithLava();

describe('lava follows the printed artwork', () => {
  for (const { id, style } of DUNGEON_STYLES) {
    for (const monochrome of [false, true]) {
      it(`keeps ${id}, monochrome ${monochrome}, in its own drawing language`, () => {
        const view = { ...DEFAULT_VIEW, monochrome };
        const palette = paletteOf(style, view);
        const result = floorLiquids(visibleDungeon(model, view), style, view, { originCell: { x: 0, y: 0 }, pxPerCell: 100 }, { unitType: 'feet', ruleDistance: 5 }, 'proof');
        const lava = liquidList(result.liquids).filter(s => s.liquid === 'lava');
        expect(lava.length).toBeGreaterThan(0);
        for (const surface of lava) {
          if (style.direction === 'crayon') expect(surface).toHaveProperty('art', 'crayon');
          if (style.direction === 'engraved') {
            expect(surface).toHaveProperty('art', 'engraved');
            expect(surface.colors.deep).toBe(palette.ink);
            expect(surface.colors.surface).toBe(monochrome ? palette.floor : mixColours(palette.floor, palette.water, 0.5));
          } else if (monochrome) {
            const dark = luminance(parseHex(palette.floor)) < luminance(parseHex(palette.ink));
            expect(surface.colors.deep).toBe(dark ? palette.floor : palette.ink);
            expect(surface.colors.glint).toBe(dark ? palette.ink : palette.floor);
          }
          expect(surface).toHaveProperty('lavaLight');
          const lightId = Reflect.get(surface, 'lavaLight') as string;
          expect(result.lights[lightId]?.emission.animation).toBe('smoulder');
          if (style.direction === 'engraved' || monochrome) expect(result.lights[lightId]?.emission.color).toBe(surface.colors.glint);
        }
      });
    }
  }
  it('reads older lava surfaces without adding an art mode or a light link', () => {
    const surface = { id: 'old', kind: 'liquid' as const, liquid: 'lava' as const, polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], colors: { surface: '#d6602a', deep: '#5c1a0c', glint: '#ffd27a' } };
    expect(liquidList({ old: surface })).toEqual([surface]);
  });
});
