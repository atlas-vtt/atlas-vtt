import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { luminance, paletteOf, parseHex } from '../../../src/app/dungeons/render/palette';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { floorLiquids } from '../../../src/app/dungeons/scene/toLiquids';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { DUNGEON_STYLES } from '../../../src/app/dungeons/styleCatalog';
import { liquidList, liquidsFromFile } from '../../../src/app/liquids/liquids';
import type { LiquidSurface } from '../../../src/app/types/liquidTypes';

const pool: LiquidSurface = { id: 'pool', kind: 'liquid', liquid: 'water', polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], colors: { surface: '#123456', deep: '#012345', glint: '#abcdef' } };

describe('water keeps the map drawing language', () => {
  it('preserves engraved water through the file reader, leaving old scenes painted', () => {
    const record = { engraved: { ...pool, art: 'engraved' }, old: pool, future: { ...pool, art: 'future' } };
    const saved: unknown = JSON.parse(JSON.stringify(record));
    const read = liquidList(liquidsFromFile(saved));
    expect(read[0]).toMatchObject({ art: 'engraved' });
    expect(read[1]).toEqual({ ...pool, id: 'old' });
    expect(read[2]).toEqual({ ...pool, id: 'future' });
  });

  const model = generateDungeon({ seed: 909, theme: 'cavern', tags: ['small', 'wet'], floors: 1 });
  for (const { id, style } of DUNGEON_STYLES) for (const monochrome of [false, true]) {
    it(`carries ${id}${monochrome ? ' monochrome' : ''} water in the art's own pigments`, () => {
      const view = { ...DEFAULT_VIEW, monochrome };
      const layout = mapLayout(model, 150, view);
      const surfaces = liquidList(floorLiquids(visibleDungeon(model, view, 0), style, view, { originCell: layout.originCell, pxPerCell: 150 }, { unitType: 'feet', ruleDistance: 5 }, 'test').liquids).filter(s => s.liquid === 'water');
      expect(surfaces.length).toBeGreaterThan(0);
      const palette = paletteOf(style, view);
      for (const surface of surfaces) {
        if (style.direction === 'engraved') expect(surface).toMatchObject({ art: 'engraved' });
        else expect(surface).not.toHaveProperty('art');
        if (style.direction === 'engraved') {
          expect(surface.colors.deep).toBe(palette.ink);
          expect(surface.colors.glint).toBe(monochrome ? palette.floor : surface.colors.surface);
        } else {
          expect(luminance(parseHex(surface.colors.deep))).toBeLessThanOrEqual(luminance(parseHex(surface.colors.surface)));
        }
        if (monochrome) {
          const a = parseHex(palette.ink);
          const b = parseHex(palette.floor);
          for (const color of Object.values(surface.colors)) for (const [c, value] of parseHex(color).entries()) {
            expect(value).toBeGreaterThanOrEqual(Math.min(a[c]!, b[c]!));
            expect(value).toBeLessThanOrEqual(Math.max(a[c]!, b[c]!));
          }
        }
      }
    });
  }
});
