import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { fitsAnchors, fitsEllipse, fitsRectangle } from '../annotationFit';
import { ELLIPSE_STEPS } from '../annotationTypes';
import { boxFrame, CURVE_STEPS, curvedPath, ellipseOf, ellipsePoints, frameOf, rectangleOf, rectanglePoints, squared, stepped15 } from '../shapeOutlines';
import { distance, seeded } from './annotationKit';

/** A map stretch with a turn: what a realigned map does to every point. */
const stretch = (point: Point): Point => ({ x: 1.3 * point.x * Math.cos(0.4) - point.y * Math.sin(0.4) + 17, y: 1.3 * point.x * Math.sin(0.4) + point.y * Math.cos(0.4) - 9 });

function near(a: readonly Point[], b: readonly Point[], within = 1e-9): void {
  expect(a).toHaveLength(b.length);
  a.forEach((point, i) => expect(distance(point, b[i]!)).toBeLessThan(within));
}

describe('rectanglePoints', () => {
  it('is the four corners of the dragged box and the first again', () => {
    expect(rectanglePoints({ x: 10, y: 20 }, { x: 40, y: 5 })).toEqual([{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 20 }]);
  });

  it('turned, keeps the dragged corners and has square corners along the turn', () => {
    const from = { x: 10, y: 20 };
    const to = { x: 90, y: 50 };
    const points = rectanglePoints(from, to, 30);
    expect(points).toHaveLength(5);
    near([points[0]!, points[2]!, points[4]!], [from, to, from]);
    const side = { x: points[1]!.x - points[0]!.x, y: points[1]!.y - points[0]!.y };
    const next = { x: points[2]!.x - points[1]!.x, y: points[2]!.y - points[1]!.y };
    expect(Math.atan2(side.y, side.x)).toBeCloseTo(Math.PI / 6, 12);
    expect(side.x * next.x + side.y * next.y).toBeCloseTo(0, 9);
    expect(fitsRectangle(points)).toBe(true);
  });
});

describe('ellipsePoints', () => {
  it('has its two half axes among its points, to the last bit', () => {
    const points = ellipsePoints({ x: 10, y: 20 }, { x: 110, y: 80 });
    expect(points).toHaveLength(ELLIPSE_STEPS + 1);
    expect(points[ELLIPSE_STEPS]).toEqual(points[0]);
    expect(points[0]).toEqual({ x: 110, y: 50 });
    expect(points[16]).toEqual({ x: 60, y: 80 });
    expect(points[32]).toEqual({ x: 10, y: 50 });
    expect(points[48]).toEqual({ x: 60, y: 20 });
  });

  it('lies on the ellipse in the dragged box, at even steps', () => {
    const points = ellipsePoints({ x: -30, y: 40 }, { x: 50, y: 100 });
    for (const [step, point] of points.entries()) {
      expect(((point.x - 10) / 40) ** 2 + ((point.y - 70) / 30) ** 2).toBeCloseTo(1, 12);
      expect(Math.atan2((point.y - 70) / 30, (point.x - 10) / 40)).toBeCloseTo(Math.atan2(Math.sin((step * Math.PI) / 32), Math.cos((step * Math.PI) / 32)), 9);
    }
    expect(fitsEllipse(points)).toBe(true);
  });
});

describe('frameOf', () => {
  it('reads back the frame a rectangle or an ellipse was made from', () => {
    const frame = boxFrame({ x: 10, y: 20 }, { x: 90, y: 50 }, 25);
    for (const [type, points] of [['rectangle', rectangleOf(frame)], ['ellipse', ellipseOf(frame)]] as const) {
      const read = frameOf(points, type)!;
      near([read.centre, read.a, read.b], [frame.centre, frame.a, frame.b]);
    }
  });

  it('reads a shape a stretched map left oblique, with the axes the stretch made of its own', () => {
    const frame = boxFrame({ x: 10, y: 20 }, { x: 90, y: 50 }, 25);
    const origin = stretch({ x: 0, y: 0 });
    const moved = (axis: Point): Point => ({ x: stretch(axis).x - origin.x, y: stretch(axis).y - origin.y });
    for (const [type, make] of [['rectangle', rectangleOf], ['ellipse', ellipseOf]] as const) {
      const read = frameOf(make(frame).map(stretch), type)!;
      near([read.centre, read.a, read.b], [stretch(frame.centre), moved(frame.a), moved(frame.b)]);
      expect(Math.abs(read.a.x * read.b.x + read.a.y * read.b.y)).toBeGreaterThan(1);
      near(make(read), make(frame).map(stretch));
    }
  });

  it('is null for points that are no such shape', () => {
    const rectangle = rectanglePoints({ x: 0, y: 0 }, { x: 40, y: 30 });
    const ellipse = ellipsePoints({ x: 0, y: 0 }, { x: 40, y: 30 });
    expect(frameOf(ellipse, 'rectangle')).toBeNull();
    expect(frameOf(rectangle, 'ellipse')).toBeNull();
    expect(frameOf(rectangle.slice(0, 4), 'rectangle')).toBeNull();
    expect(frameOf(rectangle.map((point, i) => (i === 2 ? { x: point.x + 1, y: point.y } : point)), 'rectangle')).toBeNull();
    expect(frameOf(ellipse.map((point, i) => (i === 9 ? { x: point.x + 1, y: point.y } : point)), 'ellipse')).toBeNull();
    // A cut ellipse: its points less a few.
    expect(frameOf([...ellipse.slice(0, 20), ...ellipse.slice(30)], 'ellipse')).toBeNull();
  });
});

