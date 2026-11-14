import { describe, expect, it } from 'vitest';
import { pickDrawStyle } from '../../../src/app/packages/components/toolbar/drawStyleStore';
import { LABEL, PEN, ROOM, setup, shifted, type Setup } from './annotationFixtures';

/** A locked drawing and a locked text beside a free drawing and a free text, all selected, the history empty. */
function locked(): Setup & { pen: string; label: string; free: string; note: string; before: { pen: unknown; label: unknown } } {
  const made = setup();
  const state = made.store.getState();
  const pen = state.addDrawing({ ...PEN, locked: true });
  const label = state.addText({ ...LABEL, locked: true });
  const free = state.addDrawing(ROOM);
  const note = state.addText({ ...LABEL, x: 300 });
  state.setSelection([pen, label, free, note]);
  const before = { pen: made.drawings()[pen], label: made.texts()[label] };
  return { ...made, pen, label, free, note, before };
}

/** The locked drawing and text are the very records they were. */
function expectUntouched(s: ReturnType<typeof locked>): void {
  expect(s.drawings()[s.pen]).toBe(s.before.pen);
  expect(s.texts()[s.label]).toBe(s.before.label);
}

describe('a locked drawing or text in the store', () => {
  it('takes no style, and is neither hidden nor put on the map, while the others selected with it are', () => {
    const s = locked();
    const ids = [s.pen, s.label, s.free, s.note];
    s.store.getState().updateAnnotations(ids, { color: '#000000' });
    s.store.getState().updateAnnotations(ids, { hidden: true });
    s.store.getState().updateAnnotations(ids, { layer: 'map' });
    s.store.getState().updateAnnotations(ids, { locked: true });
    expectUntouched(s);
    expect(s.drawings()[s.free]).toMatchObject({ color: '#000000', hidden: true, layer: 'map', locked: true });
    expect(s.texts()[s.note]).toMatchObject({ color: '#000000', hidden: true, layer: 'map', locked: true });
  });

  it('is no undo step where it alone was to change', () => {
    const s = locked();
    const state = s.store.getState();
    const before = s.steps();
    state.updateAnnotations([s.pen, s.label], { color: '#000000', hidden: true });
    state.updateText(s.label, { text: 'Other' });
    state.moveAnnotations([s.pen, s.label], 10, 10);
    state.placeAnnotations({ [s.pen]: { rotation: 90 }, [s.label]: { x: 0, y: 0, rotation: 90, scale: 2 } });
    state.deleteAnnotations([s.pen, s.label]);
    state.orderAnnotations([s.pen, s.label], 'front');
    state.replaceDrawings([s.pen], [PEN]);
    state.removeMapObjects([s.pen, s.label]);
    expectUntouched(s);
    expect(s.steps()).toBe(before);
  });

  it('takes its unlocking, and with it nothing else the same write names', () => {
    const s = locked();
    s.store.getState().updateAnnotations([s.pen, s.label], { locked: undefined, color: '#000000' });
    expect(s.drawings()[s.pen]).not.toHaveProperty('locked');
    expect(s.drawings()[s.pen]).toMatchObject({ color: PEN.color });
    expect(s.texts()[s.label]).not.toHaveProperty('locked');
    expect(s.texts()[s.label]).toMatchObject({ color: LABEL.color });
    // Unlocked, they change like any other.
    s.store.getState().updateAnnotations([s.pen, s.label], { color: '#000000' });
    expect(s.drawings()[s.pen]).toMatchObject({ color: '#000000' });
    expect(s.texts()[s.label]).toMatchObject({ color: '#000000' });
  });

  it('keeps its words', () => {
    const s = locked();
    s.store.getState().updateText(s.label, { text: 'Other' });
    s.store.getState().updateText(s.note, { text: 'Other' });
    expectUntouched(s);
    expect(s.texts()[s.note]).toMatchObject({ text: 'Other' });
  });

  it('stays where it is when a group it is part of is moved, turned or scaled', () => {
    const s = locked();
    const ids = [s.pen, s.label, s.free, s.note];
    s.store.getState().moveAnnotations(ids, 10, 20);
    expectUntouched(s);
    expect(s.drawings()[s.free]!.points).toEqual(shifted(ROOM.points, 10, 20));
    expect(s.texts()[s.note]).toMatchObject({ x: 310, y: LABEL.y + 20 });

    s.store.getState().placeAnnotations({
      [s.pen]: { points: shifted(PEN.points, 5, 5), rotation: 45 },
      [s.label]: { x: 99, y: 99, rotation: 45, scale: 2 },
      [s.free]: { rotation: 45 },
      [s.note]: { x: 400, y: 400, rotation: 45, scale: 2 },
    });
    expectUntouched(s);
    expect(s.drawings()[s.free]).toMatchObject({ rotation: 45 });
    expect(s.texts()[s.note]).toMatchObject({ x: 400, y: 400, rotation: 45, scale: 2 });
  });

  it('is not deleted, by the menu or by Delete, Backspace and cut, and stays selected', () => {
    const s = locked();
    s.store.getState().deleteAnnotations([s.pen, s.label, s.free]);
    expectUntouched(s);
    expect(s.drawings()[s.free]).toBeUndefined();
    expect(s.store.getState().selectedIds).toEqual([s.pen, s.label, s.note]);
    // What the Delete key and a cut call.
    s.store.getState().deleteSelected();
    expectUntouched(s);
    expect(s.texts()[s.note]).toBeUndefined();
    expect(s.store.getState().selectedIds).toEqual([s.pen, s.label]);
    s.store.getState().removeMapObjects([s.pen, s.label]);
    expectUntouched(s);
  });

  it('keeps its place in the order, while the others go to the front or the back around it', () => {
    const s = locked();
    expect(s.shown()).toEqual([s.pen, s.label, s.free, s.note]);
    s.store.getState().orderAnnotations([s.pen, s.label], 'front');
    expect(s.shown()).toEqual([s.pen, s.label, s.free, s.note]);
    s.store.getState().orderAnnotations([s.pen, s.label, s.note], 'back');
    expect(s.shown()).toEqual([s.note, s.pen, s.label, s.free]);
    expectUntouched(s);
  });

  it('is not cut by the eraser\'s write: neither it nor its pieces', () => {
    const s = locked();
    expect(s.store.getState().replaceDrawings([s.pen], [PEN, PEN])).toEqual([]);
    expect(s.store.getState().replaceDrawings([s.free, s.pen], [PEN])).toEqual([]);
    expectUntouched(s);
    expect(Object.keys(s.drawings())).toEqual([s.pen, s.free]);
  });

  it('takes no pick of the bars, in Select mode', () => {
    const s = locked();
    s.store.getState().setActiveTool('move');
    const before = s.steps();
    pickDrawStyle(s.store, 'color', '#e93147');
    pickDrawStyle(s.store, 'size', 'xl');
    pickDrawStyle(s.store, 'players', false);
    pickDrawStyle(s.store, 'layer', 'map');
    expectUntouched(s);
    expect(s.drawings()[s.free]).toMatchObject({ color: '#e93147', hidden: true, layer: 'map' });
    expect(s.texts()[s.note]).toMatchObject({ color: '#e93147', hidden: true, layer: 'map' });
    expect(s.steps()).toBe(before + 4);
    // With nothing else selected a pick is no undo step at all.
    s.store.getState().setSelection([s.pen, s.label]);
    pickDrawStyle(s.store, 'color', '#000000');
    expectUntouched(s);
    expect(s.steps()).toBe(before + 4);
  });

  it('is copied: a duplicate is not locked, and the original stays so', () => {
    const s = locked();
    const copies = s.store.getState().duplicateMapObjects([s.pen, s.label]);
    expect(copies).toHaveLength(2);
    expectUntouched(s);
    for (const id of copies) {
      const copy = s.drawings()[id] ?? s.texts()[id];
      expect(copy).toBeDefined();
      expect(copy).not.toHaveProperty('locked');
    }
    expect(s.store.getState().selectedIds).toEqual(copies);
  });

  it('goes when the level is cleared', () => {
    const s = locked();
    s.store.getState().clearAnnotations('level');
    expect([s.drawings(), s.texts()]).toEqual([{}, {}]);
  });
});
