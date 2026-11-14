import { describe, expect, it } from 'vitest';
import {
  MAX_DRAWING_HOLES, MAX_DRAWING_POINTS, MAX_DRAWINGS, MAX_STROKE_DRAWINGS, MAX_STROKE_NUMBERS, MAX_TEXTS, parseAnnotations, parseGmMessage, parseMarks, type MarksMessage, type SharedAnnotations, type SharedDrawing, type SharedText,
} from '../../../../src/app/online/protocol/index.ts';
import { formerParseAnnotations } from '../../../oracles/annotationsBaseline/parseAnnotations.ts';

const PEN: SharedDrawing = { type: 'pen', points: [0, 0, 5, 5], colour: '#ff0000', width: 4, opacity: 1 };
const STAMP: SharedDrawing = { type: 'icon', points: [3, 3], colour: '#00ff00', width: 40, opacity: 0.5, icon: 'skull' };
const TEXT: SharedText = { x: 1, y: 2, text: 'Tavern by the long road', fontSize: 24, fontFamily: 'Georgia, serif', colour: '#ffffff', background: null, padding: 8, radius: 0, opacity: 1, align: 'center', bold: false, italic: true, rotation: 45, scale: 1 };
const ROOM: SharedDrawing = {
  type: 'pen', points: [0, 0, 70, 0, 70, 70, 0, 70, 0, 0], colour: '#086ddd', width: 0, opacity: 0.4,
  shape: 'rectangle', fill: 'soft', holes: [[10, 10, 20, 10, 20, 20]], dash: 'dotted', order: 4,
};
const ARROW: SharedDrawing = { type: 'pen', points: [0, 0, 30, 10, 60, 0], colour: '#ffffff', width: 3, opacity: 0.5, shape: 'line', curved: true, ends: 'both', dash: 'dashed', order: -2 };
const WRAPPED: SharedText = { ...TEXT, outline: true, wrap: 120, breaks: [7, 14], order: 9 };

const json = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));
const read = (value: unknown): SharedAnnotations | null => parseAnnotations(json(value) as Record<string, unknown>);

describe('drawings and texts in a message', () => {
  it('read as they were written, with everything a drawing and a text may say', () => {
    const told: SharedAnnotations = {
      drawings: [PEN, ROOM, ARROW, { ...STAMP, turn: 45, order: 3 }, { ...PEN, shape: 'ellipse', fill: 'solid' }],
      texts: [TEXT, WRAPPED],
      onMap: { drawings: [ROOM], texts: [WRAPPED] },
    };
    expect(read(told)).toStrictEqual(told);
    expect(parseGmMessage(json({ t: 'annotations', scene: 's', ...told }))).toStrictEqual({ t: 'annotations', scene: 's', ...told });
  });

  it('read a message from before there was more to say exactly as it was read then', () => {
    const told = { drawings: [PEN, STAMP], texts: [TEXT] };
    expect(read(told)).toStrictEqual(told);
    expect(read(told)).toStrictEqual(formerParseAnnotations(json(told) as Record<string, unknown>));
  });

  it('pass over an entry that cannot be read and read the rest', () => {
    const told = {
      drawings: [PEN, { ...PEN, points: [0] }, { ...STAMP, icon: '<svg>' }, 'no drawing', { ...PEN, colour: 'red' }, ROOM, { ...PEN, type: 'spray' }],
      texts: [{ ...TEXT, fontFamily: 'x; } body { display: none' }, TEXT, { ...TEXT, text: 'x'.repeat(2001) }, null],
      onMap: { drawings: [{ ...ROOM, width: -1 }, ARROW], texts: [WRAPPED, { ...WRAPPED, x: Number.NaN }] },
    };
    expect(read(told)).toStrictEqual({ drawings: [PEN, ROOM], texts: [TEXT], onMap: { drawings: [ARROW], texts: [WRAPPED] } });
  });

  it('read a drawing without what it says beside its line that cannot be read', () => {
    const odd = { ...ROOM, shape: 'star', fill: 'hatched', dash: 1, ends: 'start', curved: 'yes', order: Number.POSITIVE_INFINITY, turn: 30, holes: [[1, 2, 3]] };
    expect(read({ drawings: [odd], texts: [] })?.drawings).toStrictEqual([{ type: 'pen', points: ROOM.points, colour: ROOM.colour, width: 0, opacity: 0.4 }]);
    // Too many holes, or one that is no ring, and the fill is read without any.
    const riddled = { ...ROOM, holes: Array.from({ length: MAX_DRAWING_HOLES + 1 }, () => [0, 0, 1, 0, 1, 1]) };
    expect(read({ drawings: [riddled], texts: [] })?.drawings[0]).not.toHaveProperty('holes');
    // A stamp says only its turn and its place in the order beyond what it always said.
    expect(read({ drawings: [{ ...STAMP, turn: 400, fill: 'solid', shape: 'line' }], texts: [] })?.drawings).toStrictEqual([STAMP]);
  });

  it('read a text without breaks that do not fit it, and without breaks that have no width', () => {
    const texts = (text: unknown): readonly SharedText[] | undefined => read({ drawings: [], texts: [text] })?.texts;
    expect(texts({ ...WRAPPED, breaks: [7, 7] })).toStrictEqual([{ ...TEXT, outline: true, wrap: 120, order: 9 }]);
    expect(texts({ ...WRAPPED, breaks: [7, 999] })).toStrictEqual([{ ...TEXT, outline: true, wrap: 120, order: 9 }]);
    expect(texts({ ...TEXT, breaks: [7] })).toStrictEqual([TEXT]);
    expect(texts({ ...WRAPPED, wrap: 0 })).toStrictEqual([{ ...TEXT, outline: true, order: 9 }]);
    expect(texts({ ...WRAPPED, outline: 'yes', order: 0 })).toStrictEqual([{ ...TEXT, wrap: 120, breaks: [7, 14] }]);
  });

  it('hold a message to what it may carry, above the tokens and on the map together', () => {
    const many = { drawings: Array.from({ length: MAX_DRAWINGS - 1 }, () => PEN), texts: Array.from({ length: MAX_TEXTS + 5 }, () => TEXT), onMap: { drawings: [ROOM, ROOM, ROOM], texts: [WRAPPED] } };
    const parsed = read(many);
    expect(parsed?.drawings).toHaveLength(MAX_DRAWINGS - 1);
    expect(parsed?.onMap?.drawings).toHaveLength(1);
    expect(parsed?.texts).toHaveLength(MAX_TEXTS);
    expect(parsed?.onMap?.texts).toHaveLength(0);
    // A drawing the points have no room for is passed over, holes counted with its line; a smaller one after it is read.
    const long = { ...PEN, points: Array.from({ length: MAX_DRAWING_POINTS * 2 - 8 }, () => 1) };
    expect(read({ drawings: [long, ROOM, PEN], texts: [] })?.drawings).toStrictEqual([long, PEN]);
    expect(read({ drawings: [{ ...PEN, points: Array.from({ length: MAX_DRAWING_POINTS * 2 + 2 }, () => 1) }, PEN], texts: [] })?.drawings).toStrictEqual([PEN]);
  });

  it('refuse a message that holds no lists', () => {
    expect(read({ drawings: {}, texts: [] })).toBeNull();
    expect(read({ drawings: [] })).toBeNull();
    // What lies on the map is read only where it is two lists.
    expect(read({ drawings: [], texts: [], onMap: { drawings: [ROOM] } })).toStrictEqual({ drawings: [], texts: [] });
    expect(read({ drawings: [], texts: [], onMap: 'none' })).toStrictEqual({ drawings: [], texts: [] });
  });

  it('are read by a reader of before as the lines, stamps and texts it knew, whatever more they say', () => {
    const told = { drawings: [ROOM, ARROW, { ...STAMP, turn: 45, order: 3 }], texts: [WRAPPED], onMap: { drawings: [ROOM], texts: [TEXT] } };
    expect(formerParseAnnotations(json(told) as Record<string, unknown>)).toStrictEqual({
      drawings: [
        { type: 'pen', points: ROOM.points, colour: ROOM.colour, width: 0, opacity: 0.4 },
        { type: 'pen', points: ARROW.points, colour: ARROW.colour, width: 3, opacity: 0.5 },
        STAMP,
      ],
      texts: [TEXT],
    });
  });
});

