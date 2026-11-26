import { describe, expect, it } from 'vitest';
import { fitsAnchors, fitsEllipse, fitsRectangle } from '../../../src/app/annotations/annotationFit';
import { annotationList, annotationRoom, readDrawing, readText, withinTextLength } from '../../../src/app/annotations/annotationList';
import { ELLIPSE_STEPS, MAX_DRAWINGS, MAX_STROKE_POINTS, MAX_TEXT_LENGTH, MAX_TEXTS, type DrawingAnnotation, type TextAnnotation } from '../../../src/app/annotations/annotationTypes';
import { MAX_TEXT_LENGTH as MAX_ONLINE_TEXT_LENGTH } from '../../../src/app/online/protocol/annotations';
import type { DrawingStroke, TextElement } from '../../../src/app/types';

type Point = { x: number; y: number };

const drawing = (id: string, overrides: Record<string, unknown> = {}): DrawingStroke =>
  ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 0, y: 0 }, { x: 70, y: 35 }], color: '#aa3300', width: 4, opacity: 1, ...overrides }) as DrawingStroke;
const text = (id: string, overrides: Record<string, unknown> = {}): TextElement =>
  ({ id, kind: 'text', x: 10, y: 20, text: 'Crypt', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...overrides }) as TextElement;
const records = (drawings: Record<string, unknown>, texts: Record<string, unknown> = {}): { drawings: Record<string, DrawingStroke>; texts: Record<string, TextElement> } =>
  ({ drawings: drawings as Record<string, DrawingStroke>, texts: texts as Record<string, TextElement> });
const path = (count: number): Point[] => Array.from({ length: count }, (_, index) => ({ x: index, y: 0 }));

const RECTANGLE: Point[] = [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 70 }, { x: 0, y: 70 }, { x: 0, y: 0 }];
/** The points an ellipse has by the file's rule: `c + a·cos t + b·sin t` at 64 even steps, and the first again. */
function ellipse(c: Point, a: Point, b: Point): Point[] {
  const points = Array.from({ length: ELLIPSE_STEPS }, (_, step) => {
    const t = (2 * Math.PI * step) / ELLIPSE_STEPS;
    return { x: c.x + a.x * Math.cos(t) + b.x * Math.sin(t), y: c.y + a.y * Math.cos(t) + b.y * Math.sin(t) };
  });
  return [...points, { ...points[0]! }];
}
const asDrawing = (value: unknown): DrawingAnnotation => readDrawing('d', value)!;
const asText = (value: unknown): TextAnnotation => readText('t', value)!;

