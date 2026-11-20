import { describe, expect, it } from 'vitest';
import { fogAreaList, type FogArea } from '../../src/app/fog/fogAreas';
import { areaAt, fogBodyAt } from '../../src/app/fog/fogBody';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { keyholed } from '../../src/app/fog/fogKeyhole';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { Point } from '../../src/app/types/visionTypes';

const box = (x: number, y: number, width: number, height: number): Point[] =>
  [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const at = (x: number, y: number): Point => ({ x, y });
const corners = (outline: readonly Point[] | null): string[] => (outline ?? []).map((point) => `${point.x},${point.y}`).sort();
const paint = (id: string, x: number, y: number, width: number, height: number, timestamp = 1, isErasing = false): FogOperation =>
  ({ id, kind: 'fog', timestamp, isErasing, type: 'rectangle', x, y, width, height });
const revealed = (id: string, x: number, y: number, width: number, height: number, timestamp = 1): FogArea =>
  ({ ...paint(id, x, y, width, height, timestamp, true), area: {} }) as FogArea;
const record = (...operations: FogOperation[]): Record<string, FogOperation> => Object.fromEntries(operations.map((operation) => [operation.id, operation]));
/** The body under a point of a level that holds `operations`. */
const bodyAt = (point: Point, ...operations: FogOperation[]): Point[] | null => fogBodyAt(fogCoverage(record(...operations)).shape, point);

function area(outline: readonly Point[]): number {
  let twice = 0;
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % outline.length]!;
    twice += a.x * b.y - b.x * a.y;
  });
  return Math.abs(twice) / 2;
}

describe('a fog object', () => {
  it('is fog that touches, whatever it was painted with: two shapes that overlap, or meet on an edge, are one', () => {
    const overlapping = [paint('a', 0, 0, 100, 100), paint('b', 60, 60, 100, 100, 2)];
    const whole = corners([at(0, 0), at(100, 0), at(100, 60), at(160, 60), at(160, 160), at(60, 160), at(60, 100), at(0, 100)]);
    expect(corners(bodyAt(at(50, 50), ...overlapping))).toEqual(whole);
    expect(corners(bodyAt(at(150, 150), ...overlapping))).toEqual(whole);
    // A rectangle and a brush stroke that share an edge.
    const meeting = [paint('a', 0, 0, 100, 100), paint('b', 100, 20, 50, 50, 2)];
    expect(area(bodyAt(at(10, 10), ...meeting)!)).toBe(100 * 100 + 50 * 50);
    const brushed: FogOperation = { id: 'c', kind: 'fog', timestamp: 3, isErasing: false, type: 'brush', points: [at(110, 50)], brushRadius: 30 };
    const withBrush = bodyAt(at(10, 10), paint('a', 0, 0, 100, 100), brushed)!;
    expect(area(withBrush)).toBeGreaterThan(100 * 100 + 1000);
    expect(corners(bodyAt(at(130, 50), paint('a', 0, 0, 100, 100), brushed))).toEqual(corners(withBrush));
  });

  it('is not fog that lies apart: two shapes that do not touch are two', () => {
    const apart = [paint('a', 0, 0, 100, 100), paint('b', 101, 0, 100, 100, 2)];
    expect(corners(bodyAt(at(50, 50), ...apart))).toEqual(corners(box(0, 0, 100, 100)));
    expect(corners(bodyAt(at(150, 50), ...apart))).toEqual(corners(box(101, 0, 100, 100)));
  });

  it('is what the eraser left of it: fog cut in two is two', () => {
    const cut = [paint('a', 0, 0, 300, 100), paint('gap', 140, 0, 20, 100, 2, true)];
    expect(corners(bodyAt(at(50, 50), ...cut))).toEqual(corners(box(0, 0, 140, 100)));
    expect(corners(bodyAt(at(250, 50), ...cut))).toEqual(corners(box(160, 0, 140, 100)));
    expect(bodyAt(at(150, 50), ...cut)).toBeNull();
  });

  it('is none where the point is not in fog: beside it, in a hole of it, at no place, on a map without fog', () => {
    const fog = [paint('all', 0, 0, 300, 300), paint('hole', 100, 100, 100, 100, 2, true)];
    expect(bodyAt(at(500, 500), ...fog)).toBeNull();
    expect(bodyAt(at(150, 150), ...fog)).toBeNull();
    expect(bodyAt(at(Number.NaN, 0), ...fog)).toBeNull();
    expect(bodyAt(at(10, 10))).toBeNull();
  });

  it('keeps its hole, and the fog that stands free in the hole, out of itself', () => {
    const fog = [paint('all', 0, 0, 300, 300), paint('hole', 100, 100, 100, 100, 2, true), paint('island', 140, 140, 20, 20, 3)];
    const body = bodyAt(at(50, 50), ...fog)!;
    expect(area(body)).toBe(300 * 300 - 100 * 100);
    // Erased as the lasso it is written as, the island stays and the ring goes.
    const after = fogCoverage(record(...fog, { id: 'erase', kind: 'fog', timestamp: 4, isErasing: true, type: 'lasso', points: body }));
    expect([after.covers(at(50, 50)), after.covers(at(250, 250)), after.covers(at(150, 150)), after.covers(at(120, 120))]).toEqual([false, false, true, false]);
    // The island is an object of its own.
    expect(corners(bodyAt(at(150, 150), ...fog))).toEqual(corners(box(140, 140, 20, 20)));
  });

  it('comes back as it was when it is erased with its outline and painted with it again', () => {
    const brushed: FogOperation = { id: 'c', kind: 'fog', timestamp: 3, isErasing: false, type: 'brush', points: [at(110, 50), at(160, 90)], brushRadius: 30 };
    const fog = record(paint('a', 0, 0, 100, 100), brushed, paint('apart', 400, 0, 50, 50, 4));
    const before = fogCoverage(fog).shape;
    const body = fogBodyAt(before, at(10, 10))!;
    const gone = fogCoverage({ ...fog, erase: { id: 'erase', kind: 'fog', timestamp: 5, isErasing: true, type: 'lasso', points: body } });
    expect([gone.covers(at(10, 10)), gone.covers(at(150, 80)), gone.covers(at(420, 20))]).toEqual([false, false, true]);
    const back = fogCoverage({ ...fog, erase: { id: 'erase', kind: 'fog', timestamp: 6, isErasing: false, type: 'lasso', points: body } });
    expect(back.shape).toEqual(before);
  });
});

