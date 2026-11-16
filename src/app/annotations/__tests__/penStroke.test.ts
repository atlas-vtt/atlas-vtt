import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { CURVE_TOLERANCE, STEADY_SLACK, steadied, strokeCurve, THIN_TOLERANCE, thinned } from '../penStroke';
import { distance, distanceToPath, seeded, strays, wandering } from './annotationKit';

/** A hand's path: a smooth curve with sharp turns in it, a point every few pixels, each a little off. */
function handPath(random: () => number, count: number, pace: number, jitter: number): Point[] {
  const points: Point[] = [];
  const [ax, ay, bx, by] = [0.011 + random() * 0.02, 0.013 + random() * 0.02, random() * 6, random() * 6];
  let travelled = 0;
  for (let i = 0; i < count; i++) {
    travelled += pace * (0.4 + 1.2 * random());
    // A zigzag every 400 px: a stroke has corners that must stay corners.
    const fold = Math.abs(((travelled / 400) % 2) - 1) * 300;
    points.push({
      x: travelled * 0.5 + 180 * Math.sin(ax * travelled + bx) + (random() - 0.5) * 2 * jitter,
      y: fold + 140 * Math.cos(ay * travelled + by) + (random() - 0.5) * 2 * jitter,
    });
  }
  return points;
}

function steadiedLine(raw: readonly Point[], slack: number): Point[] {
  const line: Point[] = [];
  let previous: Point | null = null;
  for (const point of raw) {
    previous = steadied(previous, point, slack);
    line.push(previous);
  }
  line.push(raw[raw.length - 1]!);
  return line;
}

describe('steadied', () => {
  it('starts on the pointer, and follows it as it is without a slack', () => {
    expect(steadied(null, { x: 3, y: 4 }, 2)).toEqual({ x: 3, y: 4 });
    expect(steadied({ x: 0, y: 0 }, { x: 30, y: 4 }, 0)).toEqual({ x: 30, y: 4 });
  });

  it('goes half of the way to the pointer on a slow move and stays within the slack on a fast one', () => {
    expect(steadied({ x: 0, y: 0 }, { x: 4, y: 0 }, 3)).toEqual({ x: 2, y: 0 });
    expect(steadied({ x: 0, y: 0 }, { x: 100, y: 0 }, 3)).toEqual({ x: 97, y: 0 });
  });

  it('never trails the pointer by more than the slack, however the pointer moves', () => {
    const random = seeded(11);
    for (const slack of [0.5, 3, 12]) {
      let previous: Point | null = null;
      for (const raw of wandering(random, 2000, 40)) {
        previous = steadied(previous, raw, slack);
        expect(distance(previous, raw)).toBeLessThanOrEqual(slack + 1e-9);
      }
    }
  });

  it('arrives at a pointer that rests', () => {
    let point: Point | null = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) point = steadied(point, { x: 2.5, y: -1 }, 3);
    expect(distance(point!, { x: 2.5, y: -1 })).toBeLessThan(1e-12);
  });

  it('takes jitter out of a slow straight line', () => {
    const random = seeded(4);
    const raw = Array.from({ length: 4000 }, (_, i) => ({ x: i * 0.5, y: (random() - 0.5) * 2 }));
    const line = steadiedLine(raw, 3);
    const spread = (points: readonly Point[]): number => Math.sqrt(points.reduce((sum, point) => sum + point.y * point.y, 0) / points.length);
    // White jitter leaves this average at √(1/3) of its size.
    expect(spread(line) / spread(raw)).toBeLessThan(0.62);
    expect(spread(line) / spread(raw)).toBeGreaterThan(0.5);
  });
});

