import { describe, expect, it } from 'vitest';
import { fogOperationShape, validateFogOperation } from '../../src/app/fog/fogOperationShape';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { MAX_Q } from '../../src/app/types/shapeTypes';
import { fogRectangle } from '../helpers/fogOperations';

describe('saved fog geometry', () => {
  it('applies offsets before rounding', () => {
    const shape = fogOperationShape(fogRectangle({ x: 0.06, y: -0.06, width: 1, height: 1, offsetX: 0.06, offsetY: -0.06 }));
    expect(shape).toEqual([[1, -1, 9, -1, 9, 7, 1, 7]]);
  });

  it('normalizes negative rectangle dimensions', () => {
    expect(fogOperationShape(fogRectangle({ x: 5, y: 4, width: -3, height: -2 }))).toEqual([
      [16, 16, 40, 16, 40, 32, 16, 32],
    ]);
  });

  it('resolves each lasso using NonZero winding', () => {
    const shape = fogOperationShape({ ...fogRectangle(), type: 'lasso', points: [
      { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 },
    ] });
    expect(shapeContains(shape, { x: 5, y: 1 })).toBe(true);
    expect(shapeContains(shape, { x: 1, y: 5 })).toBe(false);
  });

  it('keeps single and repeated brush points as the same round dab', () => {
    const brush: FogOperation = { ...fogRectangle(), type: 'brush', points: [{ x: 3, y: 4 }], brushRadius: 2 };
    const shape = fogOperationShape(brush);
    expect(shapeContains(shape, { x: 3, y: 4 })).toBe(true);
    expect(shapeContains(shape, { x: 5, y: 6 })).toBe(false);
    expect(fogOperationShape({ ...brush, points: [...brush.points, ...brush.points] })).toEqual(shape);
  });

  it('allows valid empty shapes and validates without producing geometry', () => {
    const cases: FogOperation[] = [fogRectangle({ width: 0 }),
      { ...fogRectangle(), type: 'lasso', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { ...fogRectangle(), type: 'brush', points: [], brushRadius: 3 },
      { ...fogRectangle(), type: 'brush', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], brushRadius: 0 }];
    for (const operation of cases) {
      expect(() => validateFogOperation(operation)).not.toThrow();
      expect(fogOperationShape(operation)).toEqual([]);
    }
  });

  it('validates every numeric field before a zero-size or empty return', () => {
    const invalid: FogOperation[] = [
      fogRectangle({ width: 0, height: Infinity }), fogRectangle({ timestamp: NaN }),
      fogRectangle({ offsetX: Infinity }), fogRectangle({ x: NaN }), fogRectangle({ y: Infinity }),
      fogRectangle({ width: NaN }), fogRectangle({ offsetY: NaN }),
      { ...fogRectangle(), type: 'brush', points: [], brushRadius: -1 },
      { ...fogRectangle(), type: 'brush', points: [], brushRadius: Infinity },
      { ...fogRectangle(), type: 'brush', points: [{ x: NaN, y: 0 }], brushRadius: 0 },
      { ...fogRectangle(), type: 'lasso', points: [{ x: 0, y: NaN }] },
    ];
    for (const operation of invalid) {
      expect(() => validateFogOperation(operation)).toThrow(RangeError);
      expect(() => fogOperationShape(operation)).toThrow(RangeError);
    }
  });

  it('checks placed geometry bounds and the full brush extent', () => {
    expect(() => validateFogOperation(fogRectangle({ x: MAX_Q / 8, width: 1 }))).toThrow(RangeError);
    expect(() => validateFogOperation({ ...fogRectangle(), type: 'brush', points: [{ x: MAX_Q / 8, y: 0 }], brushRadius: 1 })).toThrow(RangeError);
    expect(() => validateFogOperation(fogRectangle({ x: -MAX_Q / 8, width: MAX_Q / 4 }))).not.toThrow();
  });
});
