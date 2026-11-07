import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import * as floorStones from '../../../../src/app/dungeons/render/art/floorStones';
import { CAVE_GROUND } from '../../../../src/app/dungeons/render/cave/ground';
import * as stoneWalls from '../../../../src/app/dungeons/render/stone/walls';
import * as engravedWalls from '../../../../src/app/dungeons/render/engraved/walls';
import * as stonework from '../../../../src/app/dungeons/render/stonework';
import * as bricks from '../../../../src/app/dungeons/render/bricks';
import { renderMapSvg } from '../../../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';

const cave = generateDungeon({ seed: 606, theme: 'cavern', tags: ['medium'], floors: 1 });

describe('cave ground', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registers both painters for floor, edge and surround', () => {
    for (const part of ['floor', 'edge', 'surround'] as const) {
      expect(CAVE_GROUND[part]?.stone, `${part}: stone`).toBeTypeOf('function');
      expect(CAVE_GROUND[part]?.engraved, `${part}: engraved`).toBeTypeOf('function');
      expect(CAVE_GROUND[part]?.stone).not.toBe(CAVE_GROUND[part]?.engraved);
    }
  });

  it.each(['masonry', 'sandstone', 'print', 'drafting'] as const)('draws no flagstone or course on a cave floor in %s', look => {
    const stones = vi.spyOn(floorStones, 'floorStones');
    const band = vi.spyOn(stoneWalls, 'drawWallBand');
    const walls = vi.spyOn(engravedWalls, 'drawWalls');
    const blocks = vi.spyOn(stonework, 'drawStonework');
    const courses = vi.spyOn(bricks, 'drawBricks');
    const { svg } = renderMapSvg(cave, dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: 30 });
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<text');
    for (const spy of [stones, band, walls, blocks, courses]) expect(spy).not.toHaveBeenCalled();
  });
});
