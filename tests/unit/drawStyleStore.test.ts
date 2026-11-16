import { describe, expect, it } from 'vitest';
import { strokeWidth, textHeight } from '../../src/app/annotations/drawSizes';
import { pickDrawStyle, selectedAnnotations, stepDrawSize } from '../../src/app/packages/components/toolbar/drawStyleStore';
import { LABEL, LEVELS, PEN, ROOM, setup } from './annotations/annotationFixtures';

// The store's map has no grid: sizes are shares of a 70 px cell.
const CELL = 70;

describe('a pick in the Draw tool\'s bars', () => {
  it('becomes what is drawn next while nothing is selected, without an undo step', () => {
    const { store, steps, drawings } = setup();
    store.getState().setActiveTool('draw');
    const pen = store.getState().addDrawing(PEN);
    const before = steps();
    pickDrawStyle(store, 'color', '#e93147');
    pickDrawStyle(store, 'dash', 'dashed');
    expect(store.getState().drawTool).toMatchObject({ color: '#e93147', dash: 'dashed' });
    expect(drawings()[pen]).toMatchObject({ color: PEN.color });
    expect(steps()).toBe(before);
  });

  it('changes the selected drawings and texts in one undo step, and with the move tool (the bar under a selection) leaves what is drawn next alone', () => {
    const { store, steps, undo, drawings, texts } = setup();
    const pen = store.getState().addDrawing(PEN);
    const label = store.getState().addText(LABEL);
    const other = store.getState().addDrawing(PEN);
    store.getState().setActiveTool('move');
    store.getState().setSelection([pen, label, 'a-token']);
    expect(selectedAnnotations(store.getState()).map(({ id }) => id)).toEqual([pen, label]);
    const before = steps();

    pickDrawStyle(store, 'color', '#e93147');
    expect(drawings()[pen]!.color).toBe('#e93147');
    expect(texts()[label]!.color).toBe('#e93147');
    expect(drawings()[other]!.color).toBe(PEN.color);
    expect(store.getState().drawTool.color).toBe('#ffffff');
    expect(steps()).toBe(before + 1);

    // A size is two writes where stamps are among them, and still one step; here a line and a text.
    pickDrawStyle(store, 'size', 'xl');
    expect(drawings()[pen]!.width).toBeCloseTo(strokeWidth('xl', CELL));
    expect(texts()[label]!.fontSize).toBeCloseTo(textHeight('xl', CELL));
    expect(steps()).toBe(before + 2);
    undo();
    expect(drawings()[pen]!.width).toBe(PEN.width);
    expect(texts()[label]!.fontSize).toBe(LABEL.fontSize);
    undo();
    expect(drawings()[pen]!.color).toBe(PEN.color);
  });

  it('sizes lines and stamps in one step, each by its own share of the cell', () => {
    const { store, steps, undo, drawings } = setup();
    const pen = store.getState().addDrawing(PEN);
    const stamp = store.getState().addDrawing({ type: 'icon', icon: 'skull', points: [{ x: 0, y: 0 }], color: '#ffffff', width: 70, opacity: 1 });
    store.getState().setActiveTool('move');
    store.getState().setSelection([pen, stamp]);
    const before = steps();
    pickDrawStyle(store, 'size', 'l');
    expect(drawings()[pen]!.width).toBeCloseTo(CELL / 6);
    expect(drawings()[stamp]!.width).toBe(2 * CELL);
    expect(steps()).toBe(before + 1);
    undo();
    expect(drawings()[pen]!.width).toBe(PEN.width);
    expect(drawings()[stamp]!.width).toBe(70);
  });

  it('is the tool\'s own where nothing selected has such a style, in the Draw tool; with the move tool it changes nothing', () => {
    const { store, steps } = setup();
    const pen = store.getState().addDrawing(PEN);
    store.getState().setActiveTool('move');
    store.getState().setSelection([pen]);
    const before = steps();
    pickDrawStyle(store, 'font', 'mono');
    expect(store.getState().drawTool.font).not.toBe('mono');
    store.getState().setActiveTool('draw');
    store.getState().setSelection([pen]);
    pickDrawStyle(store, 'font', 'mono');
    expect(store.getState().drawTool.font).toBe('mono');
    expect(steps()).toBe(before);
  });

  it('changes the one just made and what is drawn next alike in a mode that makes something', () => {
    const { store, steps, drawings } = setup();
    store.getState().setActiveTool('draw');
    store.getState().setDrawTool({ mode: 'pen' });
    const pen = store.getState().addDrawing(PEN);
    store.getState().setSelection([pen]);
    const before = steps();
    pickDrawStyle(store, 'color', '#086ddd');
    expect(drawings()[pen]!.color).toBe('#086ddd');
    expect(store.getState().drawTool.color).toBe('#086ddd');
    expect(steps()).toBe(before + 1);
  });

  it('curves a selected line in one step, which undo takes back', () => {
    const { store, steps, undo, drawings } = setup();
    const room = store.getState().addDrawing(ROOM);
    store.getState().setActiveTool('move');
    store.getState().setSelection([room]);
    const before = steps();
    pickDrawStyle(store, 'curved', true);
    expect(drawings()[room]!.anchors).toEqual(ROOM.points.slice(0, -1));
    expect(drawings()[room]!.points.length).toBeGreaterThan(ROOM.points.length);
    expect(steps()).toBe(before + 1);
    undo();
    expect(drawings()[room]!.points).toEqual(ROOM.points);
    expect(drawings()[room]!.anchors).toBeUndefined();
  });

  it('reaches only what is selected on the level shown', () => {
    const { store, drawings } = setup(LEVELS, 'ground');
    const below = store.getState().addDrawing(PEN);
    store.setState({ viewedLevel: 'upper' });
    const above = store.getState().addDrawing(PEN);
    store.getState().setActiveTool('move');
    store.getState().setSelection([below, above]);
    pickDrawStyle(store, 'color', '#e93147');
    expect(drawings()[above]!.color).toBe('#e93147');
    expect(drawings()[below]!.color).toBe(PEN.color);
  });
});

describe('stepping the size', () => {
  it('steps the tool\'s size and stops at the ends', () => {
    const { store } = setup();
    store.getState().setActiveTool('draw');
    expect(store.getState().drawTool.size).toBe('m');
    stepDrawSize(store, 1);
    stepDrawSize(store, 1);
    stepDrawSize(store, 1);
    expect(store.getState().drawTool.size).toBe('xl');
    for (let step = 0; step < 5; step++) stepDrawSize(store, -1);
    expect(store.getState().drawTool.size).toBe('s');
  });

  it('steps the size the selected have, from the tool\'s where they differ', () => {
    const { store, drawings } = setup();
    const thin = store.getState().addDrawing({ ...PEN, width: strokeWidth('s', CELL) });
    const thick = store.getState().addDrawing({ ...PEN, width: strokeWidth('xl', CELL) });
    store.getState().setActiveTool('move');
    store.getState().setSelection([thin]);
    stepDrawSize(store, 1);
    expect(drawings()[thin]!.width).toBeCloseTo(strokeWidth('m', CELL));
    store.getState().setSelection([thin, thick]);
    stepDrawSize(store, 1);
    expect(drawings()[thin]!.width).toBeCloseTo(strokeWidth('l', CELL));
    expect(drawings()[thick]!.width).toBeCloseTo(strokeWidth('l', CELL));
  });
});
