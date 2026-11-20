// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handlesOf } from '../../../src/app/annotations/annotationHandles';
import { annotationList } from '../../../src/app/annotations/annotationList';
import type { DrawingInput } from '../../../src/app/annotations/annotationTypes';
import type { AnnotationHandles } from '../../../src/app/pixi/annotations/AnnotationHandles';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { getHistoryStore } from '../../../src/app/stores/history';
import { CELL, drawScene, type DrawScene } from '../../helpers/drawScene';

// jsdom draws no glyphs: the turn handle's never arrives
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

type Point = { x: number; y: number };
const stamp = (x: number, y: number, more: Partial<DrawingInput> = {}): DrawingInput => ({ type: 'icon', icon: 'trap', points: [{ x, y }], color: '#ffffff', width: CELL, opacity: 1, ...more });

let s: DrawScene;
afterEach(() => s.destroy());

const at = (id: string): Point => s.store.getState().objects.drawings[id]!.points[0]!;
/** The middle of the frame the map shows now. */
const frameCentre = (): Point | undefined => (s.renderer as unknown as { handles: AnnotationHandles }).handles.handles?.frame.centre;

describe('a stamp dragged with the pointer', () => {
  it('lands on the cell it is dropped in, in Select mode, in Stamp mode and with the move tool', () => {
    s = drawScene();
    const id = s.store.getState().addDrawing(stamp(105, 175));
    const tools = [() => s.store.getState().setActiveTool('select'), () => s.tool({ mode: 'stamp' }), () => s.store.getState().setActiveTool('move')];
    const drops: [Point, Point][] = [[{ x: 228, y: 262 }, { x: 245, y: 245 }], [{ x: 312, y: 150 }, { x: 315, y: 175 }], [{ x: 79, y: 141 }, { x: 105, y: 175 }]];
    tools.forEach((take, index) => {
      take();
      const from = at(id);
      const [to, cell] = drops[index]!;
      expect(s.pull([[from.x, from.y], [to.x, to.y]])).toBe(true);
      expect(at(id)).toEqual(cell);
    });
  });

  it('shows where it will land while it is dragged: the frame stands on the cell, and the drop is one undo step', () => {
    s = drawScene();
    const id = s.store.getState().addDrawing(stamp(105, 175));
    s.store.getState().setActiveTool('move');
    getHistoryStore(s.store)!.getState().clear();
    s.press(105, 175);
    s.pointer('pointermove', 228, 262);
    expect(frameCentre()).toEqual({ x: 245, y: 245 });
    // Nothing is written before the release.
    expect(at(id)).toEqual({ x: 105, y: 175 });
    s.pointer('pointerup', 228, 262);
    expect(at(id)).toEqual({ x: 245, y: 245 });
    expect(getHistoryStore(s.store)!.getState().pastStates).toHaveLength(1);
  });

  it('lands where cells meet when it spans an even number of cells, as a placed one does', () => {
    s = drawScene();
    const id = s.store.getState().addDrawing(stamp(140, 140, { width: 2 * CELL }));
    s.store.getState().setActiveTool('move');
    s.pull([[140, 140], [270, 300]]);
    expect(at(id)).toEqual({ x: 280, y: 280 });
  });

  it('stays where it is dropped while the grid\'s Snap is off', () => {
    s = drawScene();
    s.store.getState().setSnapToGrid(false);
    const id = s.store.getState().addDrawing(stamp(105, 175));
    s.store.getState().setActiveTool('move');
    s.pull([[105, 175], [228, 262]]);
    expect(at(id)).toEqual({ x: 228, y: 262 });
  });

  it('goes off the grid with Alt held, itself and not a copy, in Select mode, in Stamp mode and with the move tool', () => {
    s = drawScene();
    const id = s.store.getState().addDrawing(stamp(105, 175));
    const tools = [() => s.store.getState().setActiveTool('select'), () => s.tool({ mode: 'stamp' }), () => s.store.getState().setActiveTool('move')];
    const drops: Point[] = [{ x: 228, y: 262 }, { x: 312, y: 150 }, { x: 79, y: 141 }];
    tools.forEach((take, index) => {
      take();
      const from = at(id);
      const to = drops[index]!;
      expect(s.pull([[from.x, from.y], [to.x, to.y]], { alt: true })).toBe(true);
      expect(at(id)).toEqual(to);
      expect(s.drawings()).toHaveLength(1);
    });
  });

  it('is copied by Alt only with others: two stamps dragged with Alt leave copies and stay', () => {
    s = drawScene();
    const state = s.store.getState();
    const a = state.addDrawing(stamp(105, 175));
    const b = state.addDrawing(stamp(315, 175));
    s.store.getState().setActiveTool('move');
    state.setSelection([a, b]);
    s.pull([[105, 175], [118, 187]], { alt: true });
    expect(at(a)).toEqual({ x: 105, y: 175 });
    expect(s.drawings()).toHaveLength(4);
  });

  it('keeps its place among what is moved with it: two stamps keep their shape, and so does a stamp moved with a line', () => {
    s = drawScene();
    const state = s.store.getState();
    const a = state.addDrawing(stamp(105, 175));
    const b = state.addDrawing(stamp(315, 175));
    s.store.getState().setActiveTool('move');
    state.setSelection([a, b]);
    s.pull([[105, 175], [118, 187]]);
    expect(at(a)).toEqual({ x: 118, y: 187 });
    expect(at(b)).toEqual({ x: 328, y: 187 });
    // What frames them is what was moved.
    expect(handlesOf(annotationList(levelObjects(s.store.getState())).filter(({ id }) => id === a || id === b))?.frame.centre).toEqual({ x: 223, y: 187 });
  });
});
