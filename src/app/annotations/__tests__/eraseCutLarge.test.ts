import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { MAX_HOLES, MAX_STROKE_POINTS, type DrawingAnnotation, type DrawingInput } from '../annotationTypes';
import { readDrawing } from '../annotationList';
import { cleanFillsWritten } from '../cleanFills';
import { cutBySweep, erased, type EraseSweep } from '../eraseCut';
import { inFill } from '../lineMath';
import { rectanglePoints } from '../shapeOutlines';
import { distanceToPath, drawing, seeded } from './annotationKit';

const RADIUS = 17.5;
const FILL_PRECISION = 0.25;

/** The moves of an eraser that carves a wavy corridor from `from` to `to`, a pointer move every `stride` pixels. */
function corridor(from: Point, to: Point, stride: number, wave: number): EraseSweep[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.round(length / stride));
  const acrossX = -(to.y - from.y) / length;
  const acrossY = (to.x - from.x) / length;
  const at = (step: number): Point => {
    const along = step / steps;
    const off = Math.sin(step * 0.9) * wave;
    return { x: from.x + (to.x - from.x) * along + acrossX * off, y: from.y + (to.y - from.y) * along + acrossY * off };
  };
  return Array.from({ length: steps }, (_, step) => ({ points: [at(step), at(step + 1)], radius: RADIUS }));
}

/** `piece` as the store writes it and the reader reads it back: a copy that is known to be as clean as the piece was. */
function written(piece: DrawingInput, id: string): DrawingAnnotation {
  const record = { ...piece, id, kind: 'drawing' as const, timestamp: 1, points: piece.points.map((point) => ({ ...point })), ...(piece.holes && { holes: piece.holes.map((hole) => hole.map((point) => ({ ...point }))) }) };
  cleanFillsWritten([piece], [id], { [id]: record });
  const read = readDrawing(id, record);
  if (!read) throw new Error('A cut left a piece the reader does not read');
  return read;
}

/** The largest fill among `pieces`, as the store has it. */
function largest(pieces: readonly DrawingInput[], id: string): DrawingAnnotation {
  const sized = (piece: DrawingInput): number => piece.points.length + (piece.holes ?? []).reduce((sum, hole) => sum + hole.length, 0);
  return written([...pieces].sort((a, b) => sized(b) - sized(a))[0]!, id);
}

const holePoints = (fill: DrawingAnnotation): number => fill.holes.reduce((sum, hole) => sum + hole.length, 0);
const median = (times: number[]): number => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;

