import { describe, expect, it } from 'vitest';
import { framedAnnotations, pressScope, takesPress, withGroups } from '../annotationPress';
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
