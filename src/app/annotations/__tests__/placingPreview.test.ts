import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import { DEFAULT_DRAW_TOOL, DRAW_SIZES, type DrawMode, type DrawToolChoices } from '../annotationTypes';
import { cellGrid } from '../cellGrid';
import { stampSize, strokeWidth } from '../drawSizes';
import { SEE_THROUGH } from '../madeDrawing';
import { PLACING_LOOK, placingMark, type PlacingAt } from '../placingPreview';
import { HALO } from '../textLook';

const CELL = 70;
const SQUARES: GridGeometry = { type: 'square', size: CELL, offsetX: 0, offsetY: 0 };
const HEXES: GridGeometry = { type: 'hex-vertical', size: CELL, offsetX: 0, offsetY: 0 };

const tool = (choices: Partial<DrawToolChoices> = {}): DrawToolChoices => ({ ...DEFAULT_DRAW_TOOL, ...choices });
const at = (mode: DrawMode | null, more: Partial<PlacingAt> = {}): PlacingAt =>
  ({ mode, tool: tool(), cell: CELL, snapGrid: SQUARES, cells: null, bounds: null, zoom: 1, pointer: { x: 100, y: 170 }, free: false, ...more });

describe('what the Draw tool shows under the pointer', () => {
  it('shows nothing where a press places nothing of its own: Select, Text, the eraser, no tool', () => {
    for (const mode of ['select', 'text', 'eraser', null] as const) expect(placingMark(at(mode)), String(mode)).toBeNull();
  });

  it('shows the stamp itself, see-through, on the cell it will land on', () => {
    const mark = placingMark(at('stamp', { tool: tool({ icon: 'skull', color: '#00ff00', size: 'm' }) }));
    expect(mark).toMatchObject({
      kind: 'stamp',
      alpha: PLACING_LOOK.stampAlpha,
      stamp: { type: 'icon', icon: 'skull', color: '#00ff00', width: stampSize('m', CELL), opacity: 1, points: [{ x: 105, y: 175 }] },
    });
  });

  it('places the stamp where the press will: where cells meet for one two cells wide, at the pointer with Alt or without a grid to snap to', () => {
    const centre = (more: Partial<PlacingAt>): unknown => {
      const mark = placingMark(at('stamp', more));
      return mark?.kind === 'stamp' ? mark.stamp.points[0] : null;
    };
    expect(centre({ tool: tool({ size: 'l' }) })).toEqual({ x: 70, y: 140 });
    expect(centre({ free: true })).toEqual({ x: 100, y: 170 });
    expect(centre({ snapGrid: null })).toEqual({ x: 100, y: 170 });
  });

  it('shows the pen a dot as wide as its line, at the pointer, in its ink', () => {
    for (const size of DRAW_SIZES) {
      expect(placingMark(at('pen', { tool: tool({ size, color: '#ff0000' }), zoom: 4 }))).toMatchObject({
        kind: 'dot', at: { x: 100, y: 170 }, radius: strokeWidth(size, CELL) / 2, color: '#ff0000', alpha: 1,
      });
    }
    expect(placingMark(at('pen', { tool: tool({ seeThrough: true }) }))).toMatchObject({ kind: 'dot', alpha: SEE_THROUGH });
  });

  it('shows a line, a rectangle and an ellipse a dot where the shape will start: the grid point the press takes, or the pointer with Alt', () => {
    for (const mode of ['line', 'rectangle', 'ellipse'] as const) {
      // The nearest of a cell's corners, its centre and the middles of its edges.
      expect(placingMark(at(mode, { pointer: { x: 68, y: 73 } })), mode).toMatchObject({ kind: 'dot', at: { x: 70, y: 70 }, radius: strokeWidth('m', CELL) / 2 });
      expect(placingMark(at(mode, { pointer: { x: 68, y: 73 }, free: true })), mode).toMatchObject({ kind: 'dot', at: { x: 68, y: 73 } });
      expect(placingMark(at(mode, { pointer: { x: 68, y: 73 }, snapGrid: null })), mode).toMatchObject({ kind: 'dot', at: { x: 68, y: 73 } });
    }
    // See-through ink is the line's, not a box's.
    expect(placingMark(at('line', { tool: tool({ seeThrough: true }) }))).toMatchObject({ alpha: SEE_THROUGH });
    expect(placingMark(at('rectangle', { tool: tool({ seeThrough: true }) }))).toMatchObject({ alpha: 1 });
  });

  it('never draws a dot less than four screen pixels across, and keeps its ring as wide on screen at every zoom', () => {
    for (const zoom of [0.1, 0.25, 0.5, 1, 2, 8]) {
      for (const size of DRAW_SIZES) {
        const mark = placingMark(at('pen', { tool: tool({ size }), zoom }));
        if (mark?.kind !== 'dot') throw new Error('The pen shows a dot');
        expect(mark.radius * 2 * zoom).toBeGreaterThanOrEqual(PLACING_LOOK.minDot - 1e-9);
        // As wide as the line wherever the line is wide enough to see.
        if (strokeWidth(size, CELL) * zoom >= PLACING_LOOK.minDot) expect(mark.radius * 2).toBeCloseTo(strokeWidth(size, CELL));
        expect(mark.ring.width * zoom).toBeCloseTo(PLACING_LOOK.ring);
      }
    }
  });

  it('rings a light colour in a dark tone and a dark colour in a light one', () => {
    const ring = (color: string): string | null => {
      const mark = placingMark(at('pen', { tool: tool({ color }) }));
      return mark?.kind === 'dot' ? mark.ring.color : null;
    };
    expect(ring('#ffffff')).toBe(HALO.dark);
    expect(ring('#ffcc00')).toBe(HALO.dark);
    expect(ring('#000000')).toBe(HALO.light);
    expect(ring('#1a237e')).toBe(HALO.light);
  });

  it('shows the Cells mode the cell under the pointer, to be filled in the tool\'s colour or cleared', () => {
    const cells = cellGrid(SQUARES);
    const mark = placingMark(at('cells', { cells, tool: tool({ color: '#3366ff' }) }));
    expect(mark).toMatchObject({ kind: 'cell', color: '#3366ff', unfill: false });
    if (mark?.kind !== 'cell') throw new Error('The Cells mode shows a cell');
    expect(mark.parts).toEqual([{ outline: [{ x: 70, y: 140 }, { x: 140, y: 140 }, { x: 140, y: 210 }, { x: 70, y: 210 }], holes: [] }]);
    // The same cell under another point of it, another under a point of the next.
    expect(placingMark(at('cells', { cells, pointer: { x: 139, y: 141 } }))).toMatchObject({ key: mark.key });
    expect(placingMark(at('cells', { cells, pointer: { x: 141, y: 141 } }))).not.toMatchObject({ key: mark.key });
    expect(placingMark(at('cells', { cells, tool: tool({ cellsUnfill: true }) }))).toMatchObject({ kind: 'cell', unfill: true, parts: mark.parts });
    // Without cells to fill there is nothing to show.
    expect(placingMark(at('cells'))).toBeNull();
  });

  it('shows a hex its six corners', () => {
    const mark = placingMark(at('cells', { cells: cellGrid(HEXES) }));
    if (mark?.kind !== 'cell') throw new Error('The Cells mode shows a cell');
    expect(mark.parts).toHaveLength(1);
    expect(mark.parts[0]!.outline).toHaveLength(6);
  });

  it('ends a cell to fill at the map\'s edge, shows none off the map, and shows a cell to clear whole', () => {
    const cells = cellGrid(SQUARES);
    const bounds = { minX: 0, minY: 0, maxX: 105, maxY: 500 };
    const cut = placingMark(at('cells', { cells, bounds }));
    if (cut?.kind !== 'cell') throw new Error('The Cells mode shows a cell');
    const xs = cut.parts.flatMap(({ outline }) => outline.map(({ x }) => x));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([70, 105]);
    expect(placingMark(at('cells', { cells, bounds, pointer: { x: 300, y: 170 } }))).toBeNull();
    const cleared = placingMark(at('cells', { cells, bounds, tool: tool({ cellsUnfill: true }) }));
    if (cleared?.kind !== 'cell') throw new Error('The Cells mode shows a cell');
    expect(Math.max(...cleared.parts.flatMap(({ outline }) => outline.map(({ x }) => x)))).toBe(140);
  });
});
