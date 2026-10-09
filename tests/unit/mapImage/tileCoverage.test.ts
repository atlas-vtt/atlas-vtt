import { describe, expect, it } from 'vitest';
import { tileCoverage, type TileCoverage } from '../../../src/app/pixi/mapImage/tileCoverage';
import { childTiles, pyramidOf, tileKey, type TileRef } from '../../../src/app/pixi/mapImage/pyramid';

const t = (level: number, col: number, row: number): TileRef => ({ level, col, row });
const keys = (tiles: TileRef[]): string[] => tiles.map(tileKey);
const keySet = (tiles: TileRef[]): Set<string> => new Set(keys(tiles));

interface Readable {
  draw: string[];
  hidden: string[];
  retain: string[];
  missing: string[];
}

function readable(result: TileCoverage): Readable {
  return {
    draw: keys(result.draw),
    hidden: keys(result.hidden),
    retain: keys(result.retain),
    missing: keys(result.missing),
  };
}

/** Loaded tiles, some of them opaque (fade finished). */
function cover(
  pyramid: ReturnType<typeof pyramidOf>,
  wanted: TileRef[],
  loaded: TileRef[],
  opaque: TileRef[] = loaded,
): Readable {
  return readable(tileCoverage(pyramid, wanted, keySet(loaded), keySet(opaque)));
}

// 2040 × 2040: level 0 is 4 × 4 tiles, level 1 is 2 × 2, level 2 is one tile.
const square = pyramidOf(2040, 2040);
const quarter = childTiles(square, t(1, 0, 0));

