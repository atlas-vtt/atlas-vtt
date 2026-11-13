import { describe, expect, it } from 'vitest';
import {
  areaBadgeSpot, areaGeometry, areaIsHidden, areaName, areaOutline, flippedArea, fogAreaList, fogAreaOutlines, isFogArea,
  MAX_AREA_CORNERS, MAX_AREA_NAME, MAX_FOG_AREAS, type FogArea,
} from '../../src/app/fog/fogAreas';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import type { FogBrushStroke, FogLassoFill, FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';

const rectangle = (id: string, changes: Partial<FogRectangleFill> = {}): FogRectangleFill =>
  ({ id, kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x: 0, y: 0, width: 100, height: 50, ...changes });
const lasso = (id: string, changes: Partial<FogLassoFill> = {}): FogLassoFill =>
  ({ id, kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], ...changes });
const brush = (id: string): FogBrushStroke => ({ id, kind: 'fog', type: 'brush', timestamp: 1, isErasing: false, points: [{ x: 5, y: 5 }], brushRadius: 10 });
/** An entry as a hand-edited file may hold it. */
const fromFile = (value: unknown): FogOperation => value as FogOperation;

describe('which fog operations are areas', () => {
  it('reads a lasso or a rectangle with the mark as an area, named or not', () => {
    expect(isFogArea(rectangle('a', { area: {} }))).toBe(true);
    expect(isFogArea(lasso('a', { area: { name: 'Hall' } }))).toBe(true);
    expect(isFogArea(rectangle('a'))).toBe(false);
    expect(isFogArea(undefined)).toBe(false);
  });

  it('reads a mark that is no object, and a mark on a brush stroke, as none', () => {
    for (const mark of [null, 'hall', 7, true, ['hall']]) expect(isFogArea(fromFile({ ...rectangle('a'), area: mark }))).toBe(false);
    expect(isFogArea(fromFile({ ...brush('a'), area: {} }))).toBe(false);
    for (const entry of [null, 5, 'fog', []]) expect(isFogArea(fromFile(entry))).toBe(false);
  });

  it('lists the areas by id, whatever order the record holds them in and whichever was flipped last', () => {
    const fog = { c: lasso('c', { area: {}, timestamp: 1 }), plain: rectangle('plain'), a: rectangle('a', { area: {}, timestamp: 9, isErasing: true }), b: rectangle('b', { area: { name: 'B' } }), stroke: brush('stroke') };
    expect(fogAreaList(fog).map((area) => area.id)).toEqual(['a', 'b', 'c']);
  });

  it('gives an area the id the record holds it under', () => {
    const [area] = fogAreaList({ key: rectangle('other', { area: {} }) });
    expect(area?.id).toBe('key');
  });

  it('gives the same list for the same record', () => {
    const fog = { a: rectangle('a', { area: {} }) };
    expect(fogAreaList(fog)).toBe(fogAreaList(fog));
    expect(fogAreaOutlines(fog)).toBe(fogAreaOutlines(fog));
  });

  it(`reads no more than ${MAX_FOG_AREAS} areas`, () => {
    const fog: Record<string, FogOperation> = {};
    for (let i = 0; i < MAX_FOG_AREAS + 20; i++) fog[`area-${String(i).padStart(4, '0')}`] = rectangle(`area-${String(i).padStart(4, '0')}`, { area: {} });
    const list = fogAreaList(fog);
    expect(list).toHaveLength(MAX_FOG_AREAS);
    expect(list[0]?.id).toBe('area-0000');
    expect(list[list.length - 1]?.id).toBe('area-0499');
  });

  it('passes over entries that are no operations', () => {
    expect(fogAreaList({ a: fromFile(null), b: fromFile(12), c: rectangle('c', { area: {} }) }).map((area) => area.id)).toEqual(['c']);
  });
});

describe('what an area says of itself', () => {
  const named = (name: unknown): FogArea => fromFile({ ...rectangle('a'), area: { name } }) as FogArea;

  it('reads a name that is no text, or blank, as none', () => {
    for (const name of [undefined, null, 5, {}, '', '   ']) expect(areaName(named(name))).toBeUndefined();
    expect(areaName(named('  Crypt '))).toBe('Crypt');
    expect(areaName(named('x'.repeat(200)))).toHaveLength(MAX_AREA_NAME);
  });

  it('is hidden while it paints and revealed while it erases', () => {
    expect(areaIsHidden(rectangle('a', { area: {} }))).toBe(true);
    expect(areaIsHidden(rectangle('a', { area: {}, isErasing: true }))).toBe(false);
  });

  it('has the corners of its rectangle, or of its lasso, where it lies on the map', () => {
    expect(areaOutline(rectangle('a', { x: 10, y: 20, width: 30, height: 40 }))).toEqual([{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 10, y: 60 }]);
    expect(areaOutline(rectangle('a', { x: 10, y: 20, width: 30, height: 40, offsetX: 5, offsetY: -5 }))[0]).toEqual({ x: 15, y: 15 });
    expect(areaOutline(lasso('a', { offsetX: 1, offsetY: 2 }))).toEqual([{ x: 1, y: 2 }, { x: 101, y: 2 }, { x: 1, y: 102 }]);
  });

  it('has no outline, and so no badge, where its geometry cannot be read', () => {
    const broken = [
      fromFile({ ...lasso('a'), points: 'none' }),
      fromFile({ ...lasso('a'), points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }, { x: 4, y: 4 }] }),
      fromFile({ ...lasso('a'), points: [null, { x: 1, y: 1 }, { x: 4, y: 4 }] }),
      fromFile({ ...rectangle('a'), width: 'wide' }),
      rectangle('a', { offsetX: Infinity }),
    ] as (FogLassoFill | FogRectangleFill)[];
    for (const area of broken) {
      expect(areaOutline(area)).toEqual([]);
      expect(areaBadgeSpot(area)).toBeNull();
    }
    // Corners on one line enclose nothing.
    expect(areaBadgeSpot(lasso('a', { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 9 }] }))).toBeNull();
  });

  it('puts its badge inside it', () => {
    expect(areaBadgeSpot(rectangle('a', { x: 100, y: 100, width: 200, height: 100 }))).toMatchObject({ y: expect.closeTo(150, 0) });
  });
});

