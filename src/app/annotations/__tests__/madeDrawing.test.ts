import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { annotationIndex } from '../annotationHit';
import { readDrawing } from '../annotationList';
import { DEFAULT_DRAW_TOOL, MAX_STROKE_POINTS, type DrawToolChoices } from '../annotationTypes';
import { stampSize, strokeWidth, textHeight } from '../drawSizes';
import { drawingInk, curveTolerance, SOFT_FILL } from '../drawingInk';
import { sweepChange } from '../eraseSweep';
import { inFill } from '../lineMath';
import { liveDrawing, madeDrawing, madeStamp, SEE_THROUGH, type MadeShape } from '../madeDrawing';
import { FONT_FAMILIES, madeText, TEXT_PLATE } from '../madeText';
import { CURVE_TOLERANCE, THIN_TOLERANCE } from '../penStroke';
import type { FilledPart } from '../quantized';
import { drawing, seeded, strays, text, wandering } from './annotationKit';

const CELL = 70;
const tool = (choices: Partial<DrawToolChoices> = {}): DrawToolChoices => ({ ...DEFAULT_DRAW_TOOL, ...choices });
const p = (x: number, y: number): Point => ({ x, y });
const made = (mode: MadeShape['mode'], points: Point[], closed = false): MadeShape => ({ mode, points, closed });
const area = (parts: readonly FilledPart[]): number => parts.reduce((sum, { outline, holes }) => sum + ringArea(outline) - holes.reduce((cut, hole) => cut + ringArea(hole), 0), 0);
function ringArea(ring: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

describe('madeDrawing', () => {
  it('thins a pen\'s stroke to what its line needs at the zoom it was drawn at, and keeps its ends', () => {
    const stroke = wandering(seeded(3), 400, 3);
    for (const zoom of [0.5, 1, 4]) {
      const result = madeDrawing(made('pen', stroke), tool(), CELL, zoom);
      expect(result).toMatchObject({ type: 'pen', color: '#ffffff', width: strokeWidth('m', CELL), opacity: 1 });
      expect(result!.points.length).toBeLessThan(stroke.length);
      expect(result!.points[0]).toEqual(stroke[0]);
      expect(result!.points.at(-1)).toEqual(stroke.at(-1));
      expect(strays(stroke, result!.points)).toBeLessThanOrEqual(THIN_TOLERANCE / zoom + 1e-9);
    }
  });

  it('makes a dot of a single point, and nothing of no point', () => {
    expect(madeDrawing(made('pen', [p(3, 4)]), tool(), CELL, 1)?.points).toEqual([p(3, 4)]);
    expect(madeDrawing(made('pen', []), tool(), CELL, 1)).toBeNull();
  });

  it('never leaves a stroke with more points than a drawing may have', () => {
    // A line that turns at every point: no tolerance of a pixel takes any of them out.
    const jagged = Array.from({ length: MAX_STROKE_POINTS + 500 }, (_, index) => p(index * 4, index % 2 ? 40 : 0));
    const result = madeDrawing(made('pen', jagged), tool(), CELL, 1);
    expect(result!.points.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    expect(result!.points.length).toBeGreaterThan(1);
  });

  it('gives the pen see-through ink, and no dashes, ends or fill', () => {
    const result = madeDrawing(made('pen', [p(0, 0), p(50, 0)]), tool({ seeThrough: true, dash: 'dashed', ends: 'both', fill: 'solid' }), CELL, 1);
    expect(result).toMatchObject({ opacity: SEE_THROUGH });
    for (const field of ['dash', 'ends', 'fill', 'hidden', 'layer']) expect(result).not.toHaveProperty(field);
  });

  it('gives an open line its dashes and arrowheads, a closed one its dashes and fill', () => {
    const choices = tool({ dash: 'dotted', ends: 'end', fill: 'soft', seeThrough: true });
    const open = madeDrawing(made('line', [p(0, 0), p(50, 0), p(50, 50)]), choices, CELL, 1);
    expect(open).toEqual({ type: 'line', points: [p(0, 0), p(50, 0), p(50, 50)], color: '#ffffff', width: strokeWidth('m', CELL), opacity: SEE_THROUGH, dash: 'dotted', ends: 'end' });
    const closed = madeDrawing(made('line', [p(0, 0), p(50, 0), p(50, 50)], true), choices, CELL, 1);
    expect(closed).toEqual({ type: 'line', points: [p(0, 0), p(50, 0), p(50, 50), p(0, 0)], color: '#ffffff', width: strokeWidth('m', CELL), opacity: SEE_THROUGH, dash: 'dotted', fill: 'soft' });
    // Read back, both are what was made.
    expect(readDrawing('a', { id: 'a', kind: 'drawing', timestamp: 1, ...open })).toMatchObject({ shape: 'line', closed: false, ends: 'end', fill: null });
    expect(readDrawing('b', { id: 'b', kind: 'drawing', timestamp: 1, ...closed })).toMatchObject({ shape: 'line', closed: true, ends: null, fill: 'soft' });
  });

  it('curves a path through its clicked points where the tool says so, and keeps them as its anchors', () => {
    const corners = [p(0, 0), p(100, 0), p(100, 100)];
    const curved = madeDrawing(made('line', corners), tool({ curved: true }), CELL, 1)!;
    expect(curved.anchors).toEqual(corners);
    expect(curved.points.length).toBeGreaterThan(corners.length);
    expect(readDrawing('c', { id: 'c', kind: 'drawing', timestamp: 1, ...curved })).toMatchObject({ shape: 'line', anchors: corners });
    // Two points have no curve between them.
    expect(madeDrawing(made('line', [p(0, 0), p(100, 0)]), tool({ curved: true }), CELL, 1)).not.toHaveProperty('anchors');
  });

  it('makes a rectangle and an ellipse of two corners, with dashes and a fill and never see-through, and nothing without a size', () => {
    const choices = tool({ dash: 'dashed', fill: 'solid', seeThrough: true, ends: 'both' });
    const rectangle = madeDrawing(made('rectangle', [p(10, 10), p(110, 60)]), choices, CELL, 1);
    expect(rectangle).toEqual({ type: 'rectangle', points: [p(10, 10), p(110, 10), p(110, 60), p(10, 60), p(10, 10)], color: '#ffffff', width: strokeWidth('m', CELL), opacity: 1, dash: 'dashed', fill: 'solid' });
    const ellipse = madeDrawing(made('ellipse', [p(10, 10), p(110, 60)]), choices, CELL, 1);
    expect(readDrawing('e', { id: 'e', kind: 'drawing', timestamp: 1, ...ellipse })).toMatchObject({ shape: 'ellipse', fill: 'solid', dash: 'dashed' });
    expect(madeDrawing(made('rectangle', [p(10, 10), p(10, 60)]), choices, CELL, 1)).toBeNull();
    expect(madeDrawing(made('ellipse', [p(10, 10), p(110, 10)]), choices, CELL, 1)).toBeNull();
    expect(madeDrawing(made('line', [p(10, 10)]), choices, CELL, 1)).toBeNull();
  });

  it('keeps a drawing to the GM, and puts it on the map, where the tool says so', () => {
    const result = madeDrawing(made('line', [p(0, 0), p(50, 0)]), tool({ players: false, layer: 'map', color: '#12ab34', size: 'xl' }), 140, 1);
    expect(result).toMatchObject({ hidden: true, layer: 'map', color: '#12ab34', width: strokeWidth('xl', 140) });
  });

  it('shows the drawing under way as the one that will stay: a shape the same, a pen through the gesture\'s own points', () => {
    const shape = made('rectangle', [p(0, 0), p(70, 70)]);
    expect(liveDrawing(shape, tool({ fill: 'soft' }), CELL)).toEqual(madeDrawing(shape, tool({ fill: 'soft' }), CELL, 1));
    const points = [p(0, 0), p(1, 0), p(2, 0)];
    expect(liveDrawing(made('pen', points), tool(), CELL)?.points).toBe(points);
    expect(liveDrawing(made('pen', []), tool(), CELL)).toBeNull();
  });
});

describe('madeStamp and madeText', () => {
  it('stamps the tool\'s symbol in its colour, as wide as its size says, always solid', () => {
    expect(madeStamp(p(35, 105), tool({ icon: 'skull', color: '#ff0000', size: 'l', seeThrough: true, players: false, layer: 'map' }), CELL))
      .toEqual({ type: 'icon', icon: 'skull', points: [p(35, 105)], color: '#ff0000', width: stampSize('l', CELL), opacity: 1, hidden: true, layer: 'map' });
  });

  it('writes a text in the tool\'s look: its height, face, weight, and a plate, an outline or neither', () => {
    const plain = madeText('Gate', p(10, 20), tool({ look: 'plain', size: 's', font: 'mono', italic: true }), CELL);
    expect(plain).toEqual({ x: 10, y: 20, text: 'Gate', fontSize: textHeight('s', CELL), fontFamily: FONT_FAMILIES.mono, color: '#ffffff', align: 'center', bold: false, italic: true, rotation: 0, scale: 1 });
    expect(madeText('Gate', p(0, 0), tool({ look: 'outline' }), CELL)).toMatchObject({ outline: true });
    const plate = madeText('Gate', p(0, 0), tool({ look: 'plate', players: false, layer: 'map' }), CELL);
    expect(plate).toMatchObject({ ...TEXT_PLATE, hidden: true, layer: 'map' });
    expect(plate).not.toHaveProperty('outline');
  });
});

describe('drawingInk', () => {
  const room = [p(0, 0), p(100, 0), p(100, 100), p(0, 100), p(0, 0)];

  it('strokes a plain line as it is, and fills nothing', () => {
    const ink = drawingInk(drawing({ type: 'line', points: [p(0, 0), p(50, 0), p(50, 50)], width: 6 }), 0.2);
    expect(ink).toMatchObject({ fill: null, even: null, heads: [], width: 6, alpha: 1 });
    expect(ink.lines).toEqual([[p(0, 0), p(50, 0), p(50, 50)]]);
  });

  it('rounds a pen\'s stroke and an ellipse within the tolerance, and leaves a line\'s corners as corners', () => {
    const corner = [p(0, 0), p(50, 0), p(50, 50)];
    const pen = drawingInk(drawing({ points: corner }), 0.2).lines[0]!;
    expect(pen.length).toBeGreaterThan(corner.length);
    expect(strays(pen, corner)).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('fills a closed shape at its opacity, a soft fill at a quarter of it, and nothing for an open one', () => {
    const solid = drawingInk(drawing({ type: 'rectangle', points: room, fill: 'solid' }), 0.2);
    expect(solid.fill?.alpha).toBe(1);
    expect(area(solid.fill!.parts)).toBeCloseTo(10_000, 6);
    expect(drawingInk(drawing({ type: 'rectangle', points: room, fill: 'soft' }), 0.2).fill?.alpha).toBe(SOFT_FILL);
    expect(drawingInk(drawing({ type: 'line', points: room.slice(0, 4), fill: 'solid' }), 0.2).fill).toBeNull();
  });

  it('cuts the holes out of a fill, and fills an outline that crosses itself as a point is found in it', () => {
    const hole = [p(40, 40), p(60, 40), p(60, 60), p(40, 60)];
    const holed = drawingInk(drawing({ type: 'line', points: room, fill: 'solid', holes: [hole], width: 0 }), 0.2);
    expect(area(holed.fill!.parts)).toBeCloseTo(10_000 - 400, 6);
    expect(holed.lines).toEqual([]);
    // A bow tie: two triangles that meet in a point.
    const bow = [p(0, 0), p(100, 100), p(100, 0), p(0, 100), p(0, 0)];
    const crossed = drawing({ type: 'line', points: bow, fill: 'solid', width: 0 });
    const parts = drawingInk(crossed, 0.2).fill!.parts;
    expect(area(parts)).toBeCloseTo(5000, 6);
    for (const point of [p(10, 50), p(90, 50), p(50, 10), p(50, 90)]) {
      expect(parts.some((part) => inFill(point, [...part.outline, part.outline[0]!], part.holes))).toBe(inFill(point, crossed.points, crossed.holes));
    }
  });

  it('gives a see-through line one outline of all its ink, and ends the fill where the ink begins', () => {
    const ink = drawingInk(drawing({ type: 'rectangle', points: room, fill: 'solid', opacity: 0.5, width: 10 }), 0.2);
    expect(ink.lines).toEqual([]);
    expect(ink.heads).toEqual([]);
    expect(ink.alpha).toBe(0.5);
    // The line is 10 wide about the outline, with round corners: a frame between a 90 and a 110 square.
    const line = area(ink.even!);
    expect(line).toBeGreaterThan(110 * 110 - 90 * 90 - 25);
    expect(line).toBeLessThan(110 * 110 - 90 * 90);
    // The fill is what the line leaves of the inside: nowhere do the two overlap.
    expect(area(ink.fill!.parts)).toBeCloseTo(90 * 90, 0);
    expect(ink.fill!.alpha).toBe(0.5);
  });

  it('cuts a dashed line into its dashes, and draws arrowheads on a shaft that ends where they begin', () => {
    const dashed = drawingInk(drawing({ type: 'line', points: [p(0, 0), p(90, 0)], width: 10, dash: 'dashed' }), 0.2);
    expect(dashed.lines).toEqual([[p(0, 0), p(30, 0)], [p(60, 0), p(90, 0)]]);
    const arrow = drawingInk(drawing({ type: 'line', points: [p(0, 0), p(200, 0)], width: 10, ends: 'both' }), 0.2);
    expect(arrow.heads).toHaveLength(2);
    expect(arrow.heads.map((head) => head[0])).toEqual([p(200, 0), p(0, 0)]);
    expect(arrow.lines).toEqual([[p(40, 0), p(160, 0)]]);
  });

  it('rounds no further than a quarter of the line\'s width, however far out the stroke is first drawn', () => {
    expect(curveTolerance(1, 100)).toBe(CURVE_TOLERANCE);
    expect(curveTolerance(4, 100)).toBe(CURVE_TOLERANCE / 4);
    expect(curveTolerance(0.01, 4)).toBe(1);
    expect(curveTolerance(0, 4)).toBe(1);
    expect(curveTolerance(Number.NaN, 0)).toBe(0.25);
  });
});

describe('sweepChange', () => {
  const line = drawing({ id: 'line', points: [p(0, 0), p(100, 0)] });
  const label = text({ id: 'label', x: 50, y: 60 });
  const size = (): { width: number; height: number } => ({ width: 40, height: 20 });
  const index = annotationIndex([line, label], size);

  it('names nothing where the sweep reaches nothing, and for a sweep without a path or a reach', () => {
    expect(sweepChange(index, { points: [p(50, 200)], radius: 10 }, false)).toBeNull();
    expect(sweepChange(index, { points: [], radius: 10 }, false)).toBeNull();
    expect(sweepChange(index, { points: [p(50, 0)], radius: 0 }, false)).toBeNull();
  });

  it('cuts a drawing into what is left of it, or takes it whole', () => {
    const cut = sweepChange(index, { points: [p(50, -20), p(50, 20)], radius: 5 }, false);
    expect(cut?.removed).toEqual(['line']);
    expect(cut?.added).toHaveLength(2);
    expect(cut?.texts).toEqual([]);
    expect(sweepChange(index, { points: [p(50, 0)], radius: 5 }, true)).toEqual({ removed: ['line'], added: [], texts: [] });
  });

  it('takes a text whole when the sweep reaches its box: a dab in it, a dab beside it, a stroke across it', () => {
    for (const points of [[p(50, 60)], [p(74, 60)], [p(0, 60), p(100, 60)]]) {
      expect(sweepChange(index, { points, radius: 5 }, false)).toEqual({ removed: [], added: [], texts: ['label'] });
    }
    expect(sweepChange(index, { points: [p(80, 60)], radius: 5 }, false)).toBeNull();
  });

  it('leaves what is locked', () => {
    const locked = annotationIndex([drawing({ id: 'kept', points: [p(0, 0), p(100, 0)], locked: true }), text({ id: 'held', x: 50, y: 60, locked: true })], size);
    expect(sweepChange(locked, { points: [p(50, -20), p(50, 80)], radius: 10 }, true)).toBeNull();
  });
});
