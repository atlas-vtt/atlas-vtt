import { describe, expect, it } from 'vitest';
import { fogAreaList, type FogArea } from '../../src/app/fog/fogAreas';
import { areaAt, fogBodyAt, hiddenGround, outlinesOf } from '../../src/app/fog/fogBody';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { keyholed } from '../../src/app/fog/fogKeyhole';
import { shapeOf } from '../../src/app/fog/fogOutlineShape';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { Point } from '../../src/app/types/visionTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const box = (x: number, y: number, width: number, height: number): Point[] =>
  [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const at = (x: number, y: number): Point => ({ x, y });
const corners = (outline: readonly Point[]): string[] => outline.map((point) => `${point.x},${point.y}`).sort();
const paint = (id: string, x: number, y: number, width: number, height: number, timestamp = 1, isErasing = false): FogOperation =>
  ({ id, kind: 'fog', timestamp, isErasing, type: 'rectangle', x, y, width, height });
const piece = (id: string, x: number, y: number, width: number, height: number, timestamp = 1, isErasing = false): FogArea =>
  ({ ...paint(id, x, y, width, height, timestamp, isErasing), area: {} }) as FogArea;
const record = (...operations: FogOperation[]): Record<string, FogOperation> => Object.fromEntries(operations.map((operation) => [operation.id, operation]));
/** The outlines to reveal the body under a point of a level that holds `operations`. */
const bodyAt = (point: Point, ...operations: FogOperation[]): Point[][] => {
  const fog = record(...operations);
  return fogBodyAt(fogCoverage(fog).shape, point, fogAreaList(fog));
};

function area(outline: readonly Point[]): number {
  let twice = 0;
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % outline.length]!;
    twice += a.x * b.y - b.x * a.y;
  });
  return Math.abs(twice) / 2;
}

describe('the remembered piece under a point', () => {
  const HALL = piece('hall', 0, 0, 100, 100);
  const CELLAR = piece('cellar', 150, 0, 100, 100, 1, true);

  it('is the hidden one, or the revealed one, whose outline holds the point', () => {
    expect(areaAt([HALL, CELLAR], at(50, 50), true)?.id).toBe('hall');
    expect(areaAt([HALL, CELLAR], at(50, 50), false)).toBeNull();
    expect(areaAt([HALL, CELLAR], at(200, 50), false)?.id).toBe('cellar');
    expect(areaAt([HALL, CELLAR], at(200, 50), true)).toBeNull();
    expect(areaAt([HALL, CELLAR], at(125, 50), true)).toBeNull();
    expect(areaAt([HALL, CELLAR], at(Number.NaN, 50), true)).toBeNull();
  });

  it('is the one hidden or revealed last where several overlap, whichever comes first', () => {
    const closet = piece('closet', 40, 40, 20, 20, 5);
    const late = piece('hall', 0, 0, 100, 100, 9);
    expect(areaAt([HALL, closet], at(50, 50), true)?.id).toBe('closet');
    expect(areaAt([closet, HALL], at(50, 50), true)?.id).toBe('closet');
    expect(areaAt([closet, late], at(50, 50), true)?.id).toBe('hall');
    expect(areaAt([closet, HALL], at(10, 10), true)?.id).toBe('hall');
  });

  it('is not one whose hole the point lies in', () => {
    const ring = { id: 'ring', kind: 'fog', timestamp: 1, isErasing: false, type: 'lasso', points: keyholed(box(0, 0, 300, 300), [box(100, 100, 100, 100)]), area: {} } as FogArea;
    expect(areaAt([ring], at(50, 50), true)?.id).toBe('ring');
    expect(areaAt([ring], at(150, 150), true)).toBeNull();
  });
});

