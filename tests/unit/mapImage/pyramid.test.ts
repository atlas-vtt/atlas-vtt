import { describe, expect, it } from 'vitest';
import {
  OVERVIEW_MAX_SIDE,
  TILE_CONTENT,
  TILE_OVERLAP,
  TILE_SPEC,
  childTiles,
  parentTile,
  pyramidOf,
  tileContentFrame,
  tileContentRect,
  tileKey,
  tileSourceRect,
  tileWorldRect,
  type Pyramid,
  type TileRef,
} from '../../../src/app/pixi/mapImage/pyramid';

const SIZES: Array<[number, number]> = [
  [16383, 8800], [17000, 12746], [1, 1], [510, 510], [511, 511], [512, 512], [513, 513],
  [1021, 1021], [1022, 1022], [1021, 600], [300, 1022],
];

function tilesOf(p: Pyramid, level: number): TileRef[] {
  const { cols, rows } = p.levels[level];
  const tiles: TileRef[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) tiles.push({ level, col, row });
  return tiles;
}

function allTiles(p: Pyramid): TileRef[] {
  return p.levels.flatMap(level => tilesOf(p, level.index));
}

describe('pyramid constants', () => {
  it('match the agreed tile spec', () => {
    expect(TILE_CONTENT).toBe(510);
    expect(TILE_OVERLAP).toBe(1);
    expect(TILE_SPEC).toBe(2);
    expect(TILE_CONTENT + 2 * TILE_OVERLAP).toBe(512);
  });
});

