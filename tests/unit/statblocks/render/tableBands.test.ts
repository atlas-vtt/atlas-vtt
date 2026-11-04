import { describe, expect, it } from 'vitest';
import { bandColumns, fittingBands } from '../../../../src/app/statblocks/render/blocks/tableBands';

describe('bandColumns', () => {
  it('splits the columns in order into bands of near-equal size', () => {
    expect(bandColumns(9, 1)).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8]]);
    expect(bandColumns(9, 2)).toEqual([[0, 1, 2, 3, 4], [5, 6, 7, 8]]);
    expect(bandColumns(9, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 8]]);
    expect(bandColumns(6, 4)).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('never makes more bands than columns, nor fewer than one', () => {
    expect(bandColumns(3, 10)).toEqual([[0], [1], [2]]);
    expect(bandColumns(3, 0)).toEqual([[0, 1, 2]]);
    expect(bandColumns(0, 2)).toEqual([[]]);
  });
});

describe('fittingBands', () => {
  it('keeps one band where the columns fit', () => {
    expect(fittingBands({ columns: [50, 50, 50], extra: 2 }, 160)).toBe(1);
  });

  it('takes the fewest bands in which every band fits, counting what each band adds', () => {
    const columns = [60, 110, 100, 80, 70, 90, 85, 75, 80];
    expect(fittingBands({ columns, extra: 0 }, 420)).toBe(2);
    expect(fittingBands({ columns, extra: 30 }, 420)).toBe(3);
  });

  it('gives each column a band of its own where nothing narrower fits', () => {
    expect(fittingBands({ columns: [300, 300], extra: 0 }, 100)).toBe(2);
  });
});