describe('the body of fog under a point', () => {
  it('is the connected fog there, and nothing of a body that lies apart', () => {
    const body = bodyAt(at(50, 50), paint('a', 0, 0, 100, 100), paint('b', 60, 60, 100, 100, 2), paint('apart', 400, 0, 100, 100, 3));
    expect(body).toHaveLength(1);
    expect(corners(body[0]!)).toEqual(corners([at(0, 0), at(100, 0), at(100, 60), at(160, 60), at(160, 160), at(60, 160), at(60, 100), at(0, 100)]));
    expect(bodyAt(at(450, 50), paint('a', 0, 0, 100, 100), paint('apart', 400, 0, 100, 100, 3)).map(corners)).toEqual([corners(box(400, 0, 100, 100))]);
  });

  it('is none where the point is not in fog: beside it, in a hole of it, at no place', () => {
    const fog = [paint('all', 0, 0, 300, 300), paint('hole', 100, 100, 100, 100, 2, true)];
    expect(bodyAt(at(500, 500), ...fog)).toEqual([]);
    expect(bodyAt(at(150, 150), ...fog)).toEqual([]);
    expect(bodyAt(at(Number.NaN, 0), ...fog)).toEqual([]);
    expect(bodyAt(at(10, 10))).toEqual([]);
  });

  it('keeps its hole, and the fog that stands free in the hole, out of what is revealed', () => {
    const fog = [paint('all', 0, 0, 300, 300), paint('hole', 100, 100, 100, 100, 2, true), paint('island', 140, 140, 20, 20, 3)];
    const [body, ...more] = bodyAt(at(50, 50), ...fog);
    expect(more).toEqual([]);
    expect(area(body!)).toBe(300 * 300 - 100 * 100);
    // Revealed as the lasso it is written as, the island stays and the ring goes.
    const after = fogCoverage(record(...fog, { id: 'reveal', kind: 'fog', timestamp: 4, isErasing: true, type: 'lasso', points: body! }));
    expect([after.covers(at(50, 50)), after.covers(at(250, 250)), after.covers(at(150, 150)), after.covers(at(120, 120))]).toEqual([false, false, true, false]);
    // The island is a body of its own.
    expect(bodyAt(at(150, 150), ...fog).map(corners)).toEqual([corners(box(140, 140, 20, 20))]);
  });

  it('leaves out what the hidden pieces cover, so no piece that counts as hidden is opened', () => {
    const fog = [paint('all', 0, 0, 400, 100), piece('room', 150, 0, 100, 100, 2)];
    const body = bodyAt(at(50, 50), ...fog);
    // The room cuts the fog in two: both sides are the body, the room is not.
    expect(body.map(corners).sort()).toEqual([corners(box(0, 0, 150, 100)), corners(box(250, 0, 150, 100))].sort());
    const after = fogCoverage(record(...fog, ...body.map((points, index): FogOperation => ({ id: `r${index}`, kind: 'fog', timestamp: 10 + index, isErasing: true, type: 'lasso', points }))));
    expect([after.covers(at(50, 50)), after.covers(at(350, 50)), after.covers(at(200, 50))]).toEqual([false, false, true]);
  });

  it('takes a revealed piece for no piece: loose fog painted over it is revealed with the body', () => {
    const body = bodyAt(at(50, 50), piece('room', 150, 0, 100, 100, 1, true), paint('all', 0, 0, 400, 100, 2));
    expect(body.map(corners)).toEqual([corners(box(0, 0, 400, 100))]);
  });
});

describe('shapes as the outlines fog is written with', () => {
  it('are one outline per piece, a piece with a hole as one outline with a slit', () => {
    const ring = shapeOf(keyholed(box(0, 0, 300, 300), [box(100, 100, 100, 100)]))!;
    const outlines = outlinesOf([...ring, ...shapeOf(box(500, 0, 50, 50))!]);
    expect(outlines).toHaveLength(2);
    expect(outlines.map(area).sort((a, b) => a - b)).toEqual([50 * 50, 300 * 300 - 100 * 100]);
    expect(outlinesOf([])).toEqual([]);
  });

  it('take the ground of hidden pieces only, and of those near an outline where one is given', () => {
    const pieces = [piece('a', 0, 0, 100, 100), piece('b', 500, 0, 100, 100), piece('open', 200, 0, 100, 100, 1, true)];
    expect(hiddenGround(pieces)).toHaveLength(2);
    expect(hiddenGround(pieces, box(50, 50, 100, 100))).toHaveLength(1);
    expect(hiddenGround([])).toEqual([]);
  });
});

describe('revealing a body in the store', () => {
  function scene(): { store: ViewAtlasStore; covers: (point: Point) => boolean; steps: () => number; undo: () => void } {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `fog-body-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    const history = getHistoryStore(store)!;
    return {
      store,
      covers: (point) => fogCoverage(store.getState().objects.fog).covers(point),
      steps: () => history.getState().pastStates.length,
      undo: () => history.getState().undo(),
    };
  }

  it('is one undo step however many pieces it has, and undo brings the fog back', () => {
    const { store, covers, steps, undo } = scene();
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 400, height: 100 });
    store.getState().addFogArea({ type: 'rectangle', x: 150, y: 0, width: 100, height: 100 });
    store.getState().addFogOperation({ type: 'brush', isErasing: false, points: [at(700, 50)], brushRadius: 30 });
    const fog = store.getState().objects.fog;
    const body = fogBodyAt(fogCoverage(fog).shape, at(50, 50), fogAreaList(fog));
    expect(body).toHaveLength(2);
    const before = steps();
    store.getState().addFogOperations(body.map((points) => ({ type: 'lasso', isErasing: true, points })));
    expect(steps()).toBe(before + 1);
    // Both sides of the room are open, the room and the fog that lies apart are not.
    expect([covers(at(50, 50)), covers(at(350, 50)), covers(at(200, 50)), covers(at(700, 50))]).toEqual([false, false, true, true]);
    undo();
    expect([covers(at(50, 50)), covers(at(350, 50)), covers(at(200, 50)), covers(at(700, 50))]).toEqual([true, true, true, true]);
  });
});
