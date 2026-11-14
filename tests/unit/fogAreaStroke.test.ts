import { describe, expect, it } from 'vitest';
import { intersectShapes } from '../../src/app/lighting/polygonClip';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import type { FogArea, FogAreaShape } from '../../src/app/fog/fogAreas';
import { planHideStroke } from '../../src/app/fog/fogAreaStroke';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { outlineRings } from '../../src/app/fog/fogKeyhole';
import { shapeOf } from '../../src/app/fog/fogOutlineShape';
import type { StrokeShape } from '../../src/app/tools/shapeStroke';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { QShape } from '../../src/app/types/shapeTypes';
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
/** The fog of a level that holds `operations`, as the plan is handed it. */
const fogOf = (...operations: FogOperation[]): QShape => fogCoverage(Object.fromEntries(operations.map((operation) => [operation.id, operation]))).shape;

/** The hall, and the cellar to its right with a gap between them. */
const HALL = area('hall', 0, 0, 100, 100);
const CELLAR = area('cellar', 150, 0, 100, 100);

describe('a shape that hides, begun outside every hidden piece', () => {
  it('stays the rectangle it was drawn as where it meets no piece', () => {
    expect(planHideStroke([rect(300, 0, 50, 50)], [HALL, CELLAR], null, fogOf(HALL, CELLAR)))
      .toEqual({ add: [{ type: 'rectangle', x: 300, y: 0, width: 50, height: 50 }], join: null, paint: [] });
  });

  it('is fitted to the hidden pieces it would overlap, and overlaps none', () => {
    const plan = planHideStroke([rect(50, 50, 150, 100)], [HALL, CELLAR], null, fogOf(HALL, CELLAR));
    expect(plan.add).toHaveLength(1);
    const fitted = outlineOf(plan.add[0]!);
    // What the hall and the cellar cover of it is cut off.
    expect(corners(fitted)).toEqual(at([100, 50], [150, 50], [150, 100], [200, 100], [200, 150], [50, 150], [50, 100], [100, 100]));
    for (const piece of [HALL, CELLAR]) expect(intersectShapes(shapeOf(fitted)!, shapeOf(outlineOf(piece))!)).toEqual([]);
    // Their fog lies under the rest of it: nothing more to paint.
    expect(plan.paint).toEqual([]);
  });

  it('lies over a revealed piece as it was drawn: what is hidden there is this shape\'s', () => {
    const open = area('hall', 0, 0, 100, 100, true);
    const plan = planHideStroke([rect(50, 50, 150, 100)], [open], null, fogOf(open));
    expect(plan).toEqual({ add: [{ type: 'rectangle', x: 50, y: 50, width: 150, height: 100 }], join: null, paint: [] });
  });

  it('is nothing while the shape is none yet, and for a brush stroke, which is plain paint', () => {
    expect(planHideStroke([], [HALL], null, fogOf(HALL))).toEqual({ add: [], join: null, paint: [] });
    expect(planHideStroke([{ type: 'brush', points: [{ x: 0, y: 0 }], brushRadius: 20 }], [], null, [])).toEqual({ add: [], join: null, paint: [] });
    expect(planHideStroke([lasso([{ x: 0, y: 0 }, { x: 5, y: 5 }])], [], null, [])).toEqual({ add: [], join: null, paint: [] });
  });

  it('is one piece per outline of several shapes: shapes that touch are one, and a cell they leave out in their middle stays open', () => {
    // Shapes that lie apart come back as they were given, to the last bit.
    const apart = planHideStroke([lasso(box(300, 0, 50.3, 50)), lasso(box(400, 0, 50, 50))], [], null, []);
    expect(apart.add).toEqual([{ type: 'lasso', points: box(300, 0, 50.3, 50) }, { type: 'lasso', points: box(400, 0, 50, 50) }]);

    // Rows of cells around a cell left out: one piece, with the cell in the middle as a hole in it.
    const ring = planHideStroke([lasso(box(0, 0, 150, 50)), lasso(box(0, 50, 50, 50)), lasso(box(100, 50, 50, 50)), lasso(box(0, 100, 150, 50))], [], null, []);
    expect(ring.add).toHaveLength(1);
    const outline = outlineOf(ring.add[0]!);
    expect(outlineRings(outline).map((part) => corners(part)).sort()).toEqual([at([0, 0], [150, 0], [150, 150], [0, 150]), at([50, 50], [100, 50], [100, 100], [50, 100])].sort());
    const fog = fogOf({ id: 'ring', kind: 'fog', timestamp: 1, isErasing: false, type: 'lasso', points: [...outline] });
    expect([shapeContains(fog, { x: 25, y: 75 }), shapeContains(fog, { x: 75, y: 75 })]).toEqual([true, false]);
  });

  it('is fitted to the pieces made before it in the same stroke', () => {
    const wide = area('wide', 340, 0, 70, 50);
    const plan = planHideStroke([lasso(box(300, 0, 50, 50)), lasso(box(400, 0, 50, 50))], [wide], null, fogOf(wide));
    expect(plan.add.map((shape) => corners(outlineOf(shape)))).toEqual([at([300, 0], [340, 0], [340, 50], [300, 50]), at([410, 0], [450, 0], [450, 50], [410, 50])]);
  });

  it('paints plain fog where it lies over a hidden piece whose fog was cleared since', () => {
    // The party walked into the hall: its right half lies open, though the piece still counts as hidden.
    const explored: FogOperation = { id: 'explored', kind: 'fog', timestamp: 2, isErasing: true, type: 'rectangle', x: 50, y: 0, width: 50, height: 100 };
    const plan = planHideStroke([rect(60, 20, 100, 30)], [HALL], null, fogOf(HALL, explored));
    expect(plan.add.map((shape) => corners(outlineOf(shape)))).toEqual([at([100, 20], [160, 20], [160, 50], [100, 50])]);
    expect(plan.paint.map(corners)).toEqual([at([60, 20], [100, 20], [100, 50], [60, 50])]);
    // Where the fog cannot be worked out, no gap is filled.
    expect(planHideStroke([rect(60, 20, 100, 30)], [HALL], null, null).paint).toEqual([]);
  });
});

