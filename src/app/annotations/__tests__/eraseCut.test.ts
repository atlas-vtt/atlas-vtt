import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import type { DrawingAnnotation, DrawingInput } from '../annotationTypes';
import { erased, type EraseSweep } from '../eraseCut';
import { inFill, pathLength } from '../lineMath';
import { curvedPath, ellipsePoints, rectanglePoints } from '../shapeOutlines';
import { outsideSweep } from '../sweepCut';
import { distance, distanceToPath, drawing, sampled, seeded, wandering } from './annotationKit';

/** How near a line's cut lies to the sweep's edge, world pixels: worked out in plain numbers, off only by their rounding. */
const LINE_PRECISION = 1e-6;
/** How near a fill's cut lies to the sweep's edge, world pixels: the clipping grid's eighth and its round parts' eighth. */
const FILL_PRECISION = 0.25;

const pieces = (result: DrawingInput[] | 'untouched'): DrawingInput[] => {
  if (result === 'untouched') throw new Error('The sweep was meant to touch the drawing');
  return result;
};
const dab = (x: number, y: number, radius: number): EraseSweep => ({ points: [{ x, y }], radius });
const lines = (result: DrawingInput[]): DrawingInput[] => result.filter((piece) => piece.width > 0);
const fills = (result: DrawingInput[]): DrawingInput[] => result.filter((piece) => piece.fill !== undefined);

describe('outsideSweep', () => {
  it('cuts a line where the sweep\'s edge crosses it, between its points', () => {
    // A dab 6 px beside the line that reaches 10 px takes 8 px of it to either side.
    const cut = outsideSweep([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: 6 }], 10)!;
    expect(cut.map((piece) => [piece.fromStart, piece.toEnd])).toEqual([[true, false], [false, true]]);
    expect(cut[0]!.points[0]).toEqual({ x: 0, y: 0 });
    expect(cut[1]!.points[1]).toEqual({ x: 100, y: 0 });
    expect(distance(cut[0]!.points[1]!, { x: 42, y: 0 })).toBeLessThan(1e-12);
    expect(distance(cut[1]!.points[0]!, { x: 58, y: 0 })).toBeLessThan(1e-12);
    expect(outsideSweep([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: 0 }], 10)!.map((piece) => piece.points)).toEqual([[{ x: 0, y: 0 }, { x: 40, y: 0 }], [{ x: 60, y: 0 }, { x: 100, y: 0 }]]);
  });

  it('says nothing was taken of a line the sweep does not reach, and gives no piece of one it covers', () => {
    expect(outsideSweep([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: 10.001 }], 10)).toBeNull();
    expect(outsideSweep([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: -5, y: 3 }, { x: 105, y: -3 }], 10)).toEqual([]);
    expect(outsideSweep([{ x: 4, y: 4 }], [{ x: 0, y: 0 }, { x: 9, y: 0 }], 4)).toEqual([]);
    expect(outsideSweep([{ x: 4, y: 4.01 }], [{ x: 0, y: 0 }, { x: 9, y: 0 }], 4)).toBeNull();
    expect(outsideSweep([], [{ x: 0, y: 0 }], 4)).toBeNull();
  });

  it('keeps the piece through a loop\'s closing point whole', () => {
    const square = rectanglePoints({ x: 0, y: 0 }, { x: 100, y: 100 });
    const cut = outsideSweep(square, [{ x: 100, y: 50 }], 10, true)!;
    expect(cut).toEqual([{ points: [{ x: 100, y: 60 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }], fromStart: false, toEnd: false }]);
  });

  it('leaves exactly the parts of any line that lie beyond the reach of any sweep', () => {
    const random = seeded(41);
    let cuts = 0;
    for (let round = 0; round < 60; round++) {
      const line = wandering(random, 2 + Math.floor(random() * 40), 30);
      const middle = line[Math.floor(line.length / 2)]!;
      const sweep = wandering(random, 1 + Math.floor(random() * 12), 45, { x: middle.x + (random() - 0.5) * 60, y: middle.y + (random() - 0.5) * 60 });
      // A sweep that stands still for a move, as a held pointer does.
      if (sweep.length > 3) sweep.splice(2, 0, { ...sweep[1]! });
      const reach = 2 + random() * 25;
      const cut = outsideSweep(line, sweep, reach);
      const beyond = (point: Point): number => distanceToPath(point, sweep) - reach;
      const samples = sampled(line, 0.2);
      if (!cut) {
        for (const point of samples) expect(beyond(point)).toBeGreaterThan(-LINE_PRECISION);
        continue;
      }
      cuts++;
      let kept = 0;
      for (const point of samples) {
        const off = beyond(point);
        if (Math.abs(off) < LINE_PRECISION) continue;
        const onPiece = cut.some((piece) => distanceToPath(point, piece.points) < 1e-9);
        expect(onPiece).toBe(off > 0);
        if (off > 0) kept++;
      }
      // The pieces are the line itself, cut on the sweep's edge: as long together as what lies beyond.
      expect(cut.reduce((sum, piece) => sum + pathLength(piece.points), 0)).toBeCloseTo((kept / samples.length) * pathLength(line), -1);
      cut.forEach((piece, i) => {
        if (!piece.fromStart) expect(Math.abs(beyond(piece.points[0]!))).toBeLessThan(LINE_PRECISION);
        if (!piece.toEnd) expect(Math.abs(beyond(piece.points.at(-1)!))).toBeLessThan(LINE_PRECISION);
        expect(piece.fromStart).toBe(i === 0 && distance(piece.points[0]!, line[0]!) === 0 && beyond(line[0]!) > 0);
        expect(piece.toEnd).toBe(i === cut.length - 1 && distance(piece.points.at(-1)!, line.at(-1)!) === 0 && beyond(line.at(-1)!) > 0);
      });
    }
    expect(cuts).toBeGreaterThan(40);
  });
});

