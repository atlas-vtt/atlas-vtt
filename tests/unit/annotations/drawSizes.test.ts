import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL, DRAW_SIZES } from '../../../src/app/annotations/annotationTypes';
import { drawCell, eraserRadius, sizeOf, stampSize, steppedSize, strokeWidth, textHeight, type DrawSizeKind } from '../../../src/app/annotations/drawSizes';

describe('the draw tool\'s sizes', () => {
  it('are shares of the cell, so the same name fits every map', () => {
    expect(DRAW_SIZES.map((size) => strokeWidth(size, 120))).toEqual([5, 10, 20, 40]);
    expect(DRAW_SIZES.map((size) => Math.round(textHeight(size, 100) * 1e6) / 1e6)).toEqual([30, 45, 70, 110]);
    expect(DRAW_SIZES.map((size) => stampSize(size, 70))).toEqual([35, 70, 140, 210]);
    expect(DRAW_SIZES.map((size) => eraserRadius(size, 80))).toEqual([10, 20, 40, 80]);
    expect(strokeWidth('m', 140)).toBe(2 * strokeWidth('m', 70));
  });

  it('count a cell as 70 px on a map without a grid', () => {
    expect(DEFAULT_CELL).toBe(70);
    expect(drawCell(null)).toBe(70);
    expect(drawCell(undefined)).toBe(70);
    expect(drawCell({ enabled: false, size: 100 })).toBe(70);
    expect(drawCell({ enabled: true, size: 0 })).toBe(70);
    expect(drawCell({ enabled: true, size: Number.NaN })).toBe(70);
    expect(drawCell({ enabled: true, size: 100 })).toBe(100);
  });

  it('name a size by the nearest step, by ratio', () => {
    const kinds: readonly [DrawSizeKind, (size: 's' | 'm' | 'l' | 'xl', cell: number) => number][] = [
      ['stroke', strokeWidth], ['text', textHeight], ['stamp', stampSize], ['eraser', eraserRadius],
    ];
    for (const [kind, sized] of kinds) {
      for (const size of DRAW_SIZES) {
        expect(sizeOf(sized(size, 90), 90, kind)).toBe(size);
        expect(sizeOf(sized(size, 90) * 1.1, 90, kind)).toBe(size);
      }
    }
    // Between M (70) and L (140) the middle by ratio is about 99
    expect(sizeOf(98, 70, 'stamp')).toBe('m');
    expect(sizeOf(100, 70, 'stamp')).toBe('l');
    expect(sizeOf(1, 70, 'stamp')).toBe('s');
    expect(sizeOf(5000, 70, 'stamp')).toBe('xl');
    expect(sizeOf(0, 70, 'stroke')).toBe('s');
    expect(sizeOf(Number.NaN, 70, 'stroke')).toBe('s');
  });

  it('step up and down and stop at the ends', () => {
    expect(steppedSize('s', 1)).toBe('m');
    expect(steppedSize('l', 1)).toBe('xl');
    expect(steppedSize('xl', 1)).toBe('xl');
    expect(steppedSize('m', -1)).toBe('s');
    expect(steppedSize('s', -1)).toBe('s');
  });
});
