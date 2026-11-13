import { describe, expect, it } from 'vitest';
import { annotationList, readDrawing } from '../../src/app/annotations/annotationList';
import { DEFAULT_DRAW_TOOL, type Annotation, type DrawingAnnotation } from '../../src/app/annotations/annotationTypes';
import { stampSize, strokeWidth, textHeight } from '../../src/app/annotations/drawSizes';
import { MIXED, shownLock, shownStyle, styleWrites, type StyleWrite } from '../../src/app/packages/components/toolbar/drawStyle';
import { SEE_THROUGH } from '../../src/app/annotations/madeDrawing';
import { FONT_FAMILIES, TEXT_PLATE } from '../../src/app/annotations/madeText';
import type { DrawingStroke, TextElement } from '../../src/app/types';

const CELL = 70;
const TOOL = DEFAULT_DRAW_TOOL;

const drawing = (id: string, fields: Partial<DrawingStroke>): DrawingStroke => ({
  id, kind: 'drawing', timestamp: 0, type: 'pen', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], color: '#ffffff', width: strokeWidth('m', CELL), opacity: 1, ...fields,
});
const text = (id: string, fields: Partial<TextElement>): TextElement => ({
  id, kind: 'text', x: 0, y: 0, text: 'Crypt', fontSize: textHeight('m', CELL), fontFamily: 'Arial', color: '#ffffff', ...fields,
});
const SQUARE = [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }, { x: 0, y: 0 }];

/** The annotations of these records as the bars read them, in the order given. */
function read(...records: (DrawingStroke | TextElement)[]): Annotation[] {
  const drawings: Record<string, DrawingStroke> = {};
  const texts: Record<string, TextElement> = {};
  for (const record of records) {
    if (record.kind === 'drawing') drawings[record.id] = record;
    else texts[record.id] = record;
  }
  const list = annotationList({ drawings, texts });
  return records.map((record) => list.find((annotation) => annotation.id === record.id)!);
}

const updates = (writes: StyleWrite[]): { ids: string[]; changes: unknown }[] => writes.map((write) => {
  if (write.kind !== 'update') throw new Error('a place where an update was expected');
  return { ids: write.ids, changes: write.changes };
});

describe('what the Draw tool\'s bars show', () => {
  it('shows what is drawn next while nothing is selected', () => {
    const tool = { ...TOOL, color: '#e93147', size: 'l' as const, dash: 'dotted' as const, font: 'mono' as const };
    expect(shownStyle(tool, [], CELL)).toEqual({
      color: '#e93147', size: 'l', players: true, layer: 'above', seeThrough: false, dash: 'dotted', ends: null, curved: false, fill: null,
      font: 'mono', look: 'outline', align: 'center', bold: false, italic: false, icon: 'door',
    });
  });

  it('shows the style the selected share, and none where they differ', () => {
    const red = drawing('a', { color: '#E93147', hidden: true, layer: 'map', opacity: 0.5, dash: 'dashed', ends: 'end', width: strokeWidth('xl', CELL) });
    const same = drawing('b', { color: '#e93147', hidden: true, layer: 'map', opacity: 0.5, dash: 'dashed', ends: 'end', width: strokeWidth('xl', CELL) });
    expect(shownStyle(TOOL, read(red, same), CELL)).toMatchObject({ color: '#e93147', players: false, layer: 'map', seeThrough: true, dash: 'dashed', ends: 'end', size: 'xl' });

    const other = drawing('c', { color: '#086ddd' });
    expect(shownStyle(TOOL, read(red, other), CELL)).toMatchObject({ color: MIXED, players: MIXED, layer: MIXED, seeThrough: MIXED, dash: MIXED, ends: MIXED, size: MIXED });
  });

  it('reads a size as its name on this map: a line\'s width, a stamp\'s side, a text\'s height with its scale', () => {
    const size = (...records: (DrawingStroke | TextElement)[]): unknown => shownStyle(TOOL, read(...records), CELL).size;
    expect(size(drawing('a', { width: strokeWidth('s', CELL) }))).toBe('s');
    expect(size(drawing('a', { type: 'icon', icon: 'skull', points: [{ x: 0, y: 0 }], width: stampSize('l', CELL) }))).toBe('l');
    expect(size(text('t', { fontSize: textHeight('m', CELL), scale: textHeight('xl', CELL) / textHeight('m', CELL) }))).toBe('xl');
    // A line and a text of one named size share it, whatever their pixels.
    expect(size(drawing('a', { width: strokeWidth('l', CELL) }), text('t', { fontSize: textHeight('l', CELL) }))).toBe('l');
    // On a map with larger cells the same pixels are a smaller size.
    expect(shownStyle(TOOL, read(drawing('a', { width: strokeWidth('l', CELL) })), 2 * CELL).size).toBe('m');
  });

  it('leaves a tool at the tool\'s own choice where nothing selected has such a style', () => {
    const tool = { ...TOOL, font: 'scifi' as const, fill: 'solid' as const, ends: 'both' as const, icon: 'gem' };
    const open = read(drawing('a', {}));
    expect(shownStyle(tool, open, CELL)).toMatchObject({ font: 'scifi', look: 'outline', bold: false, fill: 'solid', icon: 'gem', ends: null });
    // A closed line has a fill and no ends; a fill without a line has no size and no dash.
    const room = read(drawing('r', { type: 'line', points: SQUARE, fill: 'soft', width: 0 }));
    expect(shownStyle({ ...tool, size: 'xl', dash: 'dotted' }, room, CELL)).toMatchObject({ fill: 'soft', ends: 'both', size: 'xl', dash: 'dotted' });
  });

  it('reads a text\'s face, look, alignment and weight, and no face for one written before the tool had any', () => {
    const label = text('t', { fontFamily: FONT_FAMILIES.scifi, backgroundColor: '#000000', align: 'left', bold: true, italic: true });
    expect(shownStyle(TOOL, read(label), CELL)).toMatchObject({ font: 'scifi', look: 'plate', align: 'left', bold: true, italic: true });
    expect(shownStyle(TOOL, read(text('old', {})), CELL)).toMatchObject({ font: MIXED, look: 'plain', align: 'center', bold: false });
    expect(shownStyle(TOOL, read(text('o', { outline: true }), text('p', {})), CELL).look).toBe(MIXED);
  });

  it('reads a line as curved by its anchors, and a stamp\'s symbol', () => {
    const corners = [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 80, y: 0 }];
    const straight = drawing('s', { type: 'line', points: corners });
    expect(shownStyle({ ...TOOL, curved: true }, read(straight), CELL).curved).toBe(false);
    expect(shownStyle(TOOL, read(drawing('k', { type: 'icon', icon: 'skull', points: [{ x: 0, y: 0 }], width: 70 })), CELL).icon).toBe('skull');
  });

  it('says whether the selected are locked', () => {
    expect(shownLock([])).toBeNull();
    expect(shownLock(read(drawing('a', { locked: true }), text('t', { locked: true })))).toBe(true);
    expect(shownLock(read(drawing('a', {})))).toBe(false);
    expect(shownLock(read(drawing('a', { locked: true }), drawing('b', {})))).toBe(MIXED);
  });
});