describe('drawings as they are read', () => {
  it('reads a pen stroke made before any of this as what it always was', () => {
    const record = drawing('d');
    expect(asDrawing(record)).toEqual({
      kind: 'drawing', id: 'd', record, shape: 'pen', points: record.points, closed: false, width: 4, color: '#aa3300', opacity: 1,
      fill: null, holes: [], cells: false, dash: null, ends: null, anchors: null, icon: null, rotation: 0,
      hidden: false, layer: 'above', locked: false, order: 0, group: null, by: null, level: undefined,
    });
    expect(asDrawing(record).record).toBe(record);
    expect(asDrawing(record).points).toBe(record.points);
  });

  it('passes over what is no drawing: no object, an unknown type, points that are none, too many, or a stamp without a symbol', () => {
    const list = annotationList(records({
      word: 'pen',
      none: null,
      eraser: drawing('eraser', { type: 'eraser' }),
      spiral: drawing('spiral', { type: 'spiral' }),
      missing: { id: 'missing', kind: 'drawing', type: 'pen' },
      empty: drawing('empty', { points: [] }),
      flat: drawing('flat', { points: [0, 0, 1, 1] }),
      broken: drawing('broken', { points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }] }),
      infinite: drawing('infinite', { points: [{ x: Infinity, y: 0 }] }),
      strings: drawing('strings', { points: [{ x: '1', y: 0 }] }),
      long: drawing('long', { points: path(MAX_STROKE_POINTS + 1) }),
      blank: drawing('blank', { type: 'icon', points: [{ x: 5, y: 5 }] }),
      dot: drawing('dot', { points: [{ x: 5, y: 5 }] }),
      full: drawing('full', { points: path(MAX_STROKE_POINTS) }),
      stamp: drawing('stamp', { type: 'icon', points: [{ x: 5, y: 5 }], icon: 'a-symbol-of-a-later-atlas', width: 70 }),
    }));
    expect(list.map(({ id }) => id)).toEqual(['dot', 'full', 'stamp']);
    expect(annotationList({})).toEqual([]);
    expect(annotationList({ drawings: 'drawings' as never, texts: [] as never })).toEqual([]);
  });

  it('reads fields a hand edit broke as their defaults, and names a drawing by its place in the record', () => {
    const read = asDrawing(drawing('other', {
      color: 'red', width: -3, opacity: 7, fill: 'striped', dash: 'wavy', ends: 'start', hidden: 'yes', layer: 'sky', locked: 1,
      order: 'top', group: 5, by: '', level: 3, rotation: 45,
    }));
    expect(read).toMatchObject({
      id: 'd', color: '#ffffff', width: 70 / 12, opacity: 1, fill: null, dash: null, ends: null, hidden: false, layer: 'above', locked: false,
      order: 0, group: null, by: null, level: undefined, rotation: 0,
    });
    expect(asDrawing(drawing('d', { opacity: -1 })).opacity).toBe(0);
    expect(asDrawing(drawing('d', { width: 0 })).width).toBe(0);
    expect(asDrawing(drawing('d', { type: 'icon', icon: 'skull', width: 0 })).width).toBe(70);
    expect(asDrawing(drawing('d', { type: 'icon', icon: 'skull', width: 140, rotation: 30 }))).toMatchObject({ shape: 'stamp', icon: 'skull', width: 140, rotation: 30, closed: false });
  });

  it('reads the new fields where they are what they may be', () => {
    const read = asDrawing(drawing('d', {
      type: 'line', points: [...RECTANGLE.slice(0, 4), RECTANGLE[0]], width: 0, fill: 'soft', dash: 'dotted', ends: 'both',
      holes: [[{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], 'ring', [{ x: 1, y: 1 }, { x: 2, y: 2 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 'a', y: 3 }]],
      hidden: true, layer: 'map', locked: true, order: -2.5, group: 'g1', by: 'player-1', level: 'upper',
    }));
    expect(read).toMatchObject({
      shape: 'line', closed: true, width: 0, fill: 'soft', dash: 'dotted', hidden: true, layer: 'map', locked: true, order: -2.5, group: 'g1', by: 'player-1', level: 'upper',
    });
    expect(read.holes).toEqual([[{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]]);
    // A closed line has no ends to put arrowheads on
    expect(read.ends).toBeNull();
  });

  it('gives a fill only to a closed line and arrowheads only to an open one', () => {
    const open = asDrawing(drawing('d', { type: 'line', fill: 'solid', ends: 'end', holes: [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]] }));
    expect(open).toMatchObject({ closed: false, fill: null, holes: [], ends: 'end' });
    // Three points and the first again is the least that has an inside
    expect(asDrawing(drawing('d', { points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 0 }], fill: 'solid' })).closed).toBe(false);
    expect(asDrawing(drawing('d', { points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }, { x: 0, y: 0 }], fill: 'solid' }))).toMatchObject({ closed: true, fill: 'solid' });
  });

  it('reads a fill as made of cells only where the record says so, and only a fill', () => {
    const cells = asDrawing(drawing('d', { type: 'line', points: RECTANGLE, width: 0, fill: 'solid', opacity: 0.4, cells: true }));
    expect(cells).toMatchObject({ shape: 'line', closed: true, fill: 'solid', width: 0, cells: true });
    expect(cells.record).toMatchObject({ cells: true });
    for (const value of [1, 'true', {}, null]) expect(asDrawing(drawing('d', { type: 'line', points: RECTANGLE, fill: 'solid', cells: value })).cells).toBe(false);
    // Without a fill, or on a line that is open, the hint says nothing.
    expect(asDrawing(drawing('d', { type: 'line', points: RECTANGLE, cells: true })).cells).toBe(false);
    expect(asDrawing(drawing('d', { type: 'line', points: RECTANGLE.slice(0, 3), fill: 'solid', cells: true })).cells).toBe(false);
  });

  it('reads no more holes than a drawing may have points', () => {
    const ring = path(MAX_STROKE_POINTS / 2);
    const read = asDrawing(drawing('d', { points: RECTANGLE, fill: 'solid', holes: [ring, ring, ring] }));
    expect(read.holes).toHaveLength(2);
  });
});

