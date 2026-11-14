import { describe, expect, it } from 'vitest';
import { framedAnnotations, ownKind, pressScope, takesOwn, takesPress, withGroups } from '../annotationPress';
import { DRAW_MODES } from '../annotationTypes';
import { drawing, text } from './annotationKit';

const LINE = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
const above = drawing({ id: 'above', points: LINE });
const onMap = drawing({ id: 'on-map', points: LINE, layer: 'map' });
const locked = text({ id: 'locked', locked: true });
const hidden = text({ id: 'hidden', hidden: true });

describe('what the tool in hand takes of drawings and texts', () => {
  it('takes every one in the Draw tool\'s Select mode: on the map, hidden and locked ones too', () => {
    const scope = pressScope('draw', 'select');
    expect(scope).toBe('all');
    expect([above, onMap, locked, hidden].every((annotation) => takesPress(scope, annotation))).toBe(true);
  });

  it('takes none by a press in the Draw tool\'s other modes: only the handles of what was just made', () => {
    for (const mode of DRAW_MODES.filter((one) => one !== 'select')) {
      const scope = pressScope('draw', mode);
      expect(scope).toBe('made');
      expect([above, onMap, locked, hidden].some((annotation) => takesPress(scope, annotation))).toBe(false);
    }
  });

  it('takes those above the tokens that are not locked with the move and select tools, never one on the map', () => {
    for (const tool of ['move', 'select']) {
      const scope = pressScope(tool, 'select');
      expect(scope).toBe('above');
      expect([above, onMap, locked, hidden].map((annotation) => takesPress(scope, annotation))).toEqual([true, false, false, true]);
    }
  });

  it('takes none in every other tool, whatever mode the Draw tool was left in', () => {
    for (const tool of ['measure', 'wall', 'fog', 'eraser', 'note-pin', 'laser', 'audio', 'stairs']) {
      const scope = pressScope(tool, 'select');
      expect(scope).toBe('none');
      expect(takesPress(scope, above)).toBe(false);
    }
  });
});

describe('what a mode that places by a press takes of its own kind', () => {
  const stamp = drawing({ id: 'stamp', type: 'icon', icon: 'skull', points: [{ x: 5, y: 5 }], width: 70 });
  const stampOnMap = drawing({ id: 'stamp-on-map', type: 'icon', icon: 'skull', points: [{ x: 5, y: 5 }], width: 70, layer: 'map', hidden: true, locked: true });
  const sign = text({ id: 'sign' });

  it('takes stamps in Stamp mode, wherever they lie and hidden and locked ones too, and neither strokes nor texts', () => {
    const own = ownKind('draw', 'stamp');
    expect(own).toBe('stamp');
    expect([stamp, stampOnMap, above, onMap, sign, locked].map((annotation) => takesOwn(own, annotation))).toEqual([true, true, false, false, false, false]);
  });

  it('takes texts in Text mode, and neither stamps nor strokes', () => {
    const own = ownKind('draw', 'text');
    expect(own).toBe('text');
    expect([sign, locked, hidden, stamp, above, onMap].map((annotation) => takesOwn(own, annotation))).toEqual([true, true, true, false, false, false]);
  });

  it('takes stamps with Alt held too, where Alt frees them from the grid; a text is then typed on top', () => {
    expect(takesOwn(ownKind('draw', 'stamp', true), stamp)).toBe(true);
    const own = ownKind('draw', 'text', true);
    expect(own).toBeNull();
    expect([stamp, sign, above].some((annotation) => takesOwn(own, annotation))).toBe(false);
  });

  it('is no rule of any other mode or tool, and changes no scope', () => {
    for (const mode of DRAW_MODES.filter((one) => one !== 'stamp' && one !== 'text')) expect(ownKind('draw', mode), mode).toBeNull();
    for (const tool of ['move', 'select', 'measure', 'wall', 'fog']) {
      expect(ownKind(tool, 'stamp'), tool).toBeNull();
      expect(ownKind(tool, 'text'), tool).toBeNull();
    }
    expect(pressScope('draw', 'stamp')).toBe('made');
    expect(pressScope('draw', 'text')).toBe('made');
    expect(takesPress('made', stamp)).toBe(false);
  });
});

describe('a group', () => {
  const wall = drawing({ id: 'wall', points: LINE, group: 'room' });
  const floor = drawing({ id: 'floor', points: LINE, group: 'room', layer: 'map' });
  const sign = text({ id: 'sign', group: 'room' });
  const other = drawing({ id: 'other', points: LINE, group: 'cellar' });
  const list = [wall, floor, above, sign, other];

  it('is selected as one', () => {
    expect(withGroups(['sign'], list, 'all')).toEqual(['sign', 'wall', 'floor']);
    expect(withGroups(['above', 'wall'], list, 'all')).toEqual(['above', 'wall', 'floor', 'sign']);
    expect(withGroups(['above'], list, 'all')).toEqual(['above']);
  });

  it('brings only the members the tool takes: with the move tool not the one on the map', () => {
    expect(withGroups(['wall'], list, 'above')).toEqual(['wall', 'sign']);
  });
});

describe('what the handles frame', () => {
  const selected = [above, onMap, locked];

  it('is every selected annotation in the Draw tool', () => {
    expect(framedAnnotations(selected, 'all', false)).toBe(selected);
    expect(framedAnnotations(selected, 'made', false)).toBe(selected);
  });

  it('is what the move and select tools take, and nothing while a token is selected with them', () => {
    expect(framedAnnotations(selected, 'above', false)).toEqual([above]);
    expect(framedAnnotations(selected, 'above', true)).toEqual([]);
    expect(framedAnnotations([above], 'above', false)).toEqual([above]);
  });

  it('is nothing in a tool that takes no annotation', () => {
    expect(framedAnnotations(selected, 'none', false)).toEqual([]);
  });
});
