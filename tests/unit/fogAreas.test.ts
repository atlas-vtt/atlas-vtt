import { describe, expect, it } from 'vitest';
import { areaOutline, fogAreaList, isFogArea, lassoOutline, MAX_FOG_AREAS } from '../../src/app/fog/fogAreas';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import type { FogBrushStroke, FogLassoFill, FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';

const rectangle = (id: string, changes: Partial<FogRectangleFill> = {}): FogRectangleFill =>
  ({ id, kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: true, x: 0, y: 0, width: 100, height: 50, ...changes });
const lasso = (id: string, changes: Partial<FogLassoFill> = {}): FogLassoFill =>
  ({ id, kind: 'fog', type: 'lasso', timestamp: 1, isErasing: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], ...changes });
const brush = (id: string): FogBrushStroke => ({ id, kind: 'fog', type: 'brush', timestamp: 1, isErasing: true, points: [{ x: 5, y: 5 }], brushRadius: 10 });
/** An entry as a hand-edited file may hold it. */
const fromFile = (value: unknown): FogOperation => value as FogOperation;

describe('which fog operations are revealed fog that is remembered', () => {
  it('reads a revealing lasso or rectangle with the mark as one, a name in the mark or none', () => {
    expect(isFogArea(rectangle('a', { area: {} }))).toBe(true);
    expect(isFogArea(lasso('a', { area: { name: 'Crypt' } }))).toBe(true);
    expect(isFogArea(rectangle('a'))).toBe(false);
    expect(isFogArea(undefined)).toBe(false);
  });

  it('ignores the mark on an operation that paints: fog is plain fog, whatever an earlier build wrote', () => {
    expect(isFogArea(rectangle('a', { area: {}, isErasing: false }))).toBe(false);
    expect(isFogArea(lasso('a', { area: { name: 'Hall' }, isErasing: false }))).toBe(false);
    expect(fogAreaList({ a: rectangle('a', { area: {}, isErasing: false }) })).toEqual([]);
  });

  it('reads a mark that is no object, and a mark on a brush stroke, as none', () => {
    for (const area of [null, true, 'yes', 1, []]) expect(isFogArea(fromFile({ ...rectangle('a'), area }))).toBe(false);
    expect(isFogArea(fromFile({ ...brush('a'), area: {} }))).toBe(false);
    expect(isFogArea(fromFile({ ...rectangle('a'), area: {}, isErasing: 'yes' }))).toBe(false);
  });

  it('lists them by id, whatever order the record holds them in', () => {
    const fog = { b: lasso('b', { area: {}, timestamp: 9 }), plain: rectangle('plain'), a: rectangle('a', { area: {}, timestamp: 50 }) };
    expect(fogAreaList(fog).map((area) => area.id)).toEqual(['a', 'b']);
  });

  it('gives each the id the record holds it under', () => {
    expect(fogAreaList({ key: rectangle('other', { area: {} }) }).map((area) => area.id)).toEqual(['key']);
  });

  it('gives the same list for the same record', () => {
    const fog = { a: rectangle('a', { area: {} }) };
    expect(fogAreaList(fog)).toBe(fogAreaList(fog));
    expect(fogAreaList({ ...fog })).not.toBe(fogAreaList(fog));
  });

  it(`reads no more than ${MAX_FOG_AREAS}`, () => {
    const fog: Record<string, FogOperation> = {};
    for (let i = 0; i < MAX_FOG_AREAS + 20; i++) fog[`a${String(i).padStart(4, '0')}`] = rectangle(`a${String(i).padStart(4, '0')}`, { area: {} });
    const areas = fogAreaList(fog);
    expect(areas).toHaveLength(MAX_FOG_AREAS);
    expect(areas[areas.length - 1]!.id).toBe(`a${String(MAX_FOG_AREAS - 1).padStart(4, '0')}`);
  });

  it('passes over entries that are no operations', () => {
    expect(fogAreaList({ none: fromFile(null), number: fromFile(7), a: rectangle('a', { area: {} }) }).map((area) => area.id)).toEqual(['a']);
  });
});

describe('the outline of a lasso or rectangle operation', () => {
  it('has the corners of its rectangle, or of its lasso, where it lies on the map', () => {
    expect(areaOutline(rectangle('a', { x: 10, y: 20, width: 30, height: 40 }))).toEqual([{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 10, y: 60 }]);
    expect(areaOutline(lasso('a', { offsetX: 5, offsetY: -5 }))).toEqual([{ x: 5, y: -5 }, { x: 105, y: -5 }, { x: 5, y: 95 }]);
    const area = rectangle('a');
    expect(areaOutline(area)).toBe(areaOutline(area));
  });

  it('is none where its geometry cannot be read', () => {
    const broken = [
      fromFile({ ...lasso('a'), points: 'none' }),
      fromFile({ ...lasso('a'), points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }, { x: 4, y: 4 }] }),
      fromFile({ ...lasso('a'), points: [null, { x: 1, y: 1 }, { x: 4, y: 4 }] }),
      fromFile({ ...rectangle('a'), width: 'wide' }),
      rectangle('a', { offsetX: Infinity }),
    ] as (FogLassoFill | FogRectangleFill)[];
    for (const area of broken) expect(areaOutline(area)).toEqual([]);
  });
});

describe('the corners a lasso holds of an outline', () => {
  it('are the outline as it is given, to the last corner, and a copy of it', () => {
    const round = Array.from({ length: 500 }, (_, index) => ({ x: 300 + 200 * Math.cos((index / 500) * 2 * Math.PI), y: 300 + 200 * Math.sin((index / 500) * 2 * Math.PI) }));
    const corners = lassoOutline(round)!;
    expect(corners).toEqual(round);
    expect(corners).not.toBe(round);
    expect(corners[0]).not.toBe(round[0]);
  });

  it('are none for an outline that encloses nothing or cannot be fog', () => {
    expect(lassoOutline([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBeNull();
    expect(lassoOutline([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 9 }])).toBeNull();
    expect(lassoOutline([{ x: 0, y: 0 }, { x: Number.NaN, y: 5 }, { x: 9, y: 0 }])).toBeNull();
    expect(lassoOutline([{ x: 0, y: 0 }, { x: 1e12, y: 0 }, { x: 0, y: 5 }])).toBeNull();
    expect(lassoOutline([])).toBeNull();
  });
});

describe('a file with marks read by code that ignores them', () => {
  const fog: Record<string, FogOperation> = {
    cover: rectangle('cover', { isErasing: false, x: 0, y: 0, width: 400, height: 400, timestamp: 1 }),
    revealed: rectangle('revealed', { x: 100, y: 100, width: 100, height: 100, timestamp: 2, area: {} }),
    old: lasso('old', { isErasing: false, timestamp: 3, area: { name: 'Hall' }, points: [{ x: 300, y: 300 }, { x: 390, y: 300 }, { x: 300, y: 390 }] }),
  };
  const withoutMarks = Object.fromEntries(Object.entries(fog).map(([id, operation]) => {
    const { area: _area, ...plain } = operation as FogRectangleFill;
    return [id, plain as FogOperation];
  }));

  it('shows the same fog: the mark changes nothing of what is covered', () => {
    const [marked, plain] = [fogCoverage(fog), fogCoverage(withoutMarks)];
    expect(marked.shape).toEqual(plain.shape);
    expect([marked.covers({ x: 150, y: 150 }), marked.covers({ x: 50, y: 50 }), marked.covers({ x: 320, y: 320 })]).toEqual([false, true, true]);
  });
});
