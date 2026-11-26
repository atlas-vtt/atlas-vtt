import { describe, expect, it } from 'vitest';
import { shapeContainment, shapeContains } from '../../src/app/lighting/shapeContains';
import type { QShape } from '../../src/app/types/shapeTypes';

const nested: QShape = [
  [0, 0, 80, 0, 80, 80, 0, 80],
  [16, 16, 16, 64, 64, 64, 64, 16],
  [32, 32, 48, 32, 48, 48, 32, 48],
];

describe('shape membership', () => {
  it('reads world pixels and keeps a hole empty except for its filled island', () => {
    expect(shapeContains(nested, { x: 1, y: 1 })).toBe(true);
    expect(shapeContains(nested, { x: 3, y: 3 })).toBe(false);
    expect(shapeContains(nested, { x: 5, y: 5 })).toBe(true);
    expect(shapeContains(nested, { x: 11, y: 5 })).toBe(false);
  });

  it.each([[0, 0], [10, 5], [5, 0], [2, 2], [2, 5], [8, 8]])(
    'includes boundary point (%s, %s)', (x, y) => {
      expect(shapeContains(nested, { x, y })).toBe(true);
    },
  );

  it('does not round a query across an edge', () => {
    expect(shapeContains(nested, { x: -0.001, y: 1 })).toBe(false);
    expect(shapeContains(nested, { x: 0.001, y: 1 })).toBe(true);
    expect(shapeContains(nested, { x: 2.001, y: 3 })).toBe(false);
    expect(shapeContains(nested, { x: 1.999, y: 3 })).toBe(true);
  });

  it('keeps fractional queries on the correct side of a long nearly diagonal edge', () => {
    const bound = 2 ** 24;
    const shape = [[-bound, -bound, bound, bound - 1, -bound, bound]];
    // This edge crosses x=0 at y=-0.5 Q. A positive x at the same y lies outside.
    expect(shapeContains(shape, { x: 1.25e-11, y: -0.0625 })).toBe(false);
    expect(shapeContains(shape, { x: -1.25e-11, y: -0.0625 })).toBe(true);
    expect(shapeContains(shape, { x: 0, y: -0.0625 })).toBe(true);
  });

  it('uses NonZero winding rather than toggling for overlapping positive rings', () => {
    const shape = [[0, 0, 32, 0, 32, 32, 0, 32], [16, 16, 48, 16, 48, 48, 16, 48]];
    expect(shapeContains(shape, { x: 3, y: 3 })).toBe(true);
  });

  it('handles negative coordinates, sloped edges and a concavity', () => {
    const shape = [[-16, -16, 16, -16, 0, 0, 16, 16, -16, 16]];
    expect(shapeContains(shape, { x: -1, y: 0 })).toBe(true);
    expect(shapeContains(shape, { x: 1, y: 0 })).toBe(false);
    expect(shapeContains(shape, { x: 1, y: -1 })).toBe(true);
  });

  it('has no coverage when the shape is empty', () => {
    expect(shapeContains([], { x: 0, y: 0 })).toBe(false);
  });

  it('returns false for a finite query beyond the bounded geometry', () => {
    expect(shapeContains(nested, { x: 1e308, y: 0 })).toBe(false);
    expect(shapeContains(nested, { x: 0, y: -1e308 })).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])('rejects a nonfinite query coordinate %s', value => {
    expect(() => shapeContains(nested, { x: value, y: 0 })).toThrow(RangeError);
    expect(() => shapeContains(nested, { x: 0, y: value })).toThrow(RangeError);
  });
});

describe('membership of many points of one shape', () => {
  const next = (seed: number): (() => number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  /** A ring of `corners` round a centre, its radius uneven: a cave's outline, in eighth pixels. */
  function ring(random: () => number, corners: number, x: number, y: number, radius: number): number[] {
    return Array.from({ length: corners }, (_, index) => {
      const [angle, reach] = [(index / corners) * 2 * Math.PI, radius * (0.6 + random() * 0.4)];
      return [Math.round((x + Math.cos(angle) * reach) * 8), Math.round((y + Math.sin(angle) * reach) * 8)];
    }).flat();
  }

  it('answers as `shapeContains` does: inside, outside, on an edge, at a corner and level with one', () => {
    const random = next(31);
    const shapes: QShape[] = [
      nested,
      [[0, 0, 8000, 0, 8000, 16, 0, 16]],
      [[0, 0, 16, 0, 16, 8000, 0, 8000]],
      ...Array.from({ length: 20 }, () => [ring(random, 3 + Math.floor(random() * 400), 500, 500, 400), ring(random, 5, 500, 500, 60).reverse()]),
    ];
    for (const shape of shapes) {
      const inside = shapeContainment(shape);
      const corners = shape.flatMap((points) => points.flatMap((_, index) => (index % 2 ? [] : [{ x: points[index]! / 8, y: points[index + 1]! / 8 }])));
      const points = [
        ...Array.from({ length: 300 }, () => ({ x: random() * 1100 - 50, y: random() * 1100 - 50 })),
        ...corners.slice(0, 200),
        // Level with a corner, a little to either side of it and of the edge between two corners.
        ...corners.slice(0, 200).flatMap(({ x, y }, index) => {
          const to = corners[(index + 1) % corners.length]!;
          return [{ x: x + 0.3, y }, { x: x - 0.3, y }, { x: (x + to.x) / 2, y: (y + to.y) / 2 }, { x, y: y + 0.125 }];
        }),
      ];
      for (const point of points) expect(inside(point), JSON.stringify(point)).toBe(shapeContains(shape, point));
    }
  });

  it('holds nothing for a shape without edges, and refuses a point that is no number as `shapeContains` does', () => {
    expect(shapeContainment([])({ x: 1, y: 1 })).toBe(false);
    expect(() => shapeContainment(nested)({ x: Number.NaN, y: 1 })).toThrow(RangeError);
    expect(shapeContainment(nested)({ x: 1, y: 1e12 })).toBe(false);
  });
});