describe('thinned', () => {
  it('keeps a point the line needs and drops one it does not', () => {
    const bump = [{ x: 0, y: 0 }, { x: 5, y: 0.4 }, { x: 10, y: 0 }];
    expect(thinned(bump, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(thinned(bump, 0.3)).toEqual(bump);
    expect(thinned([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 7, y: 7 }], 0)).toEqual([{ x: 0, y: 0 }, { x: 7, y: 7 }]);
  });

  it('gives new points and leaves a line of one or two as it is', () => {
    const line = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(thinned(line, 5)).toEqual(line);
    expect(thinned(line, 5)[0]).not.toBe(line[0]);
    expect(thinned([], 1)).toEqual([]);
  });

  it('keeps the ends and the order, and every point of the input lies within the tolerance of the result', () => {
    const random = seeded(21);
    for (let round = 0; round < 24; round++) {
      const input = round % 2 ? handPath(random, 400, 3, 0.4) : wandering(random, 300, 12);
      const tolerance = [0.1, 0.5, 2, 9][round % 4]!;
      const result = thinned(input, tolerance);
      expect(result[0]).toEqual(input[0]);
      expect(result[result.length - 1]).toEqual(input[input.length - 1]);
      let at = 0;
      for (const point of result) {
        while (at < input.length && (input[at]!.x !== point.x || input[at]!.y !== point.y)) at++;
        expect(at).toBeLessThan(input.length);
      }
      expect(strays(input, result, 0.25)).toBeLessThanOrEqual(tolerance + 1e-9);
      // And the other way: the result's straight pieces lie that near to what was drawn.
      expect(strays(result, input, 0.25)).toBeLessThanOrEqual(tolerance + 1e-9);
    }
  });

  it('thins a smooth stroke to a small share of its points', () => {
    // A spiral 300 px and more across, a point every 2 px.
    const input = Array.from({ length: 3000 }, (_, i) => ({ x: (300 + i / 10) * Math.cos(i / 150), y: (300 + i / 10) * Math.sin(i / 150) }));
    expect(thinned(input, 0.5).length).toBeLessThan(input.length / 8);
  });

  it('keeps a loop closed and takes the longest stroke a drawing may be', () => {
    const loop = Array.from({ length: 200 }, (_, i) => ({ x: 50 * Math.cos((i / 199) * 2 * Math.PI), y: 50 * Math.sin((i / 199) * 2 * Math.PI) }));
    loop[199] = { ...loop[0]! };
    const result = thinned(loop, 0.5);
    expect(result[result.length - 1]).toEqual(result[0]);
    expect(result.length).toBeGreaterThan(8);
    const long = Array.from({ length: 20_000 }, (_, i) => ({ x: i, y: i % 2 }));
    expect(thinned(long, 0.25)).toHaveLength(20_000);
    expect(thinned(long, 1.5)).toHaveLength(2);
  });
});

describe('strokeCurve', () => {
  it('rounds a corner as far as the tolerance lets it', () => {
    const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const curve = strokeCurve(corner, 0.5);
    expect(curve[0]).toEqual({ x: 0, y: 0 });
    expect(curve[curve.length - 1]).toEqual({ x: 10, y: 10 });
    // A right angle rounded over √2 px on each leg would pass half a pixel from its corner; the
    // six straight pieces it is drawn in take a 36th of that, so it is rounded a little less.
    const reach = Math.SQRT2 / (1 + 1 / 36);
    expect(curve).toHaveLength(9);
    expect(distance(curve[1]!, { x: 10 - reach, y: 0 })).toBeLessThan(1e-9);
    expect(distance(curve[7]!, { x: 10, y: reach })).toBeLessThan(1e-9);
    expect(distance(curve[4]!, corner[1]!)).toBeCloseTo(0.5 / (1 + 1 / 36), 9);
  });

  it('leaves a line without corners, and a line it is given no room to round, as it is', () => {
    const line = [{ x: 0, y: 0 }, { x: 4, y: 3 }];
    expect(strokeCurve(line, 1)).toEqual(line);
    const bent = [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 9, y: 0 }];
    expect(strokeCurve(bent, 0)).toEqual(bent);
    expect(strokeCurve([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }], 1)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }]);
  });

  it('stays within the tolerance of the line through its points, and that line of it', () => {
    const random = seeded(8);
    for (let round = 0; round < 18; round++) {
      const points = round % 2 ? wandering(random, 60, 30) : handPath(random, 120, 6, 1);
      const tolerance = [0.2, 0.5, 3][round % 3]!;
      const curve = strokeCurve(points, tolerance);
      expect(curve[0]).toEqual(points[0]);
      expect(curve[curve.length - 1]).toEqual(points[points.length - 1]);
      expect(strays(curve, points)).toBeLessThanOrEqual(tolerance + 1e-9);
      expect(strays(points, curve)).toBeLessThanOrEqual(tolerance + 1e-9);
    }
  });

  it('is smooth where its points turn gently: no piece turns more than the points did', () => {
    const arc = Array.from({ length: 13 }, (_, i) => ({ x: 200 * Math.cos(i * 0.1), y: 200 * Math.sin(i * 0.1) }));
    const curve = strokeCurve(arc, 0.5);
    expect(curve.length).toBeGreaterThan(arc.length);
    let most = 0;
    for (let i = 2; i < curve.length; i++) {
      const before = Math.atan2(curve[i - 1]!.y - curve[i - 2]!.y, curve[i - 1]!.x - curve[i - 2]!.x);
      const after = Math.atan2(curve[i]!.y - curve[i - 1]!.y, curve[i]!.x - curve[i - 1]!.x);
      most = Math.max(most, Math.abs(after - before));
    }
    // The points turn 0.1 rad at each corner; the curve spreads every turn over two pieces.
    expect(most).toBeLessThan(0.051);
  });

  it('rounds a loop where it closes and keeps it closed', () => {
    const square = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 }];
    const curve = strokeCurve(square, 1);
    expect(curve[curve.length - 1]).toEqual(curve[0]);
    const nearest = Math.min(...curve.map((point) => distance(point, square[0]!)));
    expect(nearest).toBeGreaterThan(0.9);
    expect(nearest).toBeLessThanOrEqual(1);
    expect(strays(curve, square)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('a stroke as it is saved', () => {
  it('lies within a screen pixel of the stroke that was seen while it was drawn', () => {
    const random = seeded(31);
    let worst = 0;
    let saved = 0;
    let drawn = 0;
    for (const zoom of [0.4, 1, 3]) {
      for (let round = 0; round < 3; round++) {
        // Three screen pixels a move, a third of a screen pixel of jitter.
        const raw = handPath(random, 300, 3 / zoom, 0.3 / zoom);
        const live = steadiedLine(raw, STEADY_SLACK / zoom);
        const liveCurve = strokeCurve(live, CURVE_TOLERANCE / zoom);
        const kept = thinned(live, THIN_TOLERANCE / zoom);
        const keptCurve = strokeCurve(kept, CURVE_TOLERANCE / zoom);
        worst = Math.max(worst, strays(keptCurve, liveCurve, 0.2 / zoom) * zoom, strays(liveCurve, keptCurve, 0.2 / zoom) * zoom);
        saved += kept.length;
        drawn += live.length;
        expect(keptCurve[0]).toEqual(liveCurve[0]);
        expect(distanceToPath(raw[raw.length - 1]!, keptCurve)).toBe(0);
      }
    }
    console.log(`pen stroke: saved ${saved} of ${drawn} points, at most ${worst.toFixed(3)} screen px from the stroke drawn`);
    expect(worst).toBeLessThan(1);
  });
});