describe('a hint that does not fit its points', () => {
  it('reads a rectangle whose points are one as a rectangle, upright, turned or made oblique by a stretched map', () => {
    expect(asDrawing(drawing('d', { type: 'rectangle', points: RECTANGLE })).shape).toBe('rectangle');
    const turn = (p: Point): Point => ({ x: p.x * Math.cos(0.4) - p.y * Math.sin(0.4) + 900.25, y: p.x * Math.sin(0.4) + p.y * Math.cos(0.4) - 300.5 });
    expect(fitsRectangle(RECTANGLE.map(turn))).toBe(true);
    const sheared = (p: Point): Point => ({ x: p.x * 1.04 + p.y * 0.02, y: p.y * 0.97 });
    expect(fitsRectangle(RECTANGLE.map(turn).map(sheared))).toBe(true);
  });

  it('reads a rectangle whose points were cut, moved apart or left open as a free shape', () => {
    const moved = RECTANGLE.map((point, index) => (index === 2 ? { x: point.x + 1, y: point.y } : point));
    const open = [...RECTANGLE.slice(0, 4), { x: 0, y: 3 }];
    for (const points of [RECTANGLE.slice(0, 3), moved, open, [...RECTANGLE, { x: 0, y: 0 }]]) {
      const read = asDrawing(drawing('d', { type: 'rectangle', points }));
      expect(read.shape).toBe('free');
      expect(read.points).toBe(points);
    }
  });

  it('reads an ellipse whose points are one as an ellipse, and any other as a free shape', () => {
    const round = ellipse({ x: 400, y: 300 }, { x: 140, y: 0 }, { x: 0, y: 70 });
    expect(asDrawing(drawing('d', { type: 'circle', points: round })).shape).toBe('ellipse');
    const oblique = ellipse({ x: -2000.5, y: 9000.25 }, { x: 140, y: 12 }, { x: -30, y: 70 });
    expect(fitsEllipse(oblique)).toBe(true);
    // Points written with two decimals are still its points
    expect(fitsEllipse(oblique.map(({ x, y }) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })))).toBe(true);

    const dented = round.map((point, index) => (index === 20 ? { x: point.x + 0.5, y: point.y } : point));
    const cut = [...round.slice(0, 40), round[0]!];
    const polygon = [...round.slice(0, 64).map((point, index) => (index % 2 ? { x: 400, y: 300 } : point)), round[0]!];
    for (const points of [dented, cut, polygon, round.slice(0, 64)]) {
      expect(asDrawing(drawing('d', { type: 'circle', points })).shape).toBe('free');
    }
  });

  it('keeps a curved path\'s anchors while they lie on it in order, and reads it as a free shape once they do not', () => {
    const curve = [{ x: 0, y: 0 }, { x: 10, y: 6 }, { x: 20, y: 9 }, { x: 30, y: 6 }, { x: 40, y: 0 }];
    const anchors = [curve[0]!, curve[2]!, curve[4]!];
    expect(asDrawing(drawing('d', { type: 'line', points: curve, anchors }))).toMatchObject({ shape: 'line', anchors });
    expect(asDrawing(drawing('d', { type: 'line', points: curve }))).toMatchObject({ shape: 'line', anchors: null });

    const closed = [...curve, { x: 20, y: -20 }, curve[0]!];
    expect(fitsAnchors(closed, [curve[0]!, curve[2]!, curve[4]!, { x: 20, y: -20 }])).toBe(true);

    // A cut piece that kept the whole path's anchors, anchors a move left behind, out of order, too few, no points at all
    const stale: unknown[] = [
      [curve[0], curve[2], { x: 80, y: 0 }],
      anchors.map(({ x, y }) => ({ x: x + 3, y })),
      [curve[0], curve[4], curve[2]],
      [curve[0]],
      'anchors',
      [curve[0], { x: 20 }, curve[4]],
    ];
    for (const bad of stale) {
      expect(asDrawing(drawing('d', { type: 'line', points: curve, anchors: bad }))).toMatchObject({ shape: 'free', anchors: null });
    }
    // A pen stroke has no anchors to be wrong
    expect(asDrawing(drawing('d', { points: curve, anchors: 'anchors' })).shape).toBe('pen');
  });
});

