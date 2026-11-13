import { describe, expect, it } from 'vitest';
import type { LiveDrawing } from '../../../../src/app/annotations/madeDrawing';
import { ellipsePoints, rectanglePoints } from '../../../../src/app/annotations/shapeOutlines';
import { fogCoverage } from '../../../../src/app/fog/fogCoverage';
import { STROKE_KEPT_MS } from '../../../../src/app/online/gm/gmStrokes.ts';
import { MARKS_INTERVAL_MS, MAX_STROKE_DRAWINGS, MAX_STROKE_NUMBERS, parseGmMessage, type SharedStroke } from '../../../../src/app/online/protocol/index.ts';
import { markHarness, type MarkHarness } from './markHarness.ts';

const P = (x: number, y: number): { x: number; y: number } => ({ x, y });
const pen = (points: { x: number; y: number }[], more: Partial<LiveDrawing> = {}): LiveDrawing => ({ type: 'pen', points, color: '#e93147', width: 4, opacity: 1, ...more });
const strokesOf = (table: MarkHarness): (SharedStroke | undefined)[] => table.sent.map(({ body }) => body.strokes?.[0]);
const last = (table: MarkHarness): SharedStroke | undefined => table.sent.at(-1)?.body.strokes?.[0];

/** A table with a scene shared, a send interval after its first look at the GM's marks: what moves next is told at once. */
function started(): MarkHarness {
  const table = markHarness();
  table.share.setScene('s');
  table.advance(MARKS_INTERVAL_MS);
  return table;
}

