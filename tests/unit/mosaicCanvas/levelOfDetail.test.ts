import { describe, expect, it } from 'vitest';
import {
  finestLevel,
  levelFor,
  orderByPriority,
  tesseraPriority,
  tesseraeForView,
  visibleTesserae,
  type TesseraView,
} from '../../../src/app/pixi/mosaicCanvas/levelOfDetail';
import { pyramidOf, tesseraKey, type TesseraRef } from '../../../src/app/pixi/mosaicCanvas/pyramid';

const keys = (tesserae: TesseraRef[]): string[] => tesserae.map(tesseraKey);

describe('levelFor', () => {
  const big = pyramidOf(16383, 8800);

  it.each([1, 2])('never minifies a level more than 2× across zoom 0.1–5 at resolution %i', resolution => {
    for (let zoom = 0.1; zoom <= 5.0001; zoom += 0.01) {
      const screenPerWorld = zoom * resolution;
      const level = levelFor(big, 1 / screenPerWorld);
      const texel = big.levels[level].scale * screenPerWorld;
      expect(texel).toBeGreaterThanOrEqual(0.5 - 1e-9);
      if (level > 0) expect(big.levels[level - 1].scale * screenPerWorld).toBeLessThan(0.5);
      expect(level).toBe(Math.max(0, Math.ceil(Math.log2(0.5 / screenPerWorld) - 1e-9)));
    }
  });

  it('matches the rule at known zooms', () => {
    expect(levelFor(big, 1 / 5)).toBe(0);
    expect(levelFor(big, 1)).toBe(0);
    expect(levelFor(big, 1 / 0.5)).toBe(0);
    expect(levelFor(big, 1 / 0.4)).toBe(1);
    expect(levelFor(big, 1 / 0.25)).toBe(1);
    expect(levelFor(big, 1 / 0.1)).toBe(3);
    expect(levelFor(big, 1 / (0.25 * 2))).toBe(0);
    expect(levelFor(big, 1 / (0.1 * 2))).toBe(2);
  });

  it('is not pushed a level finer by float noise at powers of two', () => {
    expect(levelFor(big, 1 / (0.1 * 2.5))).toBe(1);
    expect(levelFor(big, 4 * (1 + 1e-12))).toBe(1);
  });

  it('clamps to the pyramid', () => {
    expect(levelFor(big, 1e-6)).toBe(0);
    expect(levelFor(big, 1e9)).toBe(big.levels.length - 1);
    expect(levelFor(big, Number.POSITIVE_INFINITY)).toBe(big.levels.length - 1);
    expect(levelFor(big, 0)).toBe(0);
    expect(levelFor(big, Number.NaN)).toBe(0);
    expect(levelFor(pyramidOf(400, 300), 64)).toBe(0);
  });

  it('counts texels of a pyramid decoded smaller than its source', () => {
    const scaled = pyramidOf(17000, 12746, 2);
    expect(levelFor(scaled, 1)).toBe(0);
    expect(levelFor(scaled, 4)).toBe(0);
    expect(levelFor(scaled, 5)).toBe(1);
    expect(levelFor(scaled, 8)).toBe(1);
    expect(levelFor(scaled, 16)).toBe(2);
  });
});