describe('flipping an area', () => {
  it('reveals a hidden area and hides a revealed one, at the time given', () => {
    const hidden = rectangle('a', { area: { name: 'Hall' }, timestamp: 5, level: 'upper' }) as FogArea;
    const revealed = flippedArea(hidden, 77);
    expect(revealed).toEqual({ ...hidden, isErasing: true, timestamp: 77 });
    expect(flippedArea(revealed, 80)).toEqual({ ...hidden, isErasing: false, timestamp: 80 });
    // The area handed in is left as it was.
    expect(hidden).toMatchObject({ isErasing: false, timestamp: 5 });
  });
});

describe('the outline an area is given', () => {
  it('keeps a rectangle a rectangle, its corner top left whichever way it was dragged', () => {
    expect(areaGeometry({ type: 'rectangle', x: 100, y: 80, width: -40, height: -30 })).toEqual({ type: 'rectangle', x: 60, y: 50, width: 40, height: 30 });
  });

  it('is none for a shape that encloses nothing or cannot be fog', () => {
    expect(areaGeometry({ type: 'rectangle', x: 0, y: 0, width: 0, height: 10 })).toBeNull();
    expect(areaGeometry({ type: 'rectangle', x: Number.NaN, y: 0, width: 10, height: 10 })).toBeNull();
    expect(areaGeometry({ type: 'rectangle', x: 0, y: 0, width: 1e9, height: 10 })).toBeNull();
    expect(areaGeometry({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] })).toBeNull();
    expect(areaGeometry({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] })).toBeNull();
    expect(areaGeometry({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 10, y: Infinity }, { x: 20, y: 0 }] })).toBeNull();
    expect(areaGeometry({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 1e9, y: 0 }, { x: 0, y: 10 }] })).toBeNull();
  });

  it(`keeps a lasso of few corners as drawn and thins one of many to ${MAX_AREA_CORNERS}`, () => {
    const triangle = [{ x: 0, y: 0 }, { x: 10.25, y: 0 }, { x: 0, y: 10 }];
    expect(areaGeometry({ type: 'lasso', points: triangle })).toEqual({ type: 'lasso', points: triangle });
    const circle = Array.from({ length: 2000 }, (_, i) => ({ x: 500 + 400 * Math.cos((i / 2000) * 2 * Math.PI), y: 500 + 400 * Math.sin((i / 2000) * 2 * Math.PI) }));
    const thinned = areaGeometry({ type: 'lasso', points: circle });
    expect(thinned?.type).toBe('lasso');
    if (thinned?.type === 'lasso') {
      expect(thinned.points.length).toBeLessThanOrEqual(MAX_AREA_CORNERS);
      expect(thinned.points.length).toBeGreaterThan(20);
    }
  });
});

describe('a file with areas read by code that ignores the mark', () => {
  const withoutMarks = (fog: Record<string, FogOperation>): Record<string, FogOperation> =>
    Object.fromEntries(Object.entries(fog).map(([id, operation]) => {
      const { area: _area, ...plain } = operation as FogRectangleFill;
      return [id, plain as FogOperation];
    }));

  it('shows the same fog: hidden areas paint, revealed ones erase, in the order of their times', () => {
    const fog: Record<string, FogOperation> = {
      cover: rectangle('cover', { x: 0, y: 0, width: 1000, height: 1000, timestamp: 1 }),
      hall: rectangle('hall', { x: 100, y: 100, width: 200, height: 200, timestamp: 2, isErasing: true, area: { name: 'Hall' } }),
      crypt: lasso('crypt', { points: [{ x: 500, y: 500 }, { x: 800, y: 500 }, { x: 650, y: 900 }], timestamp: 3, area: {} }),
      stroke: { ...brush('stroke'), points: [{ x: 150, y: 150 }, { x: 250, y: 250 }], timestamp: 4 },
      yard: rectangle('yard', { x: 1200, y: 0, width: 300, height: 300, timestamp: 5, area: {} }),
    };
    const coverage = fogCoverage(fog);
    expect(coverage.shape).toEqual(fogCoverage(withoutMarks(fog)).shape);
    // Revealed, but for the stroke painted over it later.
    expect(coverage.covers({ x: 290, y: 110 })).toBe(false);
    expect(coverage.covers({ x: 200, y: 200 })).toBe(true);
    expect(coverage.covers({ x: 1300, y: 100 })).toBe(true);

    // A flip is the same operation at another time, to whoever ignores the mark too.
    const flipped = { ...fog, yard: flippedArea(fog.yard as FogArea, 9), hall: flippedArea(fog.hall as FogArea, 10) };
    const after = fogCoverage(flipped);
    expect(after.shape).toEqual(fogCoverage(withoutMarks(flipped)).shape);
    expect(after.covers({ x: 1300, y: 100 })).toBe(false);
    expect(after.covers({ x: 290, y: 110 })).toBe(true);
  });
});