describe('the drawing the GM is making, as players are told it', () => {
  it('tells a pen\'s stroke as it grows: the points since the message before the last, their places to a hundredth, and the time they took', () => {
    const table = started();
    const points = [P(0.123456, 0), P(1, 0)];
    table.stroke.begin();
    table.stroke.show([pen(points)], true);
    expect(last(table)).toEqual({ who: 'gm', n: 1, drawings: [{ type: 'pen', points: [0.12, 0, 1, 0], colour: '#e93147', width: 4, opacity: 1 }], from: 0 });
    for (let step = 2; step <= 5; step += 1) {
      table.advance(MARKS_INTERVAL_MS);
      points.push(P(step, 0), P(step + 0.5, 0));
      table.stroke.show([pen(points)], true);
    }
    const told = strokesOf(table).slice(1);
    // Each message tells the points of two: one that never arrives leaves no gap.
    expect(told.map((stroke) => stroke?.from)).toEqual([0, 2, 4, 6]);
    expect(told.map((stroke) => stroke?.drawings[0]?.points.length)).toEqual([8, 8, 8, 8]);
    expect(told.map((stroke) => stroke?.span)).toEqual([100, 100, 100, 100]);
    expect(new Set(told.map((stroke) => stroke?.n))).toEqual(new Set([1]));
    expect(table.live.every((key) => key === 'marks')).toBe(true);
    for (const { body } of table.sent) expect(parseGmMessage(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });

  it('says nothing new while the pen rests, and no more than a message may carry of a stroke that came far at once', () => {
    const table = started();
    const points = Array.from({ length: 3000 }, (_, index) => P(index, 0));
    table.stroke.begin();
    table.stroke.show([pen(points)], true);
    expect(last(table)?.from).toBe(3000 - MAX_STROKE_NUMBERS / 2);
    expect(last(table)?.drawings[0]?.points).toHaveLength(MAX_STROKE_NUMBERS);
    table.advance(MARKS_INTERVAL_MS);
    table.share.update();
    table.advance(MARKS_INTERVAL_MS);
    table.share.update();
    const count = table.sent.length;
    expect(last(table)).toMatchObject({ from: 2999, drawings: [{ points: [2999, 0] }] });
    table.advance(MARKS_INTERVAL_MS * 5);
    table.share.update();
    expect(table.sent).toHaveLength(count);
  });

  it('tells a shape whole each time, as a finished one is told, and the areas of cells being filled', () => {
    const table = started();
    table.stroke.begin();
    table.stroke.show([{ type: 'rectangle', points: rectanglePoints(P(0, 0), P(70.004, 35)), color: '#086ddd', width: 6, opacity: 0.5, fill: 'soft', dash: 'dashed' }], false);
    expect(last(table)).toEqual({ who: 'gm', n: 1, drawings: [{ type: 'pen', points: [0, 0, 70, 0, 70, 35, 0, 35, 0, 0], colour: '#086ddd', width: 6, opacity: 0.5, shape: 'rectangle', fill: 'soft', dash: 'dashed' }] });
    table.advance(MARKS_INTERVAL_MS);
    table.stroke.begin();
    table.stroke.show([{ type: 'circle', points: ellipsePoints(P(0, 0), P(100, 50)), color: '#086ddd', width: 6, opacity: 1 }], false);
    expect(last(table)).toMatchObject({ n: 2, drawings: [{ shape: 'ellipse' }] });
    expect(last(table)?.drawings[0]?.points).toHaveLength(130);
    table.advance(MARKS_INTERVAL_MS);
    const cell = (x: number): LiveDrawing => ({ type: 'line', points: [P(x, 0), P(x + 70, 0), P(x + 70, 70), P(x, 70), P(x, 0)], color: '#e0ac00', width: 0, opacity: 0.4, fill: 'solid', holes: [[P(x + 10, 10), P(x + 20, 10), P(x + 20, 20)]] });
    table.stroke.begin();
    table.stroke.show([cell(0), cell(200)], false);
    expect(last(table)).toMatchObject({ n: 3, drawings: [{ width: 0, fill: 'solid', holes: [[10, 10, 20, 10, 20, 20]] }, { points: [200, 0, 270, 0, 270, 70, 200, 70, 200, 0] }] });
    expect(last(table)).not.toHaveProperty('from');
  });

  it('says that a drawing was made, for a while, and names a dropped one no more', () => {
    const table = started();
    table.stroke.begin();
    table.stroke.show([pen([P(0, 0), P(5, 5)])], true);
    table.advance(MARKS_INTERVAL_MS);
    table.stroke.made();
    expect(last(table)).toEqual({ who: 'gm', n: 1, drawings: [], kept: true });
    // Something else moves long after: the word is not said again.
    table.advance(STROKE_KEPT_MS);
    table.laser.at = [5, 5];
    table.laser.changed();
    expect(table.sent.at(-1)?.body.strokes).toBeUndefined();

    table.advance(MARKS_INTERVAL_MS);
    table.stroke.begin();
    table.stroke.show([pen([P(0, 0), P(9, 9)])], true);
    expect(last(table)?.n).toBe(2);
    table.advance(MARKS_INTERVAL_MS);
    table.stroke.drop();
    expect(table.sent.at(-1)?.body.strokes).toBeUndefined();
  });

  it('tells nothing of a drawing players will not see above the tokens: one kept from them, one on the map, one fog covers, one whose fog cannot be read', () => {
    const table = started();
    table.fog = fogCoverage({ cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 1000, y: 1000, width: 500, height: 500 } });
    const kept = [
      pen([P(0, 0), P(5, 5)], { color: '#111111', hidden: true }),
      pen([P(0, 0), P(5, 5)], { color: '#222222', layer: 'map' }),
      pen([P(1100, 1100), P(1200, 1200)], { color: '#333333' }),
    ];
    for (const drawing of kept) {
      table.stroke.begin();
      table.stroke.show([drawing], true);
      table.advance(MARKS_INTERVAL_MS);
      table.stroke.made();
      table.advance(MARKS_INTERVAL_MS);
    }
    table.fog = null;
    table.stroke.begin();
    table.stroke.show([pen([P(0, 0), P(5, 5)], { color: '#444444' })], true);
    table.advance(MARKS_INTERVAL_MS);
    expect(table.sent).toEqual([]);
    // Half of the cells are kept from the players: none of them is told.
    table.fog = { shape: [], covers: () => false };
    table.stroke.begin();
    table.stroke.show([pen([P(0, 0), P(5, 5)], { type: 'line' }), pen([P(0, 0), P(5, 5)], { type: 'line', hidden: true })], false);
    table.advance(MARKS_INTERVAL_MS);
    expect(table.sent).toEqual([]);
  });

  it('tells a stroke that leaves the fog from there on, and nothing of one with more to it than a message may carry', () => {
    const table = started();
    table.fog = fogCoverage({ cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 1000, y: 1000, width: 500, height: 500 } });
    const points = [P(1100, 1100), P(1200, 1200)];
    table.stroke.begin();
    table.stroke.show([pen(points)], true);
    table.advance(MARKS_INTERVAL_MS);
    expect(table.sent).toEqual([]);
    points.push(P(900, 900));
    table.stroke.show([pen(points)], true);
    expect(last(table)?.drawings[0]?.points).toEqual([1100, 1100, 1200, 1200, 900, 900]);

    const wide = started();
    const corners = Array.from({ length: MAX_STROKE_NUMBERS / 2 + 1 }, (_, index) => P(index, index % 7));
    wide.stroke.begin();
    wide.stroke.show([{ type: 'line', points: corners, color: '#ffffff', width: 4, opacity: 1 }], false);
    wide.advance(MARKS_INTERVAL_MS);
    wide.stroke.begin();
    wide.stroke.show(Array.from({ length: MAX_STROKE_DRAWINGS + 1 }, () => pen([P(0, 0), P(1, 1)], { type: 'line' })), false);
    wide.advance(MARKS_INTERVAL_MS);
    expect(wide.sent).toEqual([]);
  });

  it('starts another scene without the drawing of the one before', () => {
    const table = started();
    table.stroke.begin();
    table.stroke.show([pen([P(0, 0), P(5, 5)])], true);
    table.share.setScene('other');
    table.advance(MARKS_INTERVAL_MS);
    expect(last(table)).toMatchObject({ from: 0 });
    table.share.setScene(null);
    const count = table.sent.length;
    table.stroke.show([pen([P(0, 0), P(5, 5), P(9, 9)])], true);
    table.advance(MARKS_INTERVAL_MS);
    expect(table.sent).toHaveLength(count);
  });
});