describe('the remembered revealed fog under a point', () => {
  const HALL = revealed('hall', 0, 0, 100, 100);
  const CELLAR = revealed('cellar', 150, 0, 100, 100);

  it('is the one whose outline holds the point', () => {
    expect(areaAt([HALL, CELLAR], at(50, 50))?.id).toBe('hall');
    expect(areaAt([HALL, CELLAR], at(200, 50))?.id).toBe('cellar');
    expect(areaAt([HALL, CELLAR], at(125, 50))).toBeNull();
    expect(areaAt([HALL, CELLAR], at(Number.NaN, 50))).toBeNull();
    expect(areaAt([], at(50, 50))).toBeNull();
  });

  it('is the one revealed last where several overlap, whichever comes first', () => {
    const closet = revealed('closet', 40, 40, 20, 20, 5);
    const late = revealed('hall', 0, 0, 100, 100, 9);
    expect(areaAt([HALL, closet], at(50, 50))?.id).toBe('closet');
    expect(areaAt([closet, HALL], at(50, 50))?.id).toBe('closet');
    expect(areaAt([closet, late], at(50, 50))?.id).toBe('hall');
    expect(areaAt([closet, HALL], at(10, 10))?.id).toBe('hall');
  });

  it('is not one whose hole the point lies in, nor fog that paints though it carries a mark', () => {
    const ring = { id: 'ring', kind: 'fog', timestamp: 1, isErasing: true, type: 'lasso', points: keyholed(box(0, 0, 300, 300), [box(100, 100, 100, 100)]), area: {} } as FogArea;
    expect(areaAt([ring], at(50, 50))?.id).toBe('ring');
    expect(areaAt([ring], at(150, 150))).toBeNull();
    const painted = { ...paint('old', 0, 0, 100, 100), area: {} };
    expect(areaAt(fogAreaList({ old: painted }), at(50, 50))).toBeNull();
  });
});