describe('visibleTesserae', () => {
  // 2550 × 1530: level 0 is 5 × 3 tesserae, level 1 (1275 × 765) is 3 × 2, level 2 (638 × 383) 2 × 1.
  const p = pyramidOf(2550, 1530);

  it('lists the tesserae a rect touches plus the prefetch ring, row-major', () => {
    const rect = { x: 1100, y: 600, width: 300, height: 100 };
    expect(keys(visibleTesserae(p, 0, rect, 0))).toEqual(['0/2/1']);
    expect(keys(visibleTesserae(p, 0, rect))).toEqual([
      '0/1/0', '0/2/0', '0/3/0', '0/1/1', '0/2/1', '0/3/1', '0/1/2', '0/2/2', '0/3/2',
    ]);
  });

  it('treats tessera edges as exclusive', () => {
    expect(keys(visibleTesserae(p, 0, { x: 0, y: 0, width: 510, height: 510 }, 0))).toEqual(['0/0/0']);
    expect(keys(visibleTesserae(p, 0, { x: 510, y: 0, width: 1, height: 1 }, 0))).toEqual(['0/1/0']);
  });

  it('clamps at the map edges', () => {
    expect(keys(visibleTesserae(p, 0, { x: -500, y: -500, width: 600, height: 600 }))).toEqual([
      '0/0/0', '0/1/0', '0/0/1', '0/1/1',
    ]);
    expect(keys(visibleTesserae(p, 0, { x: 2500, y: 1500, width: 900, height: 900 }))).toEqual([
      '0/3/1', '0/4/1', '0/3/2', '0/4/2',
    ]);
    expect(visibleTesserae(p, 0, { x: -1e6, y: -1e6, width: 2e6, height: 2e6 })).toHaveLength(15);
  });

  it('reads tesserae of coarser levels in their own grid', () => {
    expect(keys(visibleTesserae(p, 1, { x: 1100, y: 600, width: 300, height: 100 }, 0))).toEqual(['1/1/0']);
    expect(keys(visibleTesserae(p, 2, { x: 0, y: 0, width: 2550, height: 1530 }))).toEqual(['2/0/0', '2/1/0']);
  });

  it('is empty outside the map, for a rect without area or an unknown level', () => {
    expect(visibleTesserae(p, 0, { x: 2550, y: 0, width: 100, height: 100 })).toEqual([]);
    expect(visibleTesserae(p, 0, { x: 0, y: 1530, width: 100, height: 100 })).toEqual([]);
    expect(visibleTesserae(p, 0, { x: -100, y: 0, width: 100, height: 100 })).toEqual([]);
    expect(visibleTesserae(p, 0, { x: 0, y: -100, width: 100, height: 100 })).toEqual([]);
    expect(visibleTesserae(p, 0, { x: 10, y: 10, width: 0, height: 100 })).toEqual([]);
    expect(visibleTesserae(p, 0, { x: 10, y: 10, width: Number.NaN, height: 100 })).toEqual([]);
    expect(visibleTesserae(p, 7, { x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
  });

  it('takes a view at its level of detail', () => {
    const view: TesseraView = { rect: { x: 0, y: 0, width: 2550, height: 1530 }, worldPerScreenPixel: 4 };
    expect(keys(tesseraeForView(p, view))).toEqual(['1/0/0', '1/1/0', '1/2/0', '1/0/1', '1/1/1', '1/2/1']);
  });
});

describe('load priority', () => {
  const p = pyramidOf(2550, 1530);
  const view: TesseraView = { rect: { x: 1020, y: 510, width: 510, height: 510 }, worldPerScreenPixel: 1 };

  it('ranks the view level first, then coarser before finer one level away', () => {
    const levelOne = pyramidOf(5100, 3060);
    const midView: TesseraView = { rect: { x: 0, y: 0, width: 1000, height: 1000 }, worldPerScreenPixel: 3 };
    const tessera = (level: number): TesseraRef => ({ level, col: 0, row: 0 });
    const ranks = [0, 1, 2, 3].map(level => tesseraPriority(levelOne, tessera(level), midView).levelRank);
    expect(ranks).toEqual([2, 0, 1, 3]);
  });

  it('orders the view level first, then distance from the view centre', () => {
    const tesserae = [
      { level: 1, col: 1, row: 0 },
      ...visibleTesserae(p, 0, view.rect, 1),
    ];
    const ordered = orderByPriority(p, tesserae, [view]);
    expect(tesseraKey(ordered[0])).toBe('0/2/1');
    expect(keys(ordered.slice(1, 5))).toEqual(['0/2/0', '0/1/1', '0/3/1', '0/2/2']);
    expect(tesseraKey(ordered[ordered.length - 1])).toBe('1/1/0');
    const distances = ordered.slice(0, -1).map(t => tesseraPriority(p, t, view).distance);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('ranks each tessera by the view that needs it most', () => {
    const far: TesseraView = { rect: { x: 2040, y: 1020, width: 510, height: 510 }, worldPerScreenPixel: 1 };
    const ordered = orderByPriority(p, [{ level: 0, col: 0, row: 0 }, { level: 0, col: 4, row: 2 }, { level: 0, col: 2, row: 1 }], [view, far]);
    expect(keys(ordered)).toEqual(['0/4/2', '0/2/1', '0/0/0']);
  });

  it('keeps the input order without views and between ties', () => {
    const tesserae = [{ level: 0, col: 1, row: 1 }, { level: 0, col: 3, row: 1 }];
    expect(orderByPriority(p, tesserae, [])).toEqual(tesserae);
    expect(orderByPriority(p, tesserae, [view])).toEqual(tesserae);
  });
});

describe('the finest level a source serves', () => {
  // 3000 × 2000: levels of 3000, 1500, 750 and 375 px.
  const p = pyramidOf(3000, 2000);

  it('is the finest level whose longer side fits the side named, every level without one', () => {
    expect(finestLevel(p, undefined)).toBe(0);
    expect(finestLevel(p, 3000)).toBe(0);
    expect(finestLevel(p, 2999)).toBe(1);
    expect(finestLevel(p, 1000)).toBe(2);
    expect(finestLevel(p, 10)).toBe(3);
  });

  it('bounds the level of detail, which stays as it was without it', () => {
    expect(levelFor(p, 1)).toBe(0);
    expect(levelFor(p, 1, 0)).toBe(0);
    expect(levelFor(p, 1, 2)).toBe(2);
    expect(levelFor(p, 8, 2)).toBe(2);
    expect(levelFor(p, 16, 2)).toBe(3);
    expect(levelFor(p, Number.NaN, 1)).toBe(1);
    expect(levelFor(p, 1, 9)).toBe(3);
  });
});
