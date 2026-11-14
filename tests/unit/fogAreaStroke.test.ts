import { describe, expect, it } from 'vitest';
import { areaOutline, outerOutlines, trimmedAreas, type FogArea, type FogAreaShape } from '../../src/app/fog/fogAreas';
import { areaAtPoint, areaStrokeKind, insideOutline, planAreaStroke } from '../../src/app/fog/fogAreaStroke';
import type { StrokeShape } from '../../src/app/tools/shapeStroke';
import type { Point } from '../../src/app/types/visionTypes';

const box = (x: number, y: number, width: number, height: number): Point[] =>
  [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const rect = (x: number, y: number, width: number, height: number): StrokeShape => ({ type: 'rectangle', x, y, width, height });
const lasso = (points: Point[]): StrokeShape => ({ type: 'lasso', points });
const area = (id: string, x: number, y: number, width: number, height: number, isErasing = false): FogArea =>
  ({ id, kind: 'fog', timestamp: 1, isErasing, type: 'rectangle', x, y, width, height, area: {} });

/** The corners of an outline in an order that does not depend on where it starts or which way it runs. */
const corners = (outline: readonly Point[]): string[] => outline.map((point) => `${point.x},${point.y}`).sort();
const at = (...points: [number, number][]): string[] => points.map(([x, y]) => `${x},${y}`).sort();
const outlineOf = (shape: FogAreaShape): readonly Point[] => (shape.type === 'lasso' ? shape.points : box(shape.x, shape.y, shape.width, shape.height));

/** The hall, and the cellar to its right with a gap between them. */
const HALL = area('hall', 0, 0, 100, 100);
const CELLAR = area('cellar', 150, 0, 100, 100);

describe('what a shape drawn in Areas mode becomes', () => {
  it('is a new area begun outside every area, whatever Alt says', () => {
    expect(areaStrokeKind(null, false)).toBe('new');
    expect(areaStrokeKind(null, true)).toBe('new');
  });

  it('is added to the area it begins in, or with Alt taken away', () => {
    expect(areaStrokeKind('hall', false)).toBe('join');
    expect(areaStrokeKind('hall', true)).toBe('trim');
  });
});

describe('the area under a point', () => {
  it('is the one whose outline holds the point', () => {
    expect(areaAtPoint([HALL, CELLAR], { x: 50, y: 50 })?.id).toBe('hall');
    expect(areaAtPoint([HALL, CELLAR], { x: 200, y: 50 })?.id).toBe('cellar');
    expect(areaAtPoint([HALL, CELLAR], { x: 125, y: 50 })).toBeNull();
    expect(insideOutline({ x: 50, y: 50 }, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(false);
  });

  it('is the smallest of areas that lie in each other, whichever comes first', () => {
    const closet = area('closet', 40, 40, 20, 20);
    expect(areaAtPoint([HALL, closet], { x: 50, y: 50 })?.id).toBe('closet');
    expect(areaAtPoint([closet, HALL], { x: 50, y: 50 })?.id).toBe('closet');
    expect(areaAtPoint([closet, HALL], { x: 10, y: 10 })?.id).toBe('hall');
  });
});

describe('a new area', () => {
  it('stays the rectangle it was drawn as where it meets no area', () => {
    const plan = planAreaStroke([rect(300, 0, 50, 50)], [HALL, CELLAR], null, false);
    expect(plan).toEqual({ kind: 'new', add: [{ type: 'rectangle', x: 300, y: 0, width: 50, height: 50 }], reshape: [], refused: 0 });
  });

  it('is fitted to the areas it would overlap, and overlaps none', () => {
    const plan = planAreaStroke([rect(50, 50, 150, 100)], [HALL, CELLAR], null, false);
    expect(plan.add).toHaveLength(1);
    const fitted = outlineOf(plan.add[0]!);
    // What the hall and the cellar cover of it is cut off.
    expect(corners(fitted)).toEqual(at([100, 50], [150, 50], [150, 100], [200, 100], [200, 150], [50, 150], [50, 100], [100, 100]));
    // Neither covers anything of it.
    expect(trimmedAreas([fitted], [areaOutline(HALL), areaOutline(CELLAR)])).toEqual([undefined]);
  });

  it('is nothing while the shape is none yet', () => {
    expect(planAreaStroke([], [HALL], null, false)).toEqual({ kind: 'new', add: [], reshape: [], refused: 0 });
    expect(planAreaStroke([{ type: 'brush', points: [{ x: 0, y: 0 }], brushRadius: 20 }], [], null, false).add).toEqual([]);
  });

  it('is one area per outline of several shapes: shapes that touch are one, and what they enclose is theirs', () => {
    const apart = planAreaStroke([lasso(box(300, 0, 50, 50)), lasso(box(400, 0, 50, 50))], [], null, false);
    expect(apart.add.map((shape) => corners(outlineOf(shape)))).toEqual([at([300, 0], [350, 0], [350, 50], [300, 50]), at([400, 0], [450, 0], [450, 50], [400, 50])]);

    // Rows of cells around a cell left out: one area, the cell in the middle with it.
    const ring = planAreaStroke([lasso(box(0, 0, 150, 50)), lasso(box(0, 50, 50, 50)), lasso(box(100, 50, 50, 50)), lasso(box(0, 100, 150, 50))], [], null, false);
    expect(ring.add).toHaveLength(1);
    expect(corners(outlineOf(ring.add[0]!))).toEqual(at([0, 0], [150, 0], [150, 150], [0, 150]));
  });

  it('is fitted to the areas made before it in the same stroke', () => {
    const plan = planAreaStroke([lasso(box(300, 0, 50, 50)), lasso(box(400, 0, 50, 50))], [area('wide', 340, 0, 70, 50)], null, false);
    expect(plan.add.map((shape) => corners(outlineOf(shape)))).toEqual([at([300, 0], [340, 0], [340, 50], [300, 50]), at([410, 0], [450, 0], [450, 50], [410, 50])]);
  });
});

describe('a shape begun inside an area', () => {
  it('is added to that area alone, which stays one outline', () => {
    const plan = planAreaStroke([rect(50, 50, 100, 100)], [HALL, CELLAR], 'hall', false);
    expect(plan.kind).toBe('join');
    expect(plan.add).toEqual([]);
    expect(plan.refused).toBe(0);
    expect(plan.reshape.map(({ id }) => id)).toEqual(['hall']);
    expect(corners(plan.reshape[0]!.points)).toEqual(at([0, 0], [100, 0], [100, 50], [150, 50], [150, 150], [50, 150], [50, 100], [0, 100]));
  });

  it('is refused where the two would enclose a gap', () => {
    // A band that leaves the hall, turns round and comes back to it.
    const band = lasso([{ x: 90, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 90 }, { x: 90, y: 90 }, { x: 90, y: 80 }, { x: 190, y: 80 }, { x: 190, y: 20 }, { x: 90, y: 20 }]);
    expect(planAreaStroke([band], [HALL], 'hall', false)).toEqual({ kind: 'join', add: [], reshape: [], refused: 1 });
  });

  it('is a new area where the area it began in is gone', () => {
    expect(planAreaStroke([rect(300, 0, 50, 50)], [HALL], 'gone', false).kind).toBe('new');
  });
});

describe('a shape begun inside an area with Alt', () => {
  it('is taken away from every area it covers, and from no other', () => {
    const plan = planAreaStroke([rect(50, 50, 150, 100)], [HALL, CELLAR, area('far', 400, 0, 50, 50)], 'hall', true);
    expect(plan.kind).toBe('trim');
    expect(plan.refused).toBe(0);
    expect(plan.reshape.map(({ id }) => id)).toEqual(['hall', 'cellar']);
    expect(corners(plan.reshape[0]!.points)).toEqual(at([0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]));
    expect(corners(plan.reshape[1]!.points)).toEqual(at([150, 0], [250, 0], [250, 100], [200, 100], [200, 50], [150, 50]));
  });

  it('leaves an area it would pierce, split or take whole as it is, and says how many', () => {
    expect(planAreaStroke([rect(40, 40, 20, 20)], [HALL], 'hall', true)).toEqual({ kind: 'trim', add: [], reshape: [], refused: 1 });
    // Through the cellar from side to side, and all of a closet.
    const closet = area('closet', 60, 60, 10, 10);
    const plan = planAreaStroke([rect(50, 40, 250, 40)], [HALL, CELLAR, closet], 'hall', true);
    expect(plan.reshape.map(({ id }) => id)).toEqual(['hall']);
    expect(plan.refused).toBe(2);
  });

  it('leaves an area it only touches alone', () => {
    const plan = planAreaStroke([rect(50, 100, 50, 50)], [HALL], 'hall', true);
    expect(plan).toEqual({ kind: 'trim', add: [], reshape: [], refused: 0 });
  });
});

describe('outlines taken together', () => {
  it('come back as they were given where they lie apart', () => {
    const shapes = [box(0, 0, 10.3, 10), box(50, 0, 10, 10)];
    expect(outerOutlines(shapes)).toEqual(shapes);
    expect(outerOutlines([box(0, 0, 10, 10)])).toEqual([box(0, 0, 10, 10)]);
    expect(outerOutlines([])).toEqual([]);
  });

  it('are each trimmed by all the shapes at once: untouched where the shapes cover nothing of one, none where they leave it in pieces', () => {
    const trimmed = trimmedAreas([box(0, 0, 100, 100), box(100, 0, 100, 100), box(300, 0, 100, 100), box(0, 200, 100, 100)], [box(50, 50, 30, 100), box(280, 40, 200, 20)]);
    expect(corners(trimmed[0]!)).toEqual(at([0, 0], [100, 0], [100, 100], [80, 100], [80, 50], [50, 50], [50, 100], [0, 100]));
    // The second only touches the first shape, the third is cut through, the fourth lies away from both.
    expect(trimmed.slice(1)).toEqual([undefined, null, undefined]);
    expect(trimmedAreas([box(0, 0, 100, 100)], [])).toEqual([undefined]);
  });
});