describe('a drawing under way in a `marks` message', () => {
  const marks = (strokes: unknown): MarksMessage | null => parseMarks(json({ scene: 's', lasers: [], measures: [], strokes }) as Record<string, unknown>);

  it('reads as it was written: a pen that grows, a shape told whole, the areas of cells, and one that was made', () => {
    const strokes = [
      { who: 'gm', n: 3, drawings: [PEN], from: 12, span: 100 },
      { who: 'a'.repeat(20), n: 1, drawings: [ROOM, ROOM] },
      { who: 'b'.repeat(20), n: 0, drawings: [], kept: true },
    ];
    expect(marks(strokes)?.strokes).toStrictEqual(strokes);
  });

  it('is left out where it cannot be read, and the rest of the message is read', () => {
    const bad = [
      { who: 'gm', n: -1, drawings: [PEN] },
      { who: 'nobody', n: 1, drawings: [PEN] },
      { who: 'gm', n: 1, drawings: [STAMP] },
      { who: 'gm', n: 1, drawings: [PEN, PEN], from: 0 },
      { who: 'gm', n: 1, drawings: [{ ...PEN, points: [] }] },
      { who: 'gm', n: 1, drawings: [PEN], span: -5 },
      { who: 'gm', n: 1, drawings: Array.from({ length: MAX_STROKE_DRAWINGS + 1 }, () => PEN) },
      { who: 'gm', n: 1, drawings: [{ ...PEN, points: Array.from({ length: MAX_STROKE_NUMBERS + 2 }, () => 1) }] },
    ];
    for (const stroke of bad) expect(marks([stroke]), JSON.stringify(stroke).slice(0, 80)).toStrictEqual({ t: 'marks', scene: 's', lasers: [], measures: [], strokes: [] });
    // One a sender: the first that can be read.
    expect(marks([bad[0], { who: 'gm', n: 2, drawings: [PEN] }, { who: 'gm', n: 3, drawings: [ROOM] }])?.strokes).toStrictEqual([{ who: 'gm', n: 2, drawings: [PEN] }]);
    expect(marks('none')).toStrictEqual({ t: 'marks', scene: 's', lasers: [], measures: [] });
  });
});