describe('texts as they are read', () => {
  it('reads a text made before any of this as what it always was: a plate where it has a background, centred', () => {
    const record = text('t', { backgroundColor: '#000000' });
    expect(asText(record)).toEqual({
      kind: 'text', id: 't', record, x: 10, y: 20, text: 'Crypt', fontSize: 24, scale: 1, fontFamily: 'Arial', color: '#ffffff',
      look: 'plate', backgroundColor: '#000000', padding: 8, borderRadius: 0, opacity: 1, width: null, breaks: null, align: 'center', bold: false, italic: false, rotation: 0,
      hidden: false, layer: 'above', locked: false, order: 0, group: null, by: null, level: undefined,
    });
    expect(asText(text('t')).look).toBe('plain');
    expect(asText(text('t', { outline: true })).look).toBe('outline');
    expect(asText(text('t', { outline: true, backgroundColor: '#112233' })).look).toBe('plate');
  });

  it('passes over what is no text, and reads what a hand edit broke as its default', () => {
    const list = annotationList(records({}, {
      word: 'text', nowhere: text('nowhere', { x: Number.NaN }), mute: text('mute', { text: 7 }), fine: text('fine'), empty: text('empty', { text: '' }),
    }));
    expect(list.map(({ id }) => id)).toEqual(['fine', 'empty']);

    const read = asText(text('other', {
      fontSize: 0, scale: -1, fontFamily: '', color: 'white', backgroundColor: 'black', padding: 'wide', opacity: 0, width: -5, breaks: [3, 2],
      align: 'justify', bold: 'yes', rotation: 'north', hidden: 1, layer: 'map', order: 4,
    }));
    expect(read).toMatchObject({
      id: 't', fontSize: 31.5, scale: 1, fontFamily: 'Arial', color: '#ffffff', look: 'plain', backgroundColor: null, padding: 8, opacity: 1, width: null, breaks: null,
      align: 'center', bold: false, rotation: 0, hidden: false, layer: 'map', order: 4,
    });
    expect(asText(text('t', { width: 210, breaks: [2, 5], align: 'left', bold: true, italic: true, rotation: 90, scale: 2 })))
      .toMatchObject({ width: 210, breaks: [2, 5], align: 'left', bold: true, italic: true, rotation: 90, scale: 2 });
    expect(asText(text('t', { breaks: [2, 9] })).breaks).toBeNull();
    expect(asText(text('t', { breaks: [1.5] })).breaks).toBeNull();
  });
});