describe('pyramidOf levels', () => {
  it('halves with rounding up until one tile holds the level', () => {
    expect(pyramidOf(16383, 8800).levels.map(l => [l.width, l.height])).toEqual([
      [16383, 8800], [8192, 4400], [4096, 2200], [2048, 1100], [1024, 550], [512, 275], [256, 138],
    ]);
    expect(pyramidOf(17000, 12746).levels.map(l => [l.width, l.height])).toEqual([
      [17000, 12746], [8500, 6373], [4250, 3187], [2125, 1594], [1063, 797], [532, 399], [266, 200],
    ]);
  });

  it.each(SIZES)('%i × %i: levels, grids, scales and overview follow the rules', (w, h) => {
    const p = pyramidOf(w, h);
    expect(p.width).toBe(w);
    expect(p.height).toBe(h);
    p.levels.forEach((level, n) => {
      expect(level.index).toBe(n);
      expect(level.width).toBe(Math.ceil(w / 2 ** n));
      expect(level.height).toBe(Math.ceil(h / 2 ** n));
      expect(level.cols).toBe(Math.ceil(level.width / TILE_CONTENT));
      expect(level.rows).toBe(Math.ceil(level.height / TILE_CONTENT));
      expect(level.scale).toBe(2 ** n);
    });
    const last = p.levels[p.levels.length - 1];
    expect(Math.max(last.width, last.height)).toBeLessThanOrEqual(TILE_CONTENT);
    expect(last.cols * last.rows).toBe(1);
    p.levels.slice(0, -1).forEach(level => expect(Math.max(level.width, level.height)).toBeGreaterThan(TILE_CONTENT));
    const overview = p.levels[p.overview];
    expect(Math.max(overview.width, overview.height)).toBeLessThanOrEqual(OVERVIEW_MAX_SIDE);
    if (p.overview > 0) {
      const finer = p.levels[p.overview - 1];
      expect(Math.max(finer.width, finer.height)).toBeGreaterThan(OVERVIEW_MAX_SIDE);
    }
    expect(overview.cols * overview.rows).toBeLessThanOrEqual(16);
  });

  it('picks the overview as the finest level within 2048 px', () => {
    expect(pyramidOf(16383, 8800).overview).toBe(3);
    expect(pyramidOf(17000, 12746).overview).toBe(4);
    expect(pyramidOf(2048, 100).overview).toBe(0);
    expect(pyramidOf(2049, 100).overview).toBe(1);
    expect(pyramidOf(1, 1).overview).toBe(0);
  });

  it('has a single level and tile for small images', () => {
    for (const side of [1, 510]) {
      const p = pyramidOf(side, side);
      expect(p.levels).toHaveLength(1);
      expect(p.levels[0]).toMatchObject({ cols: 1, rows: 1 });
    }
    expect(pyramidOf(511, 511).levels).toHaveLength(2);
  });

  it('refuses sizes that are no image', () => {
    expect(() => pyramidOf(0, 10)).toThrow(RangeError);
    expect(() => pyramidOf(10, -1)).toThrow(RangeError);
    expect(() => pyramidOf(10.5, 10)).toThrow(RangeError);
    expect(() => pyramidOf(Number.NaN, 10)).toThrow(RangeError);
    expect(() => pyramidOf(10, 10, 0.5)).toThrow(RangeError);
    expect(() => pyramidOf(10, 10, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('decodedScale', () => {
  it('makes level 0 the decoded size while the world keeps the natural size', () => {
    const p = pyramidOf(17000, 12746, 2);
    expect(p.width).toBe(17000);
    expect(p.height).toBe(12746);
    expect(p.levels[0]).toMatchObject({ width: 8500, height: 6373, scale: 2 });
    expect(p.levels.map(l => l.scale)).toEqual(p.levels.map((_, n) => 2 ** n * 2));
    expect(p.levels[p.levels.length - 1]).toMatchObject({ width: 266, height: 200 });
  });

  it('rounds the decoded size up and ends the last tiles on the world edge', () => {
    const p = pyramidOf(16383, 8801, 4);
    expect(p.levels[0]).toMatchObject({ width: 4096, height: 2201, scale: 4 });
    const level = p.levels[0];
    const corner = tileWorldRect(p, { level: 0, col: level.cols - 1, row: level.rows - 1 });
    expect(corner.x + corner.width).toBeCloseTo(16383, 6);
    expect(corner.y + corner.height).toBeCloseTo(8801, 6);
    expect(level.scaleX).toBeLessThanOrEqual(level.scale);
  });
});

describe('tile rects', () => {
  it.each(SIZES)('%i × %i: content rects tile every level exactly', (w, h) => {
    const p = pyramidOf(w, h);
    for (const level of p.levels) {
      let area = 0;
      for (const tile of tilesOf(p, level.index)) {
        const rect = tileContentRect(p, tile);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        area += rect.width * rect.height;
        const right = tile.col + 1 < level.cols ? tileContentRect(p, { ...tile, col: tile.col + 1 }).x : level.width;
        const below = tile.row + 1 < level.rows ? tileContentRect(p, { ...tile, row: tile.row + 1 }).y : level.height;
        expect(rect.x + rect.width).toBe(right);
        expect(rect.y + rect.height).toBe(below);
      }
      expect(area).toBe(level.width * level.height);
    }
  });

  it.each(SIZES)('%i × %i: overlap only on inner sides, clamped to the level', (w, h) => {
    const p = pyramidOf(w, h);
    for (const tile of allTiles(p)) {
      const level = p.levels[tile.level];
      const content = tileContentRect(p, tile);
      const source = tileSourceRect(p, tile);
      expect(content.x - source.x).toBe(tile.col > 0 ? TILE_OVERLAP : 0);
      expect(content.y - source.y).toBe(tile.row > 0 ? TILE_OVERLAP : 0);
      expect(source.x + source.width - (content.x + content.width)).toBe(tile.col < level.cols - 1 ? TILE_OVERLAP : 0);
      expect(source.y + source.height - (content.y + content.height)).toBe(tile.row < level.rows - 1 ? TILE_OVERLAP : 0);
      expect(source.x).toBeGreaterThanOrEqual(0);
      expect(source.y).toBeGreaterThanOrEqual(0);
      expect(source.x + source.width).toBeLessThanOrEqual(level.width);
      expect(source.y + source.height).toBeLessThanOrEqual(level.height);
      expect(Math.max(source.width, source.height)).toBeLessThanOrEqual(512);
    }
  });

  it.each(SIZES)('%i × %i: the frame is the content within the bitmap', (w, h) => {
    const p = pyramidOf(w, h);
    for (const tile of allTiles(p)) {
      const content = tileContentRect(p, tile);
      const source = tileSourceRect(p, tile);
      const frame = tileContentFrame(p, tile);
      expect(source.x + frame.x).toBe(content.x);
      expect(source.y + frame.y).toBe(content.y);
      expect([frame.width, frame.height]).toEqual([content.width, content.height]);
      expect(frame.x + frame.width).toBeLessThanOrEqual(source.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(source.height);
    }
  });

  it('cuts the edge tiles of 511, 1021 and 1022 px wide levels', () => {
    const p511 = pyramidOf(511, 511);
    expect(tileSourceRect(p511, { level: 0, col: 1, row: 1 })).toEqual({ x: 509, y: 509, width: 2, height: 2 });
    expect(tileContentFrame(p511, { level: 0, col: 1, row: 1 })).toEqual({ x: 1, y: 1, width: 1, height: 1 });
    expect(tileSourceRect(p511, { level: 0, col: 0, row: 0 })).toEqual({ x: 0, y: 0, width: 511, height: 511 });

    const p1021 = pyramidOf(1021, 1021);
    expect(tileSourceRect(p1021, { level: 0, col: 1, row: 0 })).toEqual({ x: 509, y: 0, width: 512, height: 511 });
    expect(tileContentRect(p1021, { level: 0, col: 2, row: 0 })).toEqual({ x: 1020, y: 0, width: 1, height: 510 });

    const p1022 = pyramidOf(1022, 1022);
    expect(tileSourceRect(p1022, { level: 0, col: 2, row: 2 })).toEqual({ x: 1019, y: 1019, width: 3, height: 3 });
    expect(tileContentFrame(p1022, { level: 0, col: 2, row: 2 })).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it('places 1 × 1 as one pixel', () => {
    const p = pyramidOf(1, 1);
    const tile = { level: 0, col: 0, row: 0 };
    expect(tileSourceRect(p, tile)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(tileContentFrame(p, tile)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(tileWorldRect(p, tile)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it.each(SIZES)('%i × %i: world rects scale content and cover the world edge to edge', (w, h) => {
    const p = pyramidOf(w, h);
    for (const tile of allTiles(p)) {
      const { scaleX, scaleY, cols, rows } = p.levels[tile.level];
      const content = tileContentRect(p, tile);
      const world = tileWorldRect(p, tile);
      expect(world).toEqual({
        x: content.x * scaleX, y: content.y * scaleY, width: content.width * scaleX, height: content.height * scaleY,
      });
      if (tile.col === cols - 1) expect(world.x + world.width).toBeCloseTo(w, 6);
      if (tile.row === rows - 1) expect(world.y + world.height).toBeCloseTo(h, 6);
    }
  });

  it('refuses tiles outside the pyramid', () => {
    const p = pyramidOf(1021, 600);
    expect(() => tileSourceRect(p, { level: 0, col: 3, row: 0 })).toThrow(RangeError);
    expect(() => tileWorldRect(p, { level: 0, col: 0, row: -1 })).toThrow(RangeError);
    expect(() => tileContentFrame(p, { level: 9, col: 0, row: 0 })).toThrow(RangeError);
  });
});

describe('tile family', () => {
  it('spells keys as level/col/row', () => {
    expect(tileKey({ level: 3, col: 12, row: 7 })).toBe('3/12/7');
  });

  it.each(SIZES)('%i × %i: parents and children agree and children cover their parent', (w, h) => {
    const p = pyramidOf(w, h);
    for (const tile of allTiles(p)) {
      const parent = parentTile(p, tile);
      if (tile.level === p.levels.length - 1) {
        expect(parent).toBeNull();
      } else {
        expect(parent).not.toBeNull();
        if (parent) {
          expect(() => tileWorldRect(p, parent)).not.toThrow();
          expect(childTiles(p, parent).map(tileKey)).toContain(tileKey(tile));
        }
      }
      const children = childTiles(p, tile);
      if (tile.level === 0) {
        expect(children).toEqual([]);
        continue;
      }
      expect(children.length).toBeGreaterThanOrEqual(1);
      expect(children.length).toBeLessThanOrEqual(4);
      const own = tileWorldRect(p, tile);
      const rects = children.map(child => tileWorldRect(p, child));
      const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
      const left = Math.min(...rects.map(r => r.x));
      const top = Math.min(...rects.map(r => r.y));
      const right = Math.max(...rects.map(r => r.x + r.width));
      const bottom = Math.max(...rects.map(r => r.y + r.height));
      // Each level spans the world exactly, so a parent and its children differ by at most one finer texel.
      const texel = Math.max(p.levels[tile.level - 1].scaleX, p.levels[tile.level - 1].scaleY);
      for (const [a, b] of [[left, own.x], [top, own.y], [right, own.x + own.width], [bottom, own.y + own.height]]) {
        expect(Math.abs(a - b)).toBeLessThanOrEqual(texel + 1e-9);
      }
      expect(area).toBeCloseTo((right - left) * (bottom - top), 3);
      for (const child of children) expect(parentTile(p, child)).toEqual(tile);
    }
  });
});