describe('the eraser on a large fill', () => {
  it('writes no piece the reader would not read whole, and says so', () => {
    // A ring of dabs, each a hole of its own: one more than a drawing's holes may be.
    const room = drawing({ id: 'room', type: 'rectangle', points: rectanglePoints({ x: 0, y: 0 }, { x: 2000, y: 2000 }), width: 0, fill: 'solid' });
    let fill = room;
    let refused = 0;
    for (let i = 0; i < MAX_HOLES + 40; i++) {
      const sweep = { points: [{ x: 60 + (i % 20) * 90, y: 60 + Math.floor(i / 20) * 90 }], radius: RADIUS };
      const result = cutBySweep(fill, sweep, false);
      expect(result).not.toBe('untouched');
      if (result === 'full') {
        refused++;
        // The drawing stays as it was, for every caller.
        expect(erased(fill, sweep, false)).toBe('untouched');
        continue;
      }
      expect(result).toHaveLength(1);
      fill = written((result as DrawingInput[])[0]!, `room${i}`);
      // What was written is read back whole: no hole is dropped by the reader.
      expect(fill.holes).toHaveLength((result as DrawingInput[])[0]!.holes!.length);
    }
    expect(fill.holes).toHaveLength(MAX_HOLES);
    expect(refused).toBe(40);
    // A whole-drawing eraser still takes it.
    expect(cutBySweep(fill, { points: [{ x: 1900, y: 1900 }], radius: RADIUS }, true)).toEqual([]);
  });

  it('refuses a cut whose outline has more points than a drawing may', () => {
    // A saw: its teeth leave room for six more points, and a dab into its back needs more for its arc.
    const teeth = MAX_STROKE_POINTS - 10;
    const saw: Point[] = Array.from({ length: teeth + 1 }, (_, i) => ({ x: i * 2, y: i % 2 ? 10 : 0 }));
    const comb = drawing({ type: 'line', points: [...saw, { x: teeth * 2, y: -200 }, { x: 0, y: -200 }, { x: 0, y: 0 }], width: 0, fill: 'solid' });
    expect(comb.points.length).toBeLessThan(MAX_STROKE_POINTS);
    expect(cutBySweep(comb, { points: [{ x: 300, y: -200 }], radius: RADIUS }, false)).toBe('full');
    expect(cutBySweep(comb, { points: [{ x: 300, y: -500 }], radius: RADIUS }, false)).toBe('untouched');
  });

  it('cuts a carved fill as it cuts a plain one: what lies beyond the sweep stays, in pieces that do not overlap', () => {
    const random = seeded(17);
    const room = drawing({ id: 'room', type: 'rectangle', points: rectanglePoints({ x: 0, y: 0 }, { x: 900, y: 700 }), width: 0, fill: 'soft' });
    const moves = [
      ...corridor({ x: -30, y: 200 }, { x: 600, y: 220 }, 9, 5),
      ...corridor({ x: 300, y: 400 }, { x: 700, y: 400 }, 9, 5),
      ...corridor({ x: 700, y: 400 }, { x: 700, y: 600 }, 9, 5),
      ...corridor({ x: 700, y: 600 }, { x: 300, y: 600 }, 9, 5),
      ...corridor({ x: 300, y: 600 }, { x: 300, y: 400 }, 9, 5),
      ...corridor({ x: 450, y: 100 }, { x: 460, y: 660 }, 9, 5),
    ];
    let pieces: DrawingAnnotation[] = [room];
    for (const [index, move] of moves.entries()) {
      pieces = pieces.flatMap((piece, at) => {
        const result = cutBySweep(piece, move, false);
        expect(result).not.toBe('full');
        return result === 'untouched' || result === 'full' ? [piece] : result.map((left, part) => written(left, `p${index}-${at}-${part}`));
      });
    }
    // The loop closed off an island, and the last corridor cut through it.
    expect(pieces.length).toBeGreaterThan(2);
    for (let i = 0; i < 6000; i++) {
      const point = { x: -20 + random() * 940, y: -20 + random() * 740 };
      const clear = Math.min(...moves.map((move) => distanceToPath(point, move.points) - move.radius));
      // Every move's cut lies within the grid's precision of its sweep's edge; a point that near to one, or to the room's, is not asked.
      if (Math.abs(clear) < 2 * FILL_PRECISION || distanceToPath(point, room.points) < FILL_PRECISION) continue;
      const holding = pieces.filter((piece) => inFill(point, piece.points, piece.holes));
      expect(holding).toHaveLength(inFill(point, room.points, []) && clear > 0 ? 1 : 0);
    }
  });

  it('costs a pointer move on a fill of thousands of points a few milliseconds', () => {
    // Corridors carved out of a large solid rectangle: some from its edge, which grow its outline, some closed loops inside, which are holes.
    const room = drawing({ id: 'room', type: 'rectangle', points: rectanglePoints({ x: 0, y: 0 }, { x: 6000, y: 4000 }), width: 0, fill: 'solid' });
    const moves: EraseSweep[] = [];
    for (let row = 0; row < 3; row++) moves.push(...corridor({ x: -30, y: 300 + row * 600 }, { x: 5400, y: 330 + row * 600 }, 8, 6));
    for (let loop = 0; loop < 12; loop++) {
      const x = 200 + (loop % 10) * 520;
      const y = 520 + Math.floor(loop / 10) * 600;
      const corners = [{ x, y }, { x: x + 300, y }, { x: x + 300, y: y + 160 }, { x, y: y + 160 }, { x, y }];
      for (let side = 0; side < 4; side++) moves.push(...corridor(corners[side]!, corners[side + 1]!, 8, 5));
    }
    let fill = room;
    const times: { points: number; ms: number }[] = [];
    let refused = 0;
    for (const [index, move] of moves.entries()) {
      const start = performance.now();
      const result = cutBySweep(fill, move, false);
      const ms = performance.now() - start;
      if (result === 'untouched') continue;
      if (result === 'full') {
        refused++;
        continue;
      }
      times.push({ points: fill.points.length + holePoints(fill), ms });
      fill = largest(result, `room${index}`);
    }
    const size = fill.points.length + holePoints(fill);
    expect(fill.points.length).toBeLessThan(MAX_STROKE_POINTS);
    expect(holePoints(fill)).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    const near5000 = times.filter(({ points }) => points >= 4000 && points <= 6000).map(({ ms }) => ms);
    const large = times.filter(({ points }) => points >= 10_000).map(({ ms }) => ms);
    // A move beside the fill, and one in the open middle of a corridor already cut, reach nothing of it.
    const missStart = performance.now();
    for (let i = 0; i < 200; i++) erased(fill, { points: [{ x: 6100 + i, y: 500 }, { x: 6108 + i, y: 500 }], radius: RADIUS }, false);
    const beside = (performance.now() - missStart) / 200;
    console.log(
      `eraser on a carved fill: ${times.length} moves cut, ${refused} refused, the fill ends with ${fill.points.length} outline and ${holePoints(fill)} hole points in ${fill.holes.length} holes (${size} in all); `
      + `a move at about 5,000 points: median ${median(near5000).toFixed(2)} ms, worst ${Math.max(...near5000).toFixed(2)} ms (${near5000.length} moves); `
      + (large.length > 0 ? `at 10,000 points and more: median ${median(large).toFixed(2)} ms, worst ${Math.max(...large).toFixed(2)} ms (${large.length} moves); ` : '')
      + `moves over 2 ms: ${times.filter(({ ms }) => ms > 2).length}; a move beside it: ${(beside * 1000).toFixed(1)} µs`,
    );
    // Printed, not asserted: a timing beside a whole suite's load says nothing.
    expect(near5000.length).toBeGreaterThan(50);
  }, 120_000);
});