describe('a text longer than a text may be', () => {
  const label = (text: string, more: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 't', kind: 'text', x: 0, y: 0, text, fontSize: 20, fontFamily: 'Arial', color: '#ffffff', ...more });

  it('reads cut to the most a text may have, and stays in its record as the file has it', () => {
    const record = label('ab'.repeat(MAX_TEXT_LENGTH), { width: 200, breaks: [MAX_TEXT_LENGTH + 4] });
    const read = readText('t', record)!;
    expect(read.text).toBe('ab'.repeat(MAX_TEXT_LENGTH / 2));
    expect(read.record).toBe(record);
    expect((read.record as { text: string }).text).toHaveLength(2 * MAX_TEXT_LENGTH);
    // Breaks saved for the whole of it are none of the text that is read.
    expect(read.breaks).toBeNull();
    expect(readText('t', label('a'.repeat(MAX_TEXT_LENGTH)))!.text).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('is cut after a whole character', () => {
    // An emoji is two units of the string: one that would be halved by the cut goes whole.
    const text = `${'a'.repeat(MAX_TEXT_LENGTH - 1)}\ud83d\ude00b`;
    expect(withinTextLength(text)).toBe('a'.repeat(MAX_TEXT_LENGTH - 1));
    expect(withinTextLength(`${'a'.repeat(MAX_TEXT_LENGTH - 2)}\ud83d\ude00b`)).toBe(`${'a'.repeat(MAX_TEXT_LENGTH - 2)}\ud83d\ude00`);
    expect(withinTextLength('short')).toBe('short');
  });

  it('is as long as the message to online players may carry', () => {
    expect(MAX_TEXT_LENGTH).toBe(MAX_ONLINE_TEXT_LENGTH);
  });
});

describe('the list of annotations', () => {
  it('keeps today\'s picture where nothing has an order: texts under drawings, each as their record has them', () => {
    const list = annotationList(records({ d1: drawing('d1'), d2: drawing('d2') }, { t1: text('t1'), t2: text('t2') }));
    expect(list.map(({ id }) => id)).toEqual(['t1', 't2', 'd1', 'd2']);
  });

  it('lays drawings and texts in one order, those without one where they always lay', () => {
    const list = annotationList(records(
      { d1: drawing('d1', { order: 3 }), d2: drawing('d2'), d3: drawing('d3', { order: -1 }), d4: drawing('d4', { order: 1 }) },
      { t1: text('t1', { order: 2 }), t2: text('t2'), t3: text('t3', { order: 1 }) },
    ));
    expect(list.map(({ id }) => id)).toEqual(['d3', 't2', 'd2', 't3', 'd4', 't1', 'd1']);
  });

  it('answers with the same list for the same pair of records, and the same annotation for the same record', () => {
    const d1 = drawing('d1');
    const t1 = text('t1');
    const both = records({ d1 }, { t1 });
    const list = annotationList(both);
    expect(annotationList({ drawings: both.drawings, texts: both.texts })).toBe(list);

    // A write to the texts leaves the drawings' record, and so every drawing's reading, as it was
    const edited = annotationList({ drawings: both.drawings, texts: { t1: { ...t1, text: 'Vault' } } });
    expect(edited).not.toBe(list);
    expect(edited[1]).toBe(list[1]);
    expect(edited[0]).not.toBe(list[0]);
    expect(annotationList(both)).toBe(list);

    // The same entry under another id is another annotation
    expect(readDrawing('d1', d1)).toBe(list[1]);
    expect(readDrawing('elsewhere', d1)).toMatchObject({ id: 'elsewhere' });
    expect(annotationList({ drawings: both.drawings })).not.toBe(list);
    expect(annotationList({ drawings: both.drawings }).map(({ id }) => id)).toEqual(['d1']);
  });

  it('never drops a field it does not know: the record goes along as the file has it', () => {
    const record = drawing('d1', { type: 'rectangle', points: RECTANGLE.slice(0, 3), glow: { radius: 4 }, anchors: 'stale' });
    const [read] = annotationList(records({ d1: record }));
    expect(read).toMatchObject({ shape: 'free' });
    expect(read!.record).toBe(record);
    expect(read!.record).toMatchObject({ glow: { radius: 4 }, anchors: 'stale', type: 'rectangle' });
  });

  it('reads the first drawings and texts a level may have, and says how much room is left', () => {
    const drawings: Record<string, unknown> = { junk: 4 };
    for (let index = 0; index < MAX_DRAWINGS + 5; index++) drawings[`d${index}`] = drawing(`d${index}`);
    const texts: Record<string, unknown> = {};
    for (let index = 0; index < MAX_TEXTS + 5; index++) texts[`t${index}`] = text(`t${index}`);
    const full = records(drawings, texts);
    const list = annotationList(full);
    expect(list).toHaveLength(MAX_DRAWINGS + MAX_TEXTS);
    expect(list[MAX_TEXTS - 1]!.id).toBe(`t${MAX_TEXTS - 1}`);
    expect(list[list.length - 1]!.id).toBe(`d${MAX_DRAWINGS - 1}`);
    expect(annotationRoom(full)).toEqual({ drawings: 0, texts: 0 });
    expect(annotationRoom(records({ d1: drawing('d1') }, { t1: text('t1'), bad: 4 }))).toEqual({ drawings: MAX_DRAWINGS - 1, texts: MAX_TEXTS - 1 });
  });
});