describe('curvedPath', () => {
  /** The same spline written as Hermite pieces with each anchor's tangent half the way between its neighbours. */
  function hermite(anchors: readonly Point[], closed: boolean, span: number, t: number): Point {
    const count = anchors.length;
    const at = (index: number): Point => {
      if (closed) return anchors[((index % count) + count) % count]!;
      if (index < 0) return { x: 2 * anchors[0]!.x - anchors[1]!.x, y: 2 * anchors[0]!.y - anchors[1]!.y };
      if (index >= count) return { x: 2 * anchors[count - 1]!.x - anchors[count - 2]!.x, y: 2 * anchors[count - 1]!.y - anchors[count - 2]!.y };
      return anchors[index]!;
    };
    const [p0, p1, p2, p3] = [at(span - 1), at(span), at(span + 1), at(span + 2)];
    const [h00, h10, h01, h11] = [2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2];
    return {
      x: h00 * p1.x + (h10 * (p2.x - p0.x)) / 2 + h01 * p2.x + (h11 * (p3.x - p1.x)) / 2,
      y: h00 * p1.y + (h10 * (p2.y - p0.y)) / 2 + h01 * p2.y + (h11 * (p3.y - p1.y)) / 2,
    };
  }

  it('passes through its anchors, each a fixed number of points after the one before', () => {
    const random = seeded(6);
    for (const closed of [false, true]) {
      const anchors = Array.from({ length: 7 }, () => ({ x: random() * 400, y: random() * 300 }));
      const path = curvedPath(anchors, closed);
      expect(path).toHaveLength((closed ? 7 : 6) * CURVE_STEPS + 1);
      anchors.forEach((anchor, i) => expect(path[i * CURVE_STEPS]).toEqual(anchor));
      expect(path[path.length - 1]).toEqual(closed ? anchors[0] : anchors[6]);
      expect(fitsAnchors(path, anchors)).toBe(true);
      path.forEach((point, i) => {
        const span = Math.min(Math.floor(i / CURVE_STEPS), (closed ? 7 : 6) - 1);
        expect(distance(point, hermite(anchors, closed, span, i / CURVE_STEPS - span))).toBeLessThan(1e-9);
      });
    }
  });

  it('is the stretched curve for stretched anchors, so a realigned map keeps anchors and points together', () => {
    const random = seeded(9);
    const anchors = Array.from({ length: 6 }, () => ({ x: random() * 400, y: random() * 300 }));
    for (const closed of [false, true]) {
      near(curvedPath(anchors.map(stretch), closed), curvedPath(anchors, closed).map(stretch));
      expect(fitsAnchors(curvedPath(anchors, closed).map(stretch), anchors.map(stretch))).toBe(true);
    }
  });

  it('is a straight line through two anchors, open with fewer than three, and nothing new for one', () => {
    const path = curvedPath([{ x: 0, y: 0 }, { x: 32, y: 16 }], true);
    expect(path).toHaveLength(CURVE_STEPS + 1);
    path.forEach((point, i) => expect(distance(point, { x: 2 * i, y: i })).toBeLessThan(1e-12));
    expect(curvedPath([{ x: 3, y: 4 }], false)).toEqual([{ x: 3, y: 4 }]);
    expect(curvedPath([], true)).toEqual([]);
  });
});

describe('squared', () => {
  it('makes the dragged box a square as long as its longer side, in the pointer\'s quarter', () => {
    expect(squared({ x: 10, y: 10 }, { x: 50, y: 25 })).toEqual({ x: 50, y: 50 });
    expect(squared({ x: 10, y: 10 }, { x: -5, y: 40 })).toEqual({ x: -20, y: 40 });
    expect(squared({ x: 10, y: 10 }, { x: 4, y: -30 })).toEqual({ x: -30, y: -30 });
    expect(squared({ x: 10, y: 10 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
  });
});

describe('stepped15', () => {
  it('keeps level and upright lines exact', () => {
    expect(stepped15({ x: 5, y: 5 }, { x: 105, y: 8 })).toEqual({ x: 105, y: 5 });
    expect(stepped15({ x: 5, y: 5 }, { x: 3, y: -95 })).toEqual({ x: 5, y: -95 });
    expect(stepped15({ x: 5, y: 5 }, { x: -95, y: 2 })).toEqual({ x: -95, y: 5 });
    expect(stepped15({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });

  it('is the point nearest to the pointer among the 24 directions', () => {
    const random = seeded(14);
    const from = { x: 31, y: -12 };
    for (let i = 0; i < 500; i++) {
      const to = { x: from.x + (random() - 0.5) * 600, y: from.y + (random() - 0.5) * 600 };
      let nearest = Infinity;
      for (let step = 0; step < 24; step++) {
        const [cos, sin] = [Math.cos((step * Math.PI) / 12), Math.sin((step * Math.PI) / 12)];
        const along = Math.max(0, (to.x - from.x) * cos + (to.y - from.y) * sin);
        nearest = Math.min(nearest, distance(to, { x: from.x + along * cos, y: from.y + along * sin }));
      }
      const snapped = stepped15(from, to);
      expect(distance(snapped, to)).toBeCloseTo(nearest, 9);
      const turns = Math.atan2(snapped.y - from.y, snapped.x - from.x) / (Math.PI / 12);
      expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9);
    }
  });
});
