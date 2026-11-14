import { describe, expect, it } from 'vitest';
import { readSelection } from '../../../src/app/pixi/annotations/annotationSelection';
import { LABEL, PEN, setup } from './annotationFixtures';

describe('the selection as the pointer and the handles read it', () => {
  function selection(tool: 'draw' | 'move') {
    const { store } = setup();
    const state = store.getState();
    store.setState({ objects: { ...state.objects, tokens: { orc: { id: 'orc', kind: 'token', imagePath: 'orc.png', x: 35, y: 35, size: 1 } } } });
    const ids = [state.addDrawing(PEN), state.addDrawing({ ...PEN, locked: true }), state.addDrawing({ ...PEN, layer: 'map' }), state.addText(LABEL)];
    state.setActiveTool(tool);
    return { store, ids };
  }

  it('frames every selected one in the Draw tool, and moves those that are not locked', () => {
    const { store, ids } = selection('draw');
    store.getState().setSelection(['orc', ...ids]);
    const read = readSelection(store.getState(), undefined);
    expect(read.scope).toBe('made');
    expect(read.framed.map(({ id }) => id)).toEqual(ids);
    expect(read.movable.map(({ id }) => id)).toEqual([ids[0], ids[2], ids[3]]);
    expect(read.handles).not.toBeNull();
    expect(read.withTokens).toBe(false);
  });

  it('frames every selected one with the move tool, on the map and locked ones too, and nothing while a token is selected with it, which then moves with the tokens', () => {
    const { store, ids } = selection('move');
    store.getState().setSelection(ids);
    const alone = readSelection(store.getState(), undefined);
    expect(alone.framed.map(({ id }) => id)).toEqual(ids);
    expect([...alone.framedIds]).toEqual(ids);
    expect(alone.movable.map(({ id }) => id)).toEqual([ids[0], ids[2], ids[3]]);
    store.getState().setSelection(['orc', ...ids]);
    const mixed = readSelection(store.getState(), undefined, alone);
    expect(mixed.withTokens).toBe(true);
    expect(mixed.framed).toEqual([]);
    expect(mixed.handles).toBeNull();
    expect(mixed.movable.map(({ id }) => id)).toEqual([ids[0], ids[2], ids[3]]);
  });

  it('is the same object again while nothing it reads is another: a token that moves works nothing out', () => {
    const { store, ids } = selection('move');
    store.getState().setSelection(ids);
    const first = readSelection(store.getState(), undefined);
    expect(readSelection(store.getState(), undefined, first)).toBe(first);
    store.getState().setTokenPositions([{ id: 'orc', x: 105, y: 105 }]);
    expect(readSelection(store.getState(), undefined, first)).toBe(first);
    // Another tool, another selection and another drawing are each another reading.
    store.getState().setActiveTool('draw');
    const drawing = readSelection(store.getState(), undefined, first);
    expect(drawing).not.toBe(first);
    expect(drawing.framed).toHaveLength(4);
    store.getState().updateAnnotations([ids[0]!], { color: '#000000' });
    expect(readSelection(store.getState(), undefined, drawing)).not.toBe(drawing);
  });
});
