import { describe, expect, it } from 'vitest';
import { annotationList } from '../../../src/app/annotations/annotationList';
import { annotationStack, reordered } from '../../../src/app/annotations/annotationStack';
import type { DrawingInput } from '../../../src/app/annotations/annotationTypes';
import type { DrawingStroke } from '../../../src/app/types';
import { CURVE, LABEL, LEVELS, PEN, ROOM, setup, shifted, type Setup } from './annotationFixtures';

describe('drawings and texts in the store', () => {
  it('adds each above everything of its level, one undo step each, and undo and redo take it back and bring it again', () => {
    const { store, steps, undo, redo, drawings, texts, shown } = setup();
    const pen = store.getState().addDrawing(PEN);
    const label = store.getState().addText(LABEL);
    const room = store.getState().addDrawing(ROOM);
    expect(steps()).toBe(3);
    expect(drawings()[pen]).toMatchObject({ id: pen, kind: 'drawing', ...PEN, order: 1 });
    expect(texts()[label]).toEqual({ id: label, kind: 'text', ...LABEL, order: 2 });
    expect(drawings()[room]).toMatchObject({ ...ROOM, order: 3 });
    // One order over both kinds: the text lies between the two drawings
    expect(shown()).toEqual([pen, label, room]);

    undo();
    expect(shown()).toEqual([pen, label]);
    undo();
    undo();
    expect(shown()).toEqual([]);
    redo();
    redo();
    expect(shown()).toEqual([pen, label]);
    expect(texts()[label]).toEqual({ id: label, kind: 'text', ...LABEL, order: 2 });
  });

  it('keeps the lists it is handed as its own copies, and an order its data names', () => {
    const { store, drawings } = setup();
    const frozen = Object.freeze({ ...ROOM, points: Object.freeze(ROOM.points.map((point) => Object.freeze({ ...point }))) }) as DrawingInput;
    const id = store.getState().addDrawing(frozen);
    expect(drawings()[id]!.points).toEqual(ROOM.points);
    expect(drawings()[id]!.points).not.toBe(frozen.points);
    expect(drawings()[id]!.holes![0]).not.toBe(ROOM.holes![0]);
    store.getState().moveAnnotations([id], 1, 1);
    expect(ROOM.points[0]).toEqual({ x: 0, y: 0 });

    const placed = store.getState().addDrawing({ ...PEN, order: -4 });
    expect(drawings()[placed]!.order).toBe(-4);
  });

  it('adds several drawings in one write', () => {
    const { store, steps, undo, shown, drawings } = setup();
    store.getState().addDrawing(PEN);
    const ids = store.getState().addDrawings([PEN, ROOM, CURVE]);
    expect(steps()).toBe(2);
    expect(ids.map((id) => drawings()[id]!.order)).toEqual([2, 3, 4]);
    expect(shown().slice(1)).toEqual(ids);
    expect(store.getState().addDrawings([])).toEqual([]);
    expect(steps()).toBe(2);
    undo();
    expect(shown()).toHaveLength(1);
  });

  it('puts what is added on the level shown and orders it among that level\'s only', () => {
    const { store, drawings, texts, shown } = setup(LEVELS, 'upper');
    const first = store.getState().addDrawing({ ...PEN, level: 'ground' });
    const label = store.getState().addText(LABEL);
    expect(drawings()[first]).toMatchObject({ level: 'upper', order: 1 });
    expect(texts()[label]).toMatchObject({ level: 'upper', order: 2 });

    store.getState().setViewedLevel('ground');
    const low = store.getState().addDrawing(PEN);
    expect(drawings()[low]).toMatchObject({ level: 'ground', order: 1 });
    expect(shown()).toEqual([low]);

    const flat = setup();
    const id = flat.store.getState().addDrawing(PEN);
    expect(flat.drawings()[id]).not.toHaveProperty('level');
  });

  it('changes drawings and texts in one write, each kind taking the fields it has', () => {
    const { store, steps, undo, drawings, texts } = setup();
    const pen = store.getState().addDrawing(PEN);
    const label = store.getState().addText(LABEL);
    const before = steps();

    store.getState().updateAnnotations([pen, label, 'gone'], { color: '#00ff00', hidden: true, layer: 'map', dash: 'dashed', bold: true, width: 12, opacity: 0.5 });
    expect(steps()).toBe(before + 1);
    expect(drawings()[pen]).toMatchObject({ color: '#00ff00', hidden: true, layer: 'map', dash: 'dashed', width: 12, opacity: 0.5 });
    expect(drawings()[pen]).not.toHaveProperty('bold');
    // A line's width and its see-through ink are no text's wrap width and plate
    expect(texts()[label]).toEqual({ id: label, kind: 'text', ...LABEL, order: 2, color: '#00ff00', hidden: true, layer: 'map', bold: true });

    undo();
    expect(drawings()[pen]).toMatchObject({ ...PEN, order: 1 });
    expect(drawings()[pen]).not.toHaveProperty('hidden');
    expect(texts()[label]).toEqual({ id: label, kind: 'text', ...LABEL, order: 2 });
  });

  it('removes a field changed to undefined, but none a drawing or text cannot be without', () => {
    const { store, drawings, texts } = setup();
    const room = store.getState().addDrawing({ ...ROOM, hidden: true, dash: 'dotted', group: 'g1' });
    const label = store.getState().addText({ ...LABEL, backgroundColor: '#000000', hidden: true, outline: true });

    store.getState().updateAnnotations([room, label], {
      hidden: undefined, fill: undefined, holes: undefined, dash: undefined, backgroundColor: undefined, points: undefined, color: undefined, text: undefined, x: undefined,
    });
    expect(drawings()[room]).toMatchObject({ points: ROOM.points, color: ROOM.color, group: 'g1' });
    for (const field of ['hidden', 'fill', 'holes', 'dash']) expect(drawings()[room]).not.toHaveProperty(field);
    expect(texts()[label]).toEqual({ id: label, kind: 'text', ...LABEL, order: 2, outline: true });
  });

  it('moves drawings with their anchors and holes, and texts, in one write', () => {
    const { store, steps, undo, drawings, texts } = setup();
    const room = store.getState().addDrawing(ROOM);
    const curve = store.getState().addDrawing(CURVE);
    const label = store.getState().addText(LABEL);
    const before = steps();

    store.getState().moveAnnotations([room, curve, label], 5, -3);
    expect(steps()).toBe(before + 1);
    expect(drawings()[room]!.points).toEqual(shifted(ROOM.points, 5, -3));
    expect(drawings()[room]!.holes).toEqual([shifted(ROOM.holes![0]!, 5, -3)]);
    expect(drawings()[curve]!.anchors).toEqual(shifted(CURVE.anchors!, 5, -3));
    expect(texts()[label]).toMatchObject({ x: 15, y: 17 });
    // The hints still fit: a moved curve keeps its anchors
    expect(annotationList(store.getState().objects).find(({ id }) => id === curve)).toMatchObject({ shape: 'line', anchors: shifted(CURVE.anchors!, 5, -3) });

    undo();
    expect(drawings()[room]!.holes).toEqual(ROOM.holes);
    expect(drawings()[curve]!.anchors).toEqual(CURVE.anchors);
  });

  it('gives each annotation of a group its own place in one write', () => {
    const { store, steps, drawings, texts } = setup();
    const curve = store.getState().addDrawing(CURVE);
    const label = store.getState().addText({ ...LABEL, width: 200 });
    const before = steps();
    const turned = CURVE.points.map(({ x, y }) => ({ x: -y, y: x }));

    store.getState().placeAnnotations({
      [curve]: { points: turned, anchors: undefined, width: 9 },
      [label]: { x: 99, y: 98, rotation: 90, width: 120, scale: 2 },
      gone: { x: 1 },
    });
    expect(steps()).toBe(before + 1);
    expect(drawings()[curve]).toMatchObject({ points: turned, width: 9 });
    expect(drawings()[curve]).not.toHaveProperty('anchors');
    expect(drawings()[curve]).not.toHaveProperty('x');
    expect(texts()[label]).toMatchObject({ x: 99, y: 98, rotation: 90, width: 120, scale: 2 });
  });

  it('deletes drawings and texts in one write and takes them out of the selection', () => {
    const { store, steps, undo, shown } = setup();
    const pen = store.getState().addDrawing(PEN);
    const label = store.getState().addText(LABEL);
    const room = store.getState().addDrawing(ROOM);
    store.getState().setSelection([pen, label, room]);
    const before = steps();

    store.getState().deleteAnnotations([pen, label, 'gone']);
    expect(steps()).toBe(before + 1);
    expect(shown()).toEqual([room]);
    expect(store.getState().selectedIds).toEqual([room]);
    undo();
    expect(shown()).toEqual([pen, label, room]);

    store.getState().deleteAnnotations(['gone']);
    expect(steps()).toBe(before);
  });

  it('replaces drawings by others in one write: the pieces keep every field they are handed, their order too', () => {
    const { store, steps, undo, redo, drawings, shown } = setup();
    const under = store.getState().addDrawing(PEN);
    const room = store.getState().addDrawing({ ...ROOM, hidden: true });
    const over = store.getState().addDrawing(PEN);
    store.getState().setSelection([room]);
    const before = steps();
    const { id: _id, kind: _kind, timestamp: _timestamp, points, holes: _holes, fill: _fill, ...look } = { ...drawings()[room]!, glow: 4 };

    const pieces = store.getState().replaceDrawings([room, 'gone'], [
      { ...look, points: points.slice(0, 2), group: 'cut' },
      { ...look, points: points.slice(2, 4), group: 'cut' },
    ]);
    expect(steps()).toBe(before + 1);
    expect(pieces).toHaveLength(2);
    expect(drawings()[room]).toBeUndefined();
    for (const piece of pieces) expect(drawings()[piece]).toMatchObject({ hidden: true, order: 2, group: 'cut', glow: 4, color: ROOM.color });
    // They lie where the room lay: over the stroke under it, under the one over it
    expect(shown()).toEqual([under, ...pieces, over]);
    expect(store.getState().selectedIds).toEqual([]);

    undo();
    expect(shown()).toEqual([under, room, over]);
    redo();
    expect(shown()).toEqual([under, ...pieces, over]);
  });

  it('leaves a piece of a drawing made before there was an order without one', () => {
    const { store, drawings, shown } = setup();
    const old = { id: 'old', kind: 'drawing', timestamp: 1, ...PEN } as DrawingStroke;
    store.setState({ objects: { ...store.getState().objects, drawings: { old } } });
    const newer = store.getState().addDrawing(PEN);
    const [piece] = store.getState().replaceDrawings(['old'], [PEN]);
    expect(drawings()[piece!]).not.toHaveProperty('order');
    expect(shown()).toEqual([piece, newer]);
  });
});

