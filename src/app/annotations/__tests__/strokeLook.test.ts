import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { inFill, pathLength } from '../lineMath';
import type { FilledPart } from '../quantized';
import { arrowHead, arrowReach, dashes, inkOutline, shaft, strokeOutline } from '../strokeLook';
import { distance, distanceToPath, seeded, wandering } from './annotationKit';

/** How far the ink's outline may lie from the exact one, world pixels: the clipping grid's eighth and the round parts' eighth. */
const OUTLINE_PRECISION = 0.25;

const inPart = (point: Point, part: FilledPart): boolean => inFill(point, part.outline, part.holes);

describe('dashes', () => {
  it('fits whole dashes to a straight line: four widths of ink, two of gap', () => {
    expect(dashes([{ x: 0, y: 0 }, { x: 90, y: 0 }], 10, 'dashed')).toEqual([[{ x: 0, y: 0 }, { x: 30, y: 0 }], [{ x: 60, y: 0 }, { x: 90, y: 0 }]]);
  });

  it('puts dots two widths apart, one on each end', () => {
    expect(dashes([{ x: 0, y: 0 }, { x: 80, y: 0 }], 10, 'dotted')).toEqual([[{ x: 0, y: 0 }], [{ x: 20, y: 0 }], [{ x: 40, y: 0 }], [{ x: 60, y: 0 }], [{ x: 80, y: 0 }]]);
  });

  it('runs a dash on around a corner', () => {
    const pieces = dashes([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 70 }], 10, 'dashed');
    expect(pieces).toEqual([[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }], [{ x: 20, y: 40 }, { x: 20, y: 70 }]]);
  });

  it('has nothing for a line without a width, and a dot for a line without a length', () => {
    expect(dashes([{ x: 0, y: 0 }, { x: 90, y: 0 }], 0, 'dashed')).toEqual([]);
    expect(dashes([], 4, 'dotted')).toEqual([]);
    expect(dashes([{ x: 5, y: 5 }, { x: 5, y: 5 }], 4, 'dashed')).toEqual([[{ x: 5, y: 5 }]]);
  });

  it('cuts any open line into equal dashes with equal gaps, from its first point to its last', () => {
    const random = seeded(3);
    for (let round = 0; round < 30; round++) {
      const points = wandering(random, 2 + Math.floor(random() * 30), 60);
      const width = 1 + random() * 12;
      const pieces = dashes(points, width, 'dashed');
      const total = pathLength(points);
      const count = pieces.length;
      expect(count).toBe(Math.max(1, Math.round((total + 3 * width) / (6 * width))));
      const on = pathLength(pieces[0]!);
      const gap = count > 1 ? (total - count * on) / (count - 1) : 0;
      // A dash is never stretched or squeezed out of shape: within a half of what it is meant to be.
      if (count > 1) expect(on / gap).toBeCloseTo(1, 9);
      expect(pieces[0]![0]).toEqual(points[0]);
      expect(distance(pieces[count - 1]!.at(-1)!, points.at(-1)!)).toBeLessThan(1e-9);
      // Each dash starts a dash and a gap after the one before, measured along the line, and lies on the line.
      let before = 0;
      const lengths = points.map((point, i) => (before += i ? distance(point, points[i - 1]!) : 0));
      const along = (at: number): Point => {
        const i = Math.max(1, lengths.findIndex((length) => length >= at - 1e-9));
        const t = (at - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]!);
        return { x: points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * t, y: points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * t };
      };
      pieces.forEach((piece, i) => {
        expect(pathLength(piece)).toBeCloseTo(on, 9);
        expect(distance(piece[0]!, along(i * (on + gap)))).toBeLessThan(1e-7);
        expect(distance(piece.at(-1)!, along(i * (on + gap) + on))).toBeLessThan(1e-7);
        for (const point of piece) expect(distanceToPath(point, points)).toBeLessThan(1e-9);
      });
    }
  });

  it('leaves no odd gap where a closed line closes', () => {
    const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }];
    const pieces = dashes(square, 7, 'dashed');
    const gaps = pieces.map((piece, i) => {
      const next = pieces[(i + 1) % pieces.length]![0]!;
      const end = piece.at(-1)!;
      // Along the square's outline: both lie on it, less than a side apart.
      return Math.abs(next.x - end.x) + Math.abs(next.y - end.y);
    });
    expect(pieces.length).toBe(Math.round(400 / 42));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 9);
    for (const piece of pieces) expect(pathLength(piece)).toBeCloseTo(gaps[0]!, 9);
    const dots = dashes(square, 7, 'dotted');
    expect(dots).toHaveLength(Math.round(400 / 14));
    expect(distance(dots.at(-1)![0]!, dots[0]![0]!)).toBeCloseTo(distance(dots[0]![0]!, dots[1]![0]!), 9);
  });
});