describe('erased', () => {
  it('cuts a stroke where its ink meets the sweep and keeps every field on both pieces', () => {
    const stroke = drawing({ id: 'stroke', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 2, color: '#3366ff', opacity: 0.5, dash: 'dashed', hidden: true, layer: 'map', order: 7, by: 'ana', level: 'cellar', future: { kept: true } });
    // The sweep reaches 9 px; the line's own edge lies 1 px from its middle.
    const result = pieces(erased(stroke, dab(50, 0, 9), false));
    const common = { type: 'pen', width: 2, color: '#3366ff', opacity: 0.5, dash: 'dashed', hidden: true, layer: 'map', order: 7, by: 'ana', level: 'cellar', future: { kept: true }, group: 'stroke' };
    expect(result).toEqual([{ ...common, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }, { ...common, points: [{ x: 60, y: 0 }, { x: 100, y: 0 }] }]);
  });

  it('leaves a drawing the sweep does not reach untouched', () => {
    const stroke = drawing({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 2 });
    expect(erased(stroke, dab(50, 10.01, 9), false)).toBe('untouched');
    expect(erased(stroke, dab(50, 10.01, 9), true)).toBe('untouched');
    expect(erased(stroke, { points: [], radius: 9 }, false)).toBe('untouched');
    expect(erased(stroke, dab(50, 0, 0), false)).toBe('untouched');
  });

  it('gives one piece no group, keeps a group the drawing has, and removes a touched drawing whole when asked', () => {
    const stroke = drawing({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 2 });
    const [rest, ...more] = pieces(erased(stroke, dab(100, 0, 9), false));
    expect(more).toEqual([]);
    expect(rest).toEqual({ type: 'pen', color: '#ffffff', width: 2, opacity: 1, points: [{ x: 0, y: 0 }, { x: 90, y: 0 }] });
    const grouped = drawing({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 2, group: 'sketch' });
    expect(pieces(erased(grouped, dab(50, 0, 9), false)).map((piece) => piece.group)).toEqual(['sketch', 'sketch']);
    expect(pieces(erased(grouped, dab(100, 0, 9), false)).map((piece) => piece.group)).toEqual(['sketch']);
    expect(erased(stroke, dab(100, 0, 9), true)).toEqual([]);
    expect(erased(stroke, { points: [{ x: -20, y: 0 }, { x: 120, y: 0 }], radius: 3 }, false)).toEqual([]);
    expect(erased(drawing({ points: [{ x: 5, y: 5 }], width: 6 }), dab(5, 14, 6), false)).toEqual([]);
  });

  it('leaves no ink of any stroke inside any sweep, and all of it outside', () => {
    const random = seeded(77);
    for (let round = 0; round < 30; round++) {
      const stroke = drawing({ points: wandering(random, 30, 25), width: 1 + random() * 14 });
      const start = stroke.points[10 + Math.floor(random() * 10)]!;
      const sweep = { points: wandering(random, 2 + Math.floor(random() * 6), 40, { x: start.x + 15, y: start.y - 10 }), radius: 4 + random() * 20 };
      const result = erased(stroke, sweep, false);
      const clear = (point: Point): number => distanceToPath(point, sweep.points) - sweep.radius - stroke.width / 2;
      for (const point of sampled(stroke.points, 0.25)) {
        if (Math.abs(clear(point)) < LINE_PRECISION) continue;
        const kept = result === 'untouched' || result.some((piece) => distanceToPath(point, piece.points) < 1e-9);
        expect(kept).toBe(clear(point) > 0);
      }
    }
  });

  it('keeps an arrow\'s heads on the ends that are left, the start\'s on a piece turned round', () => {
    const line = { type: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 2 };
    const one = pieces(erased(drawing({ ...line, ends: 'end' }), dab(50, 0, 9), false));
    expect(one.map((piece) => [piece.points, piece.ends])).toEqual([[[{ x: 0, y: 0 }, { x: 40, y: 0 }], undefined], [[{ x: 60, y: 0 }, { x: 100, y: 0 }], 'end']]);
    const both = pieces(erased(drawing({ ...line, ends: 'both' }), { points: [{ x: 30, y: 0 }, { x: 30, y: 0 }], radius: 4 }, false));
    expect(both.map((piece) => [piece.points, piece.ends])).toEqual([[[{ x: 25, y: 0 }, { x: 0, y: 0 }], 'end'], [[{ x: 35, y: 0 }, { x: 100, y: 0 }], 'end']]);
    const middle = pieces(erased(drawing({ ...line, ends: 'both' }), { points: [{ x: -5, y: 0 }, { x: 20, y: 0 }], radius: 4 }, false));
    expect(middle.map((piece) => [piece.points, piece.ends])).toEqual([[[{ x: 25, y: 0 }, { x: 100, y: 0 }], 'end']]);
  });

  it('makes free lines of a cut shape: no shape, no anchors', () => {
    const anchors = [{ x: 0, y: 0 }, { x: 60, y: 40 }, { x: 120, y: 0 }];
    const curve = drawing({ type: 'line', points: curvedPath(anchors, false), anchors, width: 2 });
    expect(curve.anchors).toEqual(anchors);
    const cut = pieces(erased(curve, dab(60, 40, 6), false));
    expect(cut).toHaveLength(2);
    for (const piece of cut) expect([piece.type, piece.anchors]).toEqual(['line', undefined]);
    const ring = drawing({ type: 'circle', points: ellipsePoints({ x: 0, y: 0 }, { x: 100, y: 60 }), width: 2 });
    expect(ring.shape).toBe('ellipse');
    // Cut at its top, away from the point it closes at: the one piece runs on through that point.
    const [arc, ...rest] = pieces(erased(ring, dab(50, 0, 6), false));
    expect(rest).toEqual([]);
    expect([arc!.type, arc!.group]).toEqual(['line', undefined]);
    expect(arc!.points.slice(1, -1)).toContainEqual({ x: 100, y: 30 });
    expect(distanceToPath({ x: 50, y: 0 }, arc!.points)).toBeCloseTo(7, 9);
    expect(distance(arc!.points[0]!, { x: 50, y: 0 })).toBeCloseTo(7, 9);
    expect(distance(arc!.points.at(-1)!, { x: 50, y: 0 })).toBeCloseTo(7, 9);
  });

  it('dabs a hole into a filled room and leaves its outline whole beside it', () => {
    const room = drawing({ id: 'room', type: 'rectangle', points: rectanglePoints({ x: 0, y: 0 }, { x: 100, y: 100 }), width: 4, fill: 'soft', dash: 'dotted' });
    const result = pieces(erased(room, dab(50, 50, 10), false));
    expect(result).toHaveLength(2);
    const [outline, floor] = result as [DrawingInput, DrawingInput];
    expect(outline).toEqual({ type: 'line', points: room.points, width: 4, color: '#ffffff', opacity: 1, dash: 'dotted', group: 'room' });
    expect([floor.type, floor.width, floor.fill, floor.dash, floor.group]).toEqual(['line', 0, 'soft', undefined, 'room']);
    expect(floor.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]);
    expect(floor.holes).toHaveLength(1);
    for (const corner of floor.holes![0]!) expect(Math.abs(distance(corner, { x: 50, y: 50 }) - 10)).toBeLessThan(FILL_PRECISION);
    // Both pieces are drawings the reader takes, and a second dab cuts the first one's hole wider.
    const read = drawing({ ...floor, id: 'floor' });
    expect([read.shape, read.closed, read.fill, read.holes.length]).toEqual(['line', true, 'soft', 1]);
    const again = pieces(erased(read, dab(62, 50, 10), false));
    expect(again).toHaveLength(1);
    expect(again[0]!.holes).toHaveLength(1);
    expect(again[0]!.group).toBe('room');
    expect(erased(read, dab(50, 50, 3), false)).toBe('untouched');
  });

  it('cuts a doorway through a room\'s wall and floor', () => {
    const room = drawing({ id: 'room', type: 'rectangle', points: rectanglePoints({ x: 0, y: 0 }, { x: 100, y: 100 }), width: 4, fill: 'solid' });
    const result = pieces(erased(room, { points: [{ x: 100, y: 50 }, { x: 80, y: 50 }], radius: 8 }, false));
    const [wall, ...moreWalls] = lines(result);
    const [floor, ...moreFloors] = fills(result);
    expect([moreWalls, moreFloors]).toEqual([[], []]);
    expect(wall!.points).toEqual([{ x: 100, y: 60 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }]);
    expect([wall!.fill, floor!.holes, floor!.group]).toEqual([undefined, undefined, 'room']);
    expect(inFill({ x: 85, y: 50 }, floor!.points, [])).toBe(false);
    expect(inFill({ x: 65, y: 50 }, floor!.points, [])).toBe(true);
    expect(inFill({ x: 95, y: 65 }, floor!.points, [])).toBe(true);
  });

  it('leaves of any fill exactly what lies beyond the sweep, in pieces that do not overlap', () => {
    const random = seeded(93);
    let split = 0;
    for (let round = 0; round < 14; round++) {
      const corner = { x: random() * 400 - 200, y: random() * 400 - 200 };
      const far = { x: corner.x + 120 + random() * 100, y: corner.y + 90 + random() * 100 };
      const hole = [{ x: corner.x + 20, y: corner.y + 20 }, { x: corner.x + 50, y: corner.y + 25 }, { x: corner.x + 30, y: corner.y + 55 }];
      const shape = round % 2 ? drawing({ type: 'circle', points: ellipsePoints(corner, far), width: 0, fill: 'solid', holes: [hole] }) : drawing({ type: 'rectangle', points: rectanglePoints(corner, far, 20), width: 0, fill: 'soft', holes: [hole] });
      const sweep = { points: wandering(random, 2 + Math.floor(random() * 5), 110, { x: corner.x - 10, y: corner.y + 60 }), radius: 5 + random() * 15 };
      const result = erased(shape, sweep, false);
      if (result === 'untouched') continue;
      if (result.length > 1) split++;
      for (const piece of result) expect([piece.width, piece.type, piece.points.at(-1)]).toEqual([0, 'line', piece.points[0]]);
      if (result.length > 1) expect(new Set(result.map((piece) => piece.group))).toEqual(new Set([shape.id]));
      for (let i = 0; i < 1200; i++) {
        const point = { x: corner.x - 30 + random() * (far.x - corner.x + 60), y: corner.y - 30 + random() * (far.y - corner.y + 60) };
        const edges = [shape.points, [...hole, hole[0]!]];
        const clear = distanceToPath(point, sweep.points) - sweep.radius;
        if (Math.abs(clear) < FILL_PRECISION || edges.some((edge) => distanceToPath(point, edge) < FILL_PRECISION)) continue;
        const holding = result.filter((piece) => inFill(point, piece.points, piece.holes ?? []));
        expect(holding).toHaveLength(inFill(point, shape.points, [hole]) && clear > 0 ? 1 : 0);
      }
    }
    expect(split).toBeGreaterThan(2);
  });

  it('leaves a sweep in a fill\'s hole, clear of its edge, untouched', () => {
    const hole = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }];
    const room = drawing({ type: 'rectangle', points: rectanglePoints({ x: 0, y: 0 }, { x: 100, y: 100 }), width: 0, fill: 'soft', holes: [hole] });
    expect(erased(room, dab(50, 50, 10), false)).toBe('untouched');
    expect(pieces(erased(room, dab(72, 50, 10), false))).toHaveLength(1);
    expect(erased(room, dab(72, 50, 10), true)).toEqual([]);
  });

  it('takes a stamp whole when the sweep reaches its turned box', () => {
    const stamp = drawing({ type: 'icon', icon: 'skull', points: [{ x: 100, y: 100 }], width: 40, rotation: 45 });
    // Within the box that is not turned, 6.9 px from the one that is.
    expect(erased(stamp, dab(119, 119, 6), false)).toBe('untouched');
    expect(erased(stamp, dab(119, 119, 7), false)).toEqual([]);
    expect(erased(stamp, { points: [{ x: 60, y: 60 }, { x: 140, y: 140 }], radius: 1 }, false)).toEqual([]);
    expect(erased(stamp, { points: [{ x: 60, y: 135 }, { x: 60, y: 200 }], radius: 5 }, false)).toBe('untouched');
  });

  it('costs little per drawing and move', () => {
    const random = seeded(8);
    const strokes = Array.from({ length: 200 }, () => drawing({ points: wandering(random, 100, 14), width: 6 }));
    const room = drawing({ type: 'rectangle', points: rectanglePoints({ x: 0, y: 0 }, { x: 400, y: 300 }), width: 4, fill: 'soft' });
    const move = (at: Point): EraseSweep => ({ points: [{ x: at.x - 6, y: at.y - 4 }, { x: at.x + 6, y: at.y + 4 }], radius: 17 });
    for (const stroke of strokes) erased(stroke, move(stroke.points[20]!), false);
    let start = performance.now();
    let cut = 0;
    for (const stroke of strokes) {
      if (erased(stroke, move(stroke.points[50]!), false) !== 'untouched') cut++;
    }
    const perStroke = (performance.now() - start) / strokes.length;
    start = performance.now();
    for (let i = 0; i < 200; i++) erased(room, { points: [{ x: 50 + i, y: 100 }, { x: 56 + i, y: 104 }], radius: 17 }, false);
    const perFill = (performance.now() - start) / 200;
    expect(cut).toBe(strokes.length);
    console.log(`erased: ${(perStroke * 1000).toFixed(1)} µs for a move over a stroke of 100 points, ${(perFill * 1000).toFixed(1)} µs for a move over a filled room`);
  });

  it('keeps a fill beyond the clipping grid whole while its line is cut', () => {
    const far = drawing({ id: 'far', type: 'rectangle', points: rectanglePoints({ x: 3e6, y: 0 }, { x: 3e6 + 100, y: 100 }), width: 4, fill: 'soft' });
    const result = pieces(erased(far, dab(3e6 + 100, 50, 8), false));
    expect(lines(result)).toHaveLength(1);
    expect(fills(result).map((piece) => piece.points)).toEqual([far.points]);
  });
});