describe('tileCoverage', () => {
  it('draws loaded wanted tiles and releases everything else', () => {
    const result = cover(square, quarter, [...quarter, t(1, 0, 0), t(2, 0, 0)]);
    expect(result.draw).toEqual(['0/0/0', '0/1/0', '0/0/1', '0/1/1']);
    expect(result.hidden).toEqual([]);
    expect(result.retain).toEqual(result.draw);
    expect(result.missing).toEqual([]);
  });

  it('falls back on the nearest loaded ancestor while a tile is missing', () => {
    const result = cover(square, quarter, [quarter[0], t(1, 0, 0), t(2, 0, 0)]);
    expect(result.draw).toEqual(['1/0/0', '0/0/0']);
    expect(result.missing).toEqual(['0/1/0', '0/0/1', '0/1/1']);
  });

  it('keeps fading ancestors up to the first opaque one, coarsest first', () => {
    const result = cover(square, [t(0, 0, 0)], [t(1, 0, 0), t(2, 0, 0)], [t(2, 0, 0)]);
    expect(result.draw).toEqual(['2/0/0', '1/0/0']);
  });

  it('keeps the ancestor under a wanted tile that is still fading in', () => {
    const result = cover(square, [t(0, 0, 0)], [t(0, 0, 0), t(1, 0, 0)], [t(1, 0, 0)]);
    expect(result.draw).toEqual(['1/0/0', '0/0/0']);
    expect(result.missing).toEqual([]);
  });

  it('never retains ancestors more than five levels up', () => {
    const tall = pyramidOf(16383, 8800);
    expect(tall.levels).toHaveLength(7);
    expect(cover(tall, [t(0, 0, 0)], [t(6, 0, 0)]).retain).toEqual([]);
    expect(cover(tall, [t(0, 0, 0)], [t(5, 0, 0), t(6, 0, 0)]).draw).toEqual(['5/0/0']);
    expect(cover(tall, [t(0, 0, 0)], [t(5, 0, 0), t(6, 0, 0)], [t(6, 0, 0)]).draw).toEqual(['5/0/0']);
  });

  it('falls back on loaded descendants while zooming out', () => {
    const result = cover(square, [t(1, 0, 0)], quarter);
    expect(result.draw).toEqual(['0/0/0', '0/1/0', '0/0/1', '0/1/1']);
    expect(result.missing).toEqual(['1/0/0']);
  });

  it('looks two levels down past missing or fading children, never three', () => {
    const deep = pyramidOf(4080, 4080);
    expect(deep.levels).toHaveLength(4);
    const grandchild = t(0, 0, 0);
    expect(cover(deep, [t(2, 0, 0)], [grandchild]).draw).toEqual(['0/0/0']);
    expect(cover(deep, [t(2, 0, 0)], [grandchild, t(1, 0, 0)], [grandchild]).draw).toEqual(['1/0/0', '0/0/0']);
    expect(cover(deep, [t(3, 0, 0)], [t(0, 0, 0), t(1, 0, 0)]).draw).toEqual(['1/0/0']);
    expect(cover(deep, [t(3, 0, 0)], [t(0, 0, 0)]).retain).toEqual([]);
  });

  it('stops at an opaque child', () => {
    const deep = pyramidOf(4080, 4080);
    const result = cover(deep, [t(2, 0, 0)], [t(1, 0, 0), t(0, 0, 0)]);
    expect(result.draw).toEqual(['1/0/0']);
    expect(result.retain).not.toContain('0/0/0');
  });

  it('hides a coarse tile once opaque finer drawn tiles cover it', () => {
    const fading = cover(square, [t(1, 0, 0)], [t(1, 0, 0), ...quarter], quarter);
    expect(fading.hidden).toEqual(['1/0/0']);
    expect(fading.draw).toEqual(['0/0/0', '0/1/0', '0/0/1', '0/1/1']);
    expect(fading.retain).toEqual([...fading.draw, ...fading.hidden]);
  });

  it('keeps a coarse tile drawn while any finer tile over it is missing or fading', () => {
    const oneMissing = cover(square, [t(1, 0, 0)], [t(1, 0, 0), ...quarter.slice(1)], quarter.slice(1));
    expect(oneMissing.draw[0]).toBe('1/0/0');
    expect(oneMissing.hidden).toEqual([]);
    const oneFading = cover(square, [t(1, 0, 0)], [t(1, 0, 0), ...quarter], quarter.slice(1));
    expect(oneFading.draw[0]).toBe('1/0/0');
    expect(oneFading.hidden).toEqual([]);
  });

  it('hides the coarse level under transparent tiles once they have faded in', () => {
    // The GM camera wants level 0 and a demand region the overview: the tiles' own alpha would let the
    // overview show through, so only the fade decides and the overview is hidden.
    const level0 = [t(0, 0, 0), t(0, 1, 0), t(0, 2, 0), t(0, 3, 0), t(0, 0, 1), t(0, 1, 1), t(0, 2, 1), t(0, 3, 1)];
    const result = cover(square, [...level0, t(2, 0, 0)], [...level0, t(1, 0, 0), t(1, 1, 0), t(2, 0, 0)]);
    expect(result.draw).toEqual(['2/0/0', ...keys(level0)]);
    expect(result.hidden).toEqual([]);

    const all = [0, 1, 2, 3].flatMap(row => [0, 1, 2, 3].map(col => t(0, col, row)));
    const covered = cover(square, [...all, t(2, 0, 0)], [...all, t(2, 0, 0)]);
    expect(covered.hidden).toEqual(['2/0/0']);
    expect(covered.draw).toEqual(keys(all));
  });

  it('counts coverage across levels', () => {
    const mixed = [t(1, 0, 0), t(1, 1, 0), t(0, 0, 2), t(0, 1, 2), t(0, 0, 3), t(0, 1, 3), t(1, 1, 1)];
    const result = cover(square, [...mixed, t(2, 0, 0)], [...mixed, t(2, 0, 0)]);
    expect(result.hidden).toEqual(['2/0/0']);
  });

  it('covers edge tiles that have fewer children', () => {
    // 1021 × 600: level 0 is 3 × 2 tiles, level 1 (511 × 300) is 2 × 1; tile 1/1/0 holds 0/2/0 and 0/2/1.
    const edge = pyramidOf(1021, 600);
    const children = [t(0, 2, 0), t(0, 2, 1)];
    expect(keys(childTiles(edge, t(1, 1, 0)))).toEqual(keys(children));
    expect(cover(edge, [t(1, 1, 0)], [t(1, 1, 0), ...children], children).hidden).toEqual(['1/1/0']);
    expect(cover(edge, [t(1, 1, 0)], [t(1, 1, 0), ...children], [children[0]]).hidden).toEqual([]);
  });

  it('serves several views at different levels at once', () => {
    const result = cover(square, [t(0, 3, 3), t(1, 0, 0)], [t(0, 3, 3), t(1, 0, 0)]);
    expect(result.draw).toEqual(['1/0/0', '0/3/3']);
  });

  it('lists each missing tile once, in the order wanted', () => {
    const result = cover(square, [t(0, 2, 2), t(0, 1, 1), t(0, 2, 2)], []);
    expect(result.missing).toEqual(['0/2/2', '0/1/1']);
    expect(result.retain).toEqual([]);
  });

  it('ignores opaque marks of tiles that are not loaded', () => {
    const result = cover(square, [t(0, 0, 0)], [t(2, 0, 0)], [t(1, 0, 0), t(2, 0, 0)]);
    expect(result.draw).toEqual(['2/0/0']);
  });
});