describe('a shape that hides, begun inside a hidden piece', () => {
  it('is added to that piece alone, which stays one outline', () => {
    const plan = planHideStroke([rect(50, 50, 100, 100)], [HALL, CELLAR], 'hall', fogOf(HALL, CELLAR));
    expect(plan.add).toEqual([]);
    expect(plan.paint).toEqual([]);
    expect(plan.join?.id).toBe('hall');
    expect(corners(plan.join!.points)).toEqual(at([0, 0], [100, 0], [100, 50], [150, 50], [150, 150], [50, 150], [50, 100], [0, 100]));
  });

  it('is a piece of its own where the two would enclose a gap', () => {
    // A band that leaves the hall, turns round and comes back to it.
    const band = lasso([{ x: 90, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 90 }, { x: 90, y: 90 }, { x: 90, y: 80 }, { x: 190, y: 80 }, { x: 190, y: 20 }, { x: 90, y: 20 }]);
    const plan = planHideStroke([band], [HALL], 'hall', fogOf(HALL));
    expect(plan.join).toBeNull();
    expect(plan.add).toHaveLength(1);
  });

  it('changes no outline where it lies inside the piece, and paints only what was cleared there', () => {
    expect(planHideStroke([rect(20, 20, 30, 30)], [HALL], 'hall', fogOf(HALL))).toEqual({ add: [], join: null, paint: [] });
    const explored: FogOperation = { id: 'explored', kind: 'fog', timestamp: 2, isErasing: true, type: 'rectangle', x: 50, y: 0, width: 50, height: 100 };
    const plan = planHideStroke([rect(20, 20, 60, 30)], [HALL], 'hall', fogOf(HALL, explored));
    expect(plan.add).toEqual([]);
    expect(plan.join).toBeNull();
    expect(plan.paint.map(corners)).toEqual([at([50, 20], [80, 20], [80, 50], [50, 50])]);
  });

  it('is a piece of its own where the piece it began in is gone, or revealed since', () => {
    expect(planHideStroke([rect(300, 0, 50, 50)], [HALL], 'gone', fogOf(HALL)).add).toHaveLength(1);
    const open = area('hall', 0, 0, 100, 100, true);
    const plan = planHideStroke([rect(50, 50, 100, 100)], [open], 'hall', fogOf(open));
    expect(plan.join).toBeNull();
    expect(plan.add).toEqual([{ type: 'rectangle', x: 50, y: 50, width: 100, height: 100 }]);
  });
});