describe('what a pick writes to the selected', () => {
  const pen = drawing('pen', {});
  const room = drawing('room', { type: 'line', points: SQUARE });
  const stamp = drawing('stamp', { type: 'icon', icon: 'skull', points: [{ x: 0, y: 0 }], width: 70 });
  const label = text('label', { scale: 2 });
  const all = read(pen, room, stamp, label);

  it('writes nothing with nothing selected, or where nothing selected has such a style', () => {
    expect(styleWrites('color', '#e93147', [], CELL)).toEqual([]);
    expect(styleWrites('font', 'mono', read(pen, stamp), CELL)).toEqual([]);
    expect(styleWrites('icon', 'gem', read(pen, label), CELL)).toEqual([]);
    expect(styleWrites('fill', 'solid', read(pen), CELL)).toEqual([]);
  });

  it('gives all of them a colour, and shows or hides them, and lays them on the map or above', () => {
    expect(updates(styleWrites('color', '#e93147', all, CELL))).toEqual([{ ids: ['pen', 'room', 'stamp', 'label'], changes: { color: '#e93147' } }]);
    expect(updates(styleWrites('players', false, all, CELL))[0]!.changes).toEqual({ hidden: true });
    expect(updates(styleWrites('players', true, all, CELL))[0]!.changes).toEqual({ hidden: undefined });
    expect(updates(styleWrites('layer', 'map', all, CELL))[0]!.changes).toEqual({ layer: 'map' });
    expect(updates(styleWrites('layer', 'above', all, CELL))[0]!.changes).toEqual({ layer: undefined });
  });

  it('writes a size as pixels of this map: lines and texts in one write, stamps in another, and a text without its scale', () => {
    expect(updates(styleWrites('size', 'l', all, CELL))).toEqual([
      // A text set in another size breaks its lines elsewhere: what it saved of them goes with the write.
      { ids: ['pen', 'room', 'label'], changes: { width: strokeWidth('l', CELL), fontSize: textHeight('l', CELL), scale: undefined, breaks: undefined } },
      { ids: ['stamp'], changes: { width: stampSize('l', CELL) } },
    ]);
    expect(updates(styleWrites('size', 's', read(stamp), CELL))).toEqual([{ ids: ['stamp'], changes: { width: stampSize('s', CELL) } }]);
    // A fill without a line gets none.
    expect(styleWrites('size', 'l', read(drawing('fill', { type: 'line', points: SQUARE, fill: 'solid', width: 0 })), CELL)).toEqual([]);
  });

  it('writes a line\'s look to lines alone: see-through ink, dashes, arrowheads on open lines, a fill on closed ones', () => {
    expect(updates(styleWrites('seeThrough', true, all, CELL))).toEqual([{ ids: ['pen', 'room'], changes: { opacity: SEE_THROUGH } }]);
    expect(updates(styleWrites('seeThrough', false, all, CELL))[0]!.changes).toEqual({ opacity: 1 });
    expect(updates(styleWrites('dash', 'dotted', all, CELL))).toEqual([{ ids: ['pen', 'room'], changes: { dash: 'dotted' } }]);
    expect(updates(styleWrites('dash', null, all, CELL))[0]!.changes).toEqual({ dash: undefined });
    expect(updates(styleWrites('ends', 'both', all, CELL))).toEqual([{ ids: ['pen'], changes: { ends: 'both' } }]);
    expect(updates(styleWrites('ends', null, all, CELL))[0]!.changes).toEqual({ ends: undefined });
    expect(updates(styleWrites('fill', 'soft', all, CELL))).toEqual([{ ids: ['room'], changes: { fill: 'soft' } }]);
    expect(updates(styleWrites('fill', null, all, CELL))[0]!.changes).toEqual({ fill: undefined });
  });

  it('writes a text\'s face, look, alignment and weight to texts alone, and a symbol to stamps alone', () => {
    // Another face or weight sets the words in other letters: the saved line breaks go, and are worked out anew.
    expect(updates(styleWrites('font', 'medieval', all, CELL))).toEqual([{ ids: ['label'], changes: { fontFamily: FONT_FAMILIES.medieval, breaks: undefined } }]);
    expect(updates(styleWrites('align', 'right', all, CELL))).toEqual([{ ids: ['label'], changes: { align: 'right' } }]);
    expect(updates(styleWrites('bold', true, all, CELL))[0]!.changes).toEqual({ bold: true, breaks: undefined });
    expect(updates(styleWrites('italic', false, all, CELL))[0]!.changes).toEqual({ italic: false, breaks: undefined });
    // A look is a text's own write: the plate is the chip texts always had, see-through as it was, and goes whole.
    const plate = { backgroundColor: undefined, padding: undefined, borderRadius: undefined };
    expect(styleWrites('look', 'outline', all, CELL)).toEqual([{ kind: 'text', ids: ['label'], changes: { ...plate, outline: true } }]);
    expect(styleWrites('look', 'plain', all, CELL)).toEqual([{ kind: 'text', ids: ['label'], changes: { ...plate, outline: undefined } }]);
    expect(styleWrites('look', 'plate', all, CELL)).toEqual([{ kind: 'text', ids: ['label'], changes: { ...TEXT_PLATE, outline: undefined } }]);
    expect(updates(styleWrites('icon', 'gem', all, CELL))).toEqual([{ ids: ['stamp'], changes: { icon: 'gem' } }]);
  });

  it('turns a line with corners into a curve through them and back, each a line the reader takes as such', () => {
    const corners = [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 80, y: 0 }];
    const straight = read(drawing('s', { type: 'line', points: corners }))[0] as DrawingAnnotation;
    const [curve] = styleWrites('curved', true, [straight], CELL);
    if (curve?.kind !== 'place') throw new Error('no place written');
    const place = curve.places.s!;
    expect(place.anchors).toEqual(corners);
    expect(place.points!.length).toBeGreaterThan(corners.length);
    expect(place.points![0]).toEqual(corners[0]);
    expect(place.points!.at(-1)).toEqual(corners[2]);
    const curved = readDrawing('s', { ...straight.record, ...place })!;
    expect(curved).toMatchObject({ shape: 'line', anchors: corners, closed: false });
    // Already as asked: nothing to write.
    expect(styleWrites('curved', true, [curved], CELL)).toEqual([]);
    expect(styleWrites('curved', false, [straight], CELL)).toEqual([]);

    const [back] = styleWrites('curved', false, [curved], CELL);
    expect(back).toEqual({ kind: 'place', places: { s: { points: corners, anchors: undefined } } });
  });

  it('curves a closed line through its corners and gives them back with the first again', () => {
    const closed = read(drawing('r', { type: 'line', points: SQUARE }))[0] as DrawingAnnotation;
    const [curve] = styleWrites('curved', true, [closed], CELL);
    if (curve?.kind !== 'place') throw new Error('no place written');
    const place = curve.places.r!;
    expect(place.anchors).toEqual(SQUARE.slice(0, -1));
    expect(place.points!.at(-1)).toEqual(SQUARE[0]);
    const curved = readDrawing('r', { ...closed.record, ...place })!;
    expect(curved).toMatchObject({ shape: 'line', closed: true });
    expect(curved.anchors).toHaveLength(4);
    const [back] = styleWrites('curved', false, [curved], CELL);
    expect(back).toEqual({ kind: 'place', places: { r: { points: SQUARE, anchors: undefined } } });
  });
});
