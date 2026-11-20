// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationHandles } from '../../../src/app/pixi/annotations/AnnotationHandles';
import { getHistoryStore } from '../../../src/app/stores/history';
import { CELL, drawScene, type DrawScene } from '../../helpers/drawScene';

// jsdom draws no glyphs: the turn handle's never arrives
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

let s: DrawScene;
afterEach(() => s.destroy());

const selected = (): string[] => s.store.getState().selectedIds;
/** The frame and handles the map shows now. */
const handles = (): unknown => (s.renderer as unknown as { handles: AnnotationHandles }).handles.handles;
const ends = (index: number): { x: number; y: number }[] => {
  const points = s.drawings()[index]?.points ?? [];
  return [points[0]!, points[points.length - 1]!];
};

describe('shapes drawn one after the other', () => {
  it('selects no line after its drag, so a drag from its end is the next line, and the first stays as it was', () => {
    s = drawScene();
    s.tool({ mode: 'line' });
    expect(s.pull([[CELL, CELL], [3 * CELL, CELL]])).toBe(false);
    expect(selected()).toEqual([]);
    expect(handles()).toBeNull();
    expect(s.pull([[3 * CELL, CELL], [3 * CELL, 3 * CELL]])).toBe(false);
    expect(s.pull([[3 * CELL, 3 * CELL], [CELL, 3 * CELL]])).toBe(false);
    expect(s.drawings()).toHaveLength(3);
    expect(ends(0)).toEqual([{ x: CELL, y: CELL }, { x: 3 * CELL, y: CELL }]);
    expect(ends(1)).toEqual([{ x: 3 * CELL, y: CELL }, { x: 3 * CELL, y: 3 * CELL }]);
    expect(ends(2)).toEqual([{ x: 3 * CELL, y: 3 * CELL }, { x: CELL, y: 3 * CELL }]);
    expect(selected()).toEqual([]);
  });

  it('selects no rectangle and no ellipse after its drag: the next begins on the corner of the last', () => {
    s = drawScene();
    for (const mode of ['rectangle', 'ellipse'] as const) {
      s.tool({ mode });
      const before = s.drawings().length;
      expect(s.pull([[CELL, CELL], [3 * CELL, 2 * CELL]])).toBe(false);
      expect(selected()).toEqual([]);
      expect(handles()).toBeNull();
      expect(s.pull([[3 * CELL, 2 * CELL], [5 * CELL, 4 * CELL]])).toBe(false);
      expect(s.drawings()).toHaveLength(before + 2);
      expect(selected()).toEqual([]);
    }
  });

  it('selects no line placed click by click, and a drag elsewhere at once is the next', () => {
    s = drawScene();
    s.tool({ mode: 'line' });
    for (const [x, y] of [[CELL, CELL], [2 * CELL, 2 * CELL], [3 * CELL, CELL]] as const) s.pull([[x, y]]);
    s.key('Enter');
    expect(s.drawings()).toHaveLength(1);
    expect(selected()).toEqual([]);
    expect(handles()).toBeNull();
    expect(s.pull([[5 * CELL, 5 * CELL], [7 * CELL, 5 * CELL]])).toBe(false);
    expect(s.drawings()).toHaveLength(2);
  });

  it('lets go of what was selected before when a shape begins, in every mode that draws one', () => {
    s = drawScene();
    const stamp = s.store.getState().addDrawing({ type: 'icon', icon: 'trap', points: [{ x: 525, y: 525 }], color: '#ffffff', width: CELL, opacity: 1 });
    for (const mode of ['pen', 'line', 'rectangle', 'ellipse'] as const) {
      s.tool({ mode });
      s.store.getState().setSelection([stamp]);
      // As the input hears it where nothing asks the selection first.
      s.drag([[CELL, CELL], [2 * CELL, 2 * CELL]]);
      expect(selected()).toEqual([]);
    }
  });

  it('is one undo step a shape, with nothing selected to delete after it', () => {
    s = drawScene();
    s.tool({ mode: 'rectangle' });
    getHistoryStore(s.store)!.getState().clear();
    s.pull([[CELL, CELL], [3 * CELL, 2 * CELL]]);
    expect(getHistoryStore(s.store)!.getState().pastStates).toHaveLength(1);
    expect(s.renderer.selecting.handleDelete()).toBe(false);
    expect(s.renderer.selecting.handleEscape()).toBe(false);
    expect(s.drawings()).toHaveLength(1);
  });
});
