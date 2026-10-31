import { describe, expect, it } from 'vitest';
import { BandPyramid, tesseraRowSpan, type LevelBand } from '../../../../src/app/pixi/mosaicCanvas/band/bandPyramid';
import { halveRows } from '../../../../src/app/pixi/mosaicCanvas/band/halveRows';
import { pyramidOf, tesseraSourceRect } from '../../../../src/app/pixi/mosaicCanvas/pyramid';

/** A deterministic RGBA image with a transparent region, so the halving's alpha weighting shows. */
function image(width: number, height: number, seed: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = seed;
  for (let i = 0; i < data.length; i += 4) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    data[i] = state & 255;
    data[i + 1] = (state >> 8) & 255;
    data[i + 2] = (state >> 16) & 255;
    const x = (i / 4) % width;
    data[i + 3] = x < width / 5 ? 0 : x < width / 3 ? (state >> 3) & 255 : 255;
  }
  return data;
}

/** Every level of the pyramid halved whole from the one before, with the same kernel the pyramid uses. */
function wholeLevels(base: Uint8ClampedArray, width: number, height: number, count: number): Array<{ width: number; height: number; data: Uint8ClampedArray }> {
  const levels = [{ width, height, data: base }];
  for (let index = 1; index < count; index++) {
    const finer = levels[index - 1]!;
    const w = Math.ceil(finer.width / 2);
    const h = Math.ceil(finer.height / 2);
    const data = new Uint8ClampedArray(w * h * 4);
    const stride = finer.width * 4;
    for (let y = 0; y < h; y++) {
      const above = finer.data.subarray(2 * y * stride, (2 * y + 1) * stride);
      const below = 2 * y + 1 < finer.height ? finer.data.subarray((2 * y + 1) * stride, (2 * y + 2) * stride) : null;
      halveRows(above, below, finer.width, data.subarray(y * w * 4, (y + 1) * w * 4));
    }
    levels.push({ width: w, height: h, data });
  }
  return levels;
}

async function cutInBands(width: number, height: number, bandRows: number[], baseLevel = 0, lastLevel?: number): Promise<{ bands: LevelBand[]; levels: ReturnType<typeof wholeLevels> }> {
  const pyramid = pyramidOf(width, height);
  const last = lastLevel ?? pyramid.levels.length - 1;
  const base = pyramid.levels[baseLevel]!;
  const data = image(base.width, base.height, width * 31 + height);
  const levels = wholeLevels(data, base.width, base.height, last - baseLevel + 1);
  const bands: LevelBand[] = [];
  const cutter = new BandPyramid(pyramid, { baseLevel, lastLevel: last, onBand: (band) => { bands.push({ ...band, data: band.data.slice() }); } });
  let y = 0;
  let turn = 0;
  while (y < base.height) {
    const rows = Math.min(bandRows[turn++ % bandRows.length]!, base.height - y);
    const stride = base.width * 4;
    await cutter.push({ y, rows, width: base.width, data: data.subarray(y * stride, (y + rows) * stride) });
    y += rows;
  }
  await cutter.finish();
  return { bands, levels };
}

describe('a pyramid cut from bands', () => {
  it('hands out every tessera row of every level once, in order, with the rows its tesserae are cut from', async () => {
    const pyramid = pyramidOf(1300, 777);
    const { bands } = await cutInBands(1300, 777, [1, 7, 64, 300, 2]);
    for (const level of pyramid.levels) {
      const ofLevel = bands.filter((band) => band.level === level.index);
      expect(ofLevel.map((band) => band.row)).toEqual([...Array(level.rows).keys()]);
      for (const band of ofLevel) {
        const rect = tesseraSourceRect(pyramid, { level: level.index, col: 0, row: band.row });
        expect({ y: band.y, rows: band.rows, width: band.width }).toEqual({ y: rect.y, rows: rect.height, width: level.width });
        expect(tesseraRowSpan(level, band.row)).toEqual({ y: rect.y, end: rect.y + rect.height });
      }
    }
  }, 30_000);

  it('holds the very pixels a whole halving of the image gives, at every level', async () => {
    const { bands, levels } = await cutInBands(1300, 777, [5, 511, 13, 1024]);
    for (const band of bands) {
      const level = levels[band.level]!;
      const stride = level.width * 4;
      const expected = level.data.subarray(band.y * stride, (band.y + band.rows) * stride);
      const first = band.data.findIndex((value, index) => value !== expected[index]);
      expect({ level: band.level, row: band.row, first, got: [...band.data.slice(first, first + 4)], expected: [...expected.slice(first, first + 4)], at: first < 0 ? null : { x: (first / 4) % level.width, y: band.y + Math.floor(first / 4 / level.width) } }).toEqual({ level: band.level, row: band.row, first: -1, got: [], expected: [], at: null });
    }
  }, 30_000);

  it('cuts a sub-pyramid from a coarser base level, for the reduced first pass', async () => {
    // 4,100 wide for a fourth level to cut from; 700 high keeps a CI runner's time short.
    const pyramid = pyramidOf(4100, 700);
    const { bands, levels } = await cutInBands(4100, 700, [3, 100], 3);
    expect(new Set(bands.map((band) => band.level))).toEqual(new Set(pyramid.levels.slice(3).map((level) => level.index)));
    for (const band of bands) {
      const level = levels[band.level - 3]!;
      const stride = level.width * 4;
      expect(band.data).toEqual(level.data.subarray(band.y * stride, (band.y + band.rows) * stride));
    }
  }, 30_000);

  it('stops halving at the last level asked for', async () => {
    const { bands } = await cutInBands(4100, 3000, [64], 0, 2);
    expect(new Set(bands.map((band) => band.level))).toEqual(new Set([0, 1, 2]));
  });

  it('refuses bands out of order, of another width, or past the bottom', async () => {
    const pyramid = pyramidOf(600, 400);
    const cutter = new BandPyramid(pyramid, { baseLevel: 0, lastLevel: 1, onBand: () => undefined });
    const row = new Uint8ClampedArray(600 * 4);
    await expect(cutter.push({ y: 1, rows: 1, width: 600, data: row })).rejects.toThrow(/row 0 was due/);
    await expect(cutter.push({ y: 0, rows: 1, width: 599, data: row })).rejects.toThrow(/599 px/);
    await expect(cutter.push({ y: 0, rows: 401, width: 600, data: new Uint8ClampedArray(600 * 401 * 4) })).rejects.toThrow(/400 rows/);
    await expect(cutter.finish()).rejects.toThrow(/ended at row 0/);
  });

  it('weights colour by alpha when halving, so transparent pixels lend no colour', () => {
    const above = new Uint8ClampedArray([200, 100, 0, 255, 0, 0, 0, 0]);
    const below = new Uint8ClampedArray([200, 100, 0, 255, 50, 50, 50, 0]);
    const out = new Uint8ClampedArray(4);
    halveRows(above, below, 2, out);
    expect([...out]).toEqual([200, 100, 0, 128]);
    const odd = new Uint8ClampedArray(8);
    halveRows(new Uint8ClampedArray([10, 20, 30, 255, 30, 40, 50, 255, 7, 7, 7, 255]), null, 3, odd);
    expect([...odd]).toEqual([20, 30, 40, 255, 7, 7, 7, 255]);
  });
});