describe('the order of annotations', () => {
  it('brings some to the front or the back in one undo step, keeping the order they have among themselves', () => {
    const { store, steps, undo, shown, drawings, texts } = setup();
    const a = store.getState().addDrawing(PEN);
    const b = store.getState().addText(LABEL);
    const c = store.getState().addDrawing(ROOM);
    const d = store.getState().addText(LABEL);
    const before = steps();

    store.getState().orderAnnotations([b, a], 'front');
    expect(shown()).toEqual([c, d, a, b]);
    expect(steps()).toBe(before + 1);
    expect([drawings()[a]!.order, texts()[b]!.order]).toEqual([5, 6]);

    store.getState().orderAnnotations([b, d], 'back');
    expect(shown()).toEqual([d, b, c, a]);
    expect(steps()).toBe(before + 2);

    undo();
    expect(shown()).toEqual([c, d, a, b]);
    undo();
    expect(shown()).toEqual([a, b, c, d]);
  });

  it('writes nothing where they already lie so, and nothing for ids the level does not hold', () => {
    const { store, steps, shown } = setup(LEVELS, 'upper');
    const a = store.getState().addDrawing(PEN);
    const b = store.getState().addDrawing(PEN);
    store.getState().setViewedLevel('ground');
    const low = store.getState().addDrawing(PEN);
    store.getState().setViewedLevel('upper');
    const before = steps();

    store.getState().orderAnnotations([b], 'front');
    store.getState().orderAnnotations([a], 'back');
    store.getState().orderAnnotations([a, b], 'front');
    store.getState().orderAnnotations([low, 'gone'], 'front');
    store.getState().orderAnnotations([], 'back');
    expect(steps()).toBe(before);
    expect(shown()).toEqual([a, b]);
    expect(store.getState().objects.drawings[low]!.order).toBe(1);
  });

  it('orders annotations made before there was an order with the rest', () => {
    const { store, shown } = setup();
    const old = (id: string): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, ...PEN });
    store.setState({ objects: { ...store.getState().objects, drawings: { d1: old('d1'), d2: old('d2') }, texts: { t1: { id: 't1', kind: 'text', ...LABEL } } } });
    expect(shown()).toEqual(['t1', 'd1', 'd2']);
    store.getState().orderAnnotations(['t1'], 'front');
    expect(shown()).toEqual(['d1', 'd2', 't1']);
    store.getState().orderAnnotations(['d2'], 'back');
    expect(shown()).toEqual(['d2', 'd1', 't1']);

    const stack = annotationStack(store.getState());
    expect(reordered(stack, ['t1'], 'front')).toEqual([]);
    expect(reordered(stack, ['d1', 'd2'], 'front')).toEqual([{ id: 'd2', kind: 'drawings', order: 2 }, { id: 'd1', kind: 'drawings', order: 3 }]);
  });
});