describe('arrowHead', () => {
  it('is a triangle four widths long and three and a half wide, its tip on the line\'s end', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(arrowHead(line, 5, 'end')).toEqual([{ x: 100, y: 0 }, { x: 80, y: -8.75 }, { x: 80, y: 8.75 }]);
    expect(arrowHead(line, 5, 'start')).toEqual([{ x: 0, y: 0 }, { x: 20, y: 8.75 }, { x: 20, y: -8.75 }]);
    expect(arrowReach(5)).toBe(8.75);
  });

  it('takes no more than half of a short line and keeps its shape', () => {
    const head = arrowHead([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5, 'end')!;
    expect(head).toEqual([{ x: 10, y: 0 }, { x: 5, y: -2.1875 }, { x: 5, y: 2.1875 }]);
  });

  it('points the way a curve arrives over the head\'s own length', () => {
    // A quarter circle of radius 100, a point every degree, that ends at (100, 0).
    const arc = Array.from({ length: 91 }, (_, i) => ({ x: 100 * Math.cos((i * Math.PI) / 180), y: -100 * Math.sin((i * Math.PI) / 180) })).reverse();
    const [tip, left, right] = arrowHead(arc, 5, 'end')!;
    expect(tip).toEqual(arc.at(-1));
    const back = { x: (left!.x + right!.x) / 2 - tip!.x, y: (left!.y + right!.y) / 2 - tip!.y };
    expect(Math.hypot(back.x, back.y)).toBeCloseTo(20, 9);
    // Its base lies towards the point 20 px back along the arc (0.2 rad), not straight behind the tip.
    const neck = { x: 100 * Math.cos(0.2) - 100, y: -100 * Math.sin(0.2) };
    expect(Math.atan2(back.y, back.x)).toBeCloseTo(Math.atan2(neck.y, neck.x), 3);
    expect(Math.abs(back.x)).toBeGreaterThan(1.5);
  });

  it('is nothing for a line without a length or a width', () => {
    expect(arrowHead([{ x: 1, y: 1 }, { x: 1, y: 1 }], 5, 'end')).toBeNull();
    expect(arrowHead([{ x: 1, y: 1 }], 5, 'end')).toBeNull();
    expect(arrowHead([{ x: 0, y: 0 }, { x: 9, y: 0 }], 0, 'end')).toBeNull();
  });
});

describe('shaft', () => {
  it('is the line cut back to where its heads begin', () => {
    const line = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
    expect(shaft(line, 5, 'end')).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }]);
    expect(shaft(line, 5, 'both')).toEqual([{ x: 20, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }]);
    expect(shaft([{ x: 3, y: 3 }], 5, 'end')).toEqual([{ x: 3, y: 3 }]);
  });
});

describe('strokeOutline', () => {
  it('is one area without a hole for a line that crosses itself, and one with a hole for a loop', () => {
    const cross = strokeOutline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }, { x: 50, y: -50 }], 8);
    expect(cross).toHaveLength(1);
    const loop = strokeOutline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }], 8);
    expect(loop).toHaveLength(1);
    expect(loop[0]!.holes).toHaveLength(1);
    expect(inPart({ x: 50, y: 50 }, loop[0]!)).toBe(false);
    expect(inPart({ x: 50, y: 3 }, loop[0]!)).toBe(true);
  });

  it('covers every point within half the width of the line once, and none beyond', () => {
    const random = seeded(17);
    let checked = 0;
    for (let round = 0; round < 12; round++) {
      const points = wandering(random, 3 + Math.floor(random() * 25), 50, { x: 500 - random() * 1000, y: 500 - random() * 1000 });
      const width = 2 + random() * 30;
      const parts = strokeOutline(points, width);
      expect(parts.length).toBeGreaterThan(0);
      for (let i = 0; i < 1500; i++) {
        const on = points[Math.floor(random() * points.length)]!;
        const point = { x: on.x + (random() - 0.5) * 3 * width, y: on.y + (random() - 0.5) * 3 * width };
        const off = distanceToPath(point, points) - width / 2;
        if (Math.abs(off) < OUTLINE_PRECISION) continue;
        checked++;
        expect(parts.filter((part) => inPart(point, part))).toHaveLength(off < 0 ? 1 : 0);
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('costs what one drawing may cost once', () => {
    const random = seeded(6);
    const strokes = Array.from({ length: 100 }, () => wandering(random, 100, 14));
    for (const stroke of strokes) strokeOutline(stroke, 6);
    const start = performance.now();
    let corners = 0;
    for (const stroke of strokes) corners += strokeOutline(stroke, 6).reduce((sum, part) => sum + part.outline.length, 0);
    console.log(`strokeOutline: ${(((performance.now() - start) / strokes.length) * 1000).toFixed(0)} µs for a stroke of 100 points that crosses itself, ${Math.round(corners / strokes.length)} corners in its outline`);
    expect(corners).toBeGreaterThan(0);
  });

  it('is a disc for a dot and nothing for a line without a width or beyond the clipping grid', () => {
    const [dot] = strokeOutline([{ x: 10, y: 10 }], 20);
    for (const corner of dot!.outline) expect(Math.abs(distance(corner, { x: 10, y: 10 }) - 10)).toBeLessThan(OUTLINE_PRECISION);
    expect(strokeOutline([{ x: 0, y: 0 }, { x: 9, y: 0 }], 0)).toEqual([]);
    expect(strokeOutline([], 5)).toEqual([]);
    expect(strokeOutline([{ x: 0, y: 0 }, { x: 3e6, y: 0 }], 5)).toEqual([]);
  });
});

describe('inkOutline', () => {
  it('joins a line\'s dashes, its crossing with another line and its arrowhead into areas that do not overlap', () => {
    const line = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const head = arrowHead(line, 6, 'end')!;
    const parts = inkOutline([shaft(line, 6, 'end'), [{ x: 100, y: -40 }, { x: 100, y: 40 }]], 6, [head]);
    expect(parts).toHaveLength(1);
    // The head's barb, the crossing and the far end of the other line are all in the one area.
    for (const point of [{ x: 178, y: 9 }, { x: 100, y: 0 }, { x: 100, y: 39 }, { x: 198, y: 0 }]) expect(inPart(point, parts[0]!)).toBe(true);
    expect(inPart({ x: 150, y: 9 }, parts[0]!)).toBe(false);
    const dashed = inkOutline(dashes(line, 6, 'dashed'), 6);
    expect(dashed).toHaveLength(dashes(line, 6, 'dashed').length);
  });
});