describe('clearing annotations', () => {
  function filled(): Setup & { ids: Record<'above' | 'onMap' | 'hidden' | 'players' | 'label' | 'mapLabel' | 'low', string> } {
    const made = setup(LEVELS, 'ground');
    const { store } = made;
    const low = store.getState().addDrawing({ ...PEN, by: 'player-2' });
    store.getState().setViewedLevel('upper');
    const ids = {
      low,
      above: store.getState().addDrawing(PEN),
      onMap: store.getState().addDrawing({ ...ROOM, layer: 'map' }),
      hidden: store.getState().addDrawing({ ...PEN, hidden: true, locked: true }),
      players: store.getState().addDrawing({ ...PEN, by: 'player-1' }),
      label: store.getState().addText(LABEL),
      mapLabel: store.getState().addText({ ...LABEL, layer: 'map', by: 'player-1' }),
    };
    store.getState().setSelection(Object.values(ids));
    return { ...made, ids };
  }
  const all = (made: Setup): string[] => [...Object.keys(made.drawings()), ...Object.keys(made.texts())].sort();

  it('takes what lies above the tokens on the level shown, in one undo step, and leaves the map\'s and the other levels\'', () => {
    const made = filled();
    const { store, steps, undo, ids } = made;
    const before = steps();
    store.getState().clearAnnotations('above');
    expect(all(made)).toEqual([ids.low, ids.onMap, ids.mapLabel].sort());
    expect([...store.getState().selectedIds].sort()).toEqual([ids.low, ids.onMap, ids.mapLabel].sort());
    expect(steps()).toBe(before + 1);
    undo();
    expect(all(made)).toHaveLength(7);

    store.getState().clearAnnotations('above');
    store.getState().clearAnnotations('above');
    expect(steps()).toBe(before + 1);
  });

  it('takes everything drawn on the level shown', () => {
    const made = filled();
    made.store.getState().clearAnnotations('level');
    expect(all(made)).toEqual([made.ids.low]);
  });

  it('takes what players made on the level shown, on either layer', () => {
    const made = filled();
    const { ids } = made;
    made.store.getState().clearAnnotations('players');
    expect(all(made)).toEqual([ids.low, ids.above, ids.onMap, ids.hidden, ids.label].sort());
    made.store.getState().setViewedLevel('ground');
    made.store.getState().clearAnnotations('players');
    expect(all(made)).not.toContain(ids.low);
  });

  it('clears everything in a scene without levels, and is no undo step where there is nothing', () => {
    const { store, steps, shown } = setup();
    store.getState().clearAnnotations('level');
    expect(steps()).toBe(0);
    store.getState().addDrawing(PEN);
    store.getState().addText(LABEL);
    store.getState().clearAnnotations('level');
    expect(shown()).toEqual([]);
    expect(steps()).toBe(3);
  });
});
