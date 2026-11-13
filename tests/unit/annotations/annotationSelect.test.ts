// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSpots, handlesOf, type HandleRef } from '../../../src/app/annotations/annotationHandles';
import { annotationList } from '../../../src/app/annotations/annotationList';
import type { Annotation, DrawingInput, TextInput } from '../../../src/app/annotations/annotationTypes';
import { rectanglePoints } from '../../../src/app/annotations/shapeOutlines';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import type { ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';
import { beginHistoryTransaction, endHistoryTransaction, getHistoryStore } from '../../../src/app/stores/history';
import { drawScene, type DrawScene } from '../../helpers/drawScene';

const openContextMenuGlobal = vi.hoisted(() => vi.fn<(entries: ContextMenuEntry[], at: { x: number; y: number }) => boolean>(() => true));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));
// jsdom draws no glyphs: the turn handle's never arrives
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

type Point = { x: number; y: number };
const pt = (x: number, y: number): Point => ({ x, y });
const PEN = '#ffffff';
const line = (points: Point[], more: Partial<DrawingInput> = {}): DrawingInput => ({ type: 'pen', points, color: PEN, width: 4, opacity: 1, ...more });
const box = (from: Point, to: Point, more: Partial<DrawingInput> = {}): DrawingInput => line(rectanglePoints(from, to), { type: 'rectangle', ...more });
const label = (x: number, y: number, more: Partial<TextInput> = {}): TextInput => ({ x, y, text: 'Vault', fontSize: 24, fontFamily: 'Arial', color: PEN, ...more });

let current: DrawScene | undefined;
beforeEach(() => openContextMenuGlobal.mockClear());
afterEach(() => {
  current?.destroy();
  current = undefined;
});

/** A scene with the Draw tool in its Select mode, its history empty once `fill` has put its drawings there. */
function scene(fill: (s: DrawScene) => void = () => undefined, options?: Parameters<typeof drawScene>[0]): DrawScene {
  const s = current = drawScene(options);
  fill(s);
  getHistoryStore(s.store)!.getState().clear();
  s.store.getState().clearSelection();
  s.tool({ mode: 'select' });
  return s;
}

const steps = (s: DrawScene): number => getHistoryStore(s.store)!.getState().pastStates.length;
const undo = (s: DrawScene): void => getHistoryStore(s.store)!.getState().undo();
const selected = (s: DrawScene): string[] => s.store.getState().selectedIds;
const read = (s: DrawScene, id: string): Annotation => annotationList(levelObjects(s.store.getState())).find((annotation) => annotation.id === id)!;
/** Where the handle `kind` (at `x`, `y` of the frame, or the point `index`) of the selected annotations stands. */
function grip(s: DrawScene, kind: HandleRef['kind'], x = 0, y = 0): Point {
  const ids = new Set(selected(s));
  const handles = handlesOf(annotationList(levelObjects(s.store.getState())).filter((annotation) => ids.has(annotation.id)), s.renderer.layer.measure)!;
  const found = handleSpots(handles, 1).find(({ ref }) => ref.kind === kind && (ref.kind === 'point' ? ref.index === x : ref.kind === 'turn' || (ref.x === x && ref.y === y)));
  if (!found) throw new Error(`no ${kind} handle`);
  return found.at;
}
const chromeChild = (s: DrawScene, name: string): { visible: boolean } | null => s.renderer.chrome.getChildByLabel(name, true);

describe('what a press takes, by the tool in hand', () => {
  const fill = (s: DrawScene): Record<string, string> => ({
    above: s.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])),
    onMap: s.store.getState().addDrawing(line([pt(100, 200), pt(300, 200)], { layer: 'map' })),
    locked: s.store.getState().addDrawing(line([pt(100, 300), pt(300, 300)], { locked: true })),
    hidden: s.store.getState().addDrawing(line([pt(100, 400), pt(300, 400)], { hidden: true })),
    text: s.store.getState().addText(label(500, 100)),
  });

  it('takes every drawing and text in the Draw tool\'s Select mode: on the map, locked and hidden ones too', () => {
    let ids: Record<string, string> = {};
    const s = scene((made) => { ids = fill(made); });
    for (const [name, y] of [['above', 100], ['onMap', 200], ['locked', 300], ['hidden', 400]] as const) {
      expect(s.press(200, y)).toBe(true);
      s.pointer('pointerup', 200, y);
      expect(selected(s)).toEqual([ids[name]]);
    }
    expect(s.press(500, 100)).toBe(true);
    s.pointer('pointerup', 500, 100);
    expect(selected(s)).toEqual([ids.text]);
    expect(s.press(600, 500)).toBe(false);
  });

  it('takes those above the tokens with the move and select tools, and neither one on the map nor a locked one', () => {
    let ids: Record<string, string> = {};
    const s = scene((made) => { ids = fill(made); });
    for (const tool of ['move', 'select'] as const) {
      s.store.getState().setActiveTool(tool);
      s.store.getState().clearSelection();
      expect(s.press(200, 400)).toBe(true);
      s.pointer('pointerup', 200, 400);
      expect(selected(s)).toEqual([ids.hidden]);
      s.store.getState().clearSelection();
      expect(s.press(200, 200)).toBe(false);
      expect(s.press(200, 300)).toBe(false);
      expect(selected(s)).toEqual([]);
      expect(s.press(200, 100)).toBe(true);
      s.pointer('pointerup', 200, 100);
      expect(selected(s)).toEqual([ids.above]);
      expect(s.press(500, 100)).toBe(true);
      s.pointer('pointerup', 500, 100);
      expect(selected(s)).toEqual([ids.text]);
    }
  });

  it('takes none in any other tool, nor in a mode of the Draw tool that draws', () => {
    let ids: Record<string, string> = {};
    const s = scene((made) => { ids = fill(made); });
    for (const tool of ['measure', 'wall', 'fog', 'note-pin'] as const) {
      s.store.getState().setActiveTool(tool);
      expect(s.press(200, 100)).toBe(false);
      expect(s.press(200, 100, { button: 2 })).toBe(false);
    }
    s.tool({ mode: 'pen' });
    expect(s.pull([[200, 100], [260, 160]])).toBe(false);
    // The pen drew over the drawing there, which it left alone.
    expect(s.drawings()).toHaveLength(5);
    expect(selected(s)).not.toContain(ids.above);
    expect(s.drawings()[0]?.points).toEqual([pt(100, 100), pt(300, 100)]);
    expect(s.press(200, 100, { button: 2 })).toBe(false);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('takes none while the canvas shows the players\' picture, and none in a view that is the players\' own', () => {
    const s = scene(fill);
    s.players.shown = true;
    s.renderer.refreshVisibility();
    expect(s.press(200, 100)).toBe(false);
    expect(s.press(200, 100, { button: 2 })).toBe(false);
    expect(s.renderer.selecting.pointer.cursorAt(200, 100, () => false)).toBeNull();
    expect(selected(s)).toEqual([]);
    current?.destroy();
    const own = scene(fill, { playerView: true });
    expect(own.press(200, 100)).toBe(false);
  });

  it('selects a group as one, and Shift adds and takes away', () => {
    let ids: string[] = [];
    const s = scene((made) => {
      const add = made.store.getState().addDrawing;
      ids = [add(line([pt(100, 100), pt(300, 100)], { group: 'room' })), add(line([pt(100, 200), pt(300, 200)], { group: 'room' })), add(line([pt(100, 300), pt(300, 300)]))];
    });
    s.press(200, 100);
    s.pointer('pointerup', 200, 100);
    expect(selected(s)).toEqual([ids[0], ids[1]]);
    s.press(200, 300, { shift: true });
    s.pointer('pointerup', 200, 300);
    expect(selected(s)).toEqual(ids);
    s.press(200, 200, { shift: true });
    s.pointer('pointerup', 200, 200);
    expect(selected(s)).toEqual([ids[2]]);
  });

  it('marks what a press would take under the pointer, and what is framed needs no second mark', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])); });
    const hover = s.renderer.chrome.getChildByLabel('annotation-hover', true) as unknown as { context: { instructions: unknown[] } };
    expect(s.renderer.selecting.pointer.cursorAt(200, 100, () => false)).toBe('move');
    expect(hover.context.instructions.length).toBeGreaterThan(0);
    expect(s.renderer.selecting.pointer.cursorAt(600, 500, () => false)).toBeNull();
    expect(hover.context.instructions).toHaveLength(0);
    // The move tool gives a token the press: over one, no drawing is marked.
    s.store.getState().setActiveTool('move');
    expect(s.renderer.selecting.pointer.cursorAt(200, 100, () => true)).toBeNull();
    expect(s.renderer.selecting.pointer.cursorAt(200, 100, () => false)).toBe('move');
    s.store.getState().setSelection([id]);
    s.renderer.selecting.pointer.cursorAt(200, 100, () => false);
    expect(hover.context.instructions).toHaveLength(0);
  });
});

describe('moving what is selected', () => {
  it('shows the move as it goes and writes it with the release: one undo step', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])); });
    s.press(200, 100);
    s.pointer('pointermove', 260, 130);
    // The store hears nothing yet: what the drawing is drawn in has moved.
    expect(s.drawings()[0]?.points[0]).toEqual(pt(100, 100));
    expect([s.node('drawing', id)?.x, s.node('drawing', id)?.y]).toEqual([60, 30]);
    expect(s.renderer.selecting.dragging).toBe(true);
    s.pointer('pointerup', 260, 130);
    expect(s.drawings()[0]?.points).toEqual([pt(160, 130), pt(360, 130)]);
    expect([s.node('drawing', id)?.x, s.node('drawing', id)?.y]).toEqual([0, 0]);
    expect(steps(s)).toBe(1);
    undo(s);
    expect(s.drawings()[0]?.points).toEqual([pt(100, 100), pt(300, 100)]);
  });

  it('moves drawings and texts that are selected together, each with what lies with its points', () => {
    let ids: string[] = [];
    const s = scene((made) => {
      const state = made.store.getState();
      ids = [state.addDrawing(line([pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 0)], { type: 'line', fill: 'soft', holes: [[pt(60, 20), pt(80, 20), pt(80, 40)]] })), state.addText(label(400, 300))];
    });
    s.store.getState().setSelection(ids);
    s.pull([[50, 0], [70, 40]]);
    expect(s.drawings()[0]?.holes).toEqual([[pt(80, 60), pt(100, 60), pt(100, 80)]]);
    expect(s.texts()[0]).toMatchObject({ x: 420, y: 340 });
    expect(steps(s)).toBe(1);
  });

  it('puts everything back on Escape and on a lost pointer, and leaves no undo step', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addText(label(200, 200)); });
    for (const lose of [(): boolean => s.renderer.selecting.handleEscape(), (): void => { window.dispatchEvent(new Event('blur')); }]) {
      s.press(200, 200);
      s.pointer('pointermove', 300, 260);
      expect([s.node('text', id)?.x, s.node('text', id)?.y]).toEqual([300, 260]);
      lose();
      expect([s.node('text', id)?.x, s.node('text', id)?.y]).toEqual([200, 200]);
      s.pointer('pointerup', 300, 260);
      expect(s.texts()[0]).toMatchObject({ x: 200, y: 200 });
      expect(steps(s)).toBe(0);
      expect(s.renderer.selecting.dragging).toBe(false);
    }
  });

  it('selects a locked one in Select mode and moves it nowhere', () => {
    const s = scene((made) => { made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)], { locked: true })); });
    expect(s.pull([[200, 100], [260, 160]])).toBe(true);
    expect(selected(s)).toHaveLength(1);
    expect(s.drawings()[0]?.points[0]).toEqual(pt(100, 100));
    expect(steps(s)).toBe(0);
    // It has no handle to pull either: where its corner's would stand, a press takes nothing.
    expect(s.renderer.selecting.pointer.gripDown(309, 109, {} as never)).toBe(false);
  });

  it('leaves copies where an Alt-drag ends and the originals where they were, as one undo step', () => {
    const s = scene((made) => { made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])); });
    s.pull([[200, 100], [260, 130]], { alt: true });
    const [original, copy, ...more] = s.drawings();
    expect(more).toEqual([]);
    expect(original?.points).toEqual([pt(100, 100), pt(300, 100)]);
    expect(copy?.points).toEqual([pt(160, 130), pt(360, 130)]);
    expect(selected(s)).toEqual([copy?.id]);
    expect(steps(s)).toBe(1);
  });

  it('drops a move when what it moves is changed under it', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])); });
    s.press(200, 100);
    s.pointer('pointermove', 260, 130);
    s.store.getState().updateAnnotations([id], { color: '#ff0000' });
    expect(s.renderer.selecting.dragging).toBe(false);
    s.pointer('pointerup', 260, 130);
    expect(s.drawings()[0]).toMatchObject({ color: '#ff0000', points: [pt(100, 100), pt(300, 100)] });
  });
});

describe('the handles of what is selected', () => {
  const room = (s: DrawScene): string => s.store.getState().addDrawing(box(pt(100, 100), pt(300, 200)));

  it('show for the selection, and for nothing once it is let go of', () => {
    let id = '';
    const s = scene((made) => { id = room(made); });
    const frame = s.renderer.chrome.getChildByLabel('annotation-frame', true)!.children[0] as unknown as { context: { instructions: unknown[] } };
    expect(frame.context.instructions).toHaveLength(0);
    s.store.getState().setSelection([id]);
    expect(frame.context.instructions.length).toBeGreaterThan(0);
    expect(chromeChild(s, 'annotation-turn-handle')?.visible).toBe(true);
    s.store.getState().clearSelection();
    expect(frame.context.instructions).toHaveLength(0);
    expect(chromeChild(s, 'annotation-turn-handle')?.visible).toBe(false);
  });

  it('scale a rectangle from a corner about the opposite one; it stays a rectangle, in one undo step', () => {
    let id = '';
    const s = scene((made) => { id = room(made); });
    s.store.getState().setSelection([id]);
    const corner = grip(s, 'corner', 1, 1);
    expect(s.pull([[corner.x, corner.y], [corner.x + 100, corner.y + 50]])).toBe(true);
    expect(read(s, id)).toMatchObject({ shape: 'rectangle' });
    expect(s.drawings()[0]?.points).toEqual(rectanglePoints(pt(100, 100), pt(400, 250)));
    expect(steps(s)).toBe(1);
    undo(s);
    expect(s.drawings()[0]?.points).toEqual(rectanglePoints(pt(100, 100), pt(300, 200)));
  });

  it('keep a shape\'s proportion with Shift, and stretch one way from a side', () => {
    let id = '';
    const s = scene((made) => { id = room(made); });
    s.store.getState().setSelection([id]);
    const corner = grip(s, 'corner', 1, 1);
    s.pull([[corner.x, corner.y], [corner.x + 200, corner.y + 100]], { shift: true });
    expect(s.drawings()[0]?.points[2]).toEqual(pt(500, 300));
    const side = grip(s, 'side', -1, 0);
    s.pull([[side.x, side.y], [side.x - 100, side.y + 77]]);
    expect(s.drawings()[0]?.points).toEqual(rectanglePoints(pt(0, 100), pt(500, 300)));
  });

  it('turn about the frame\'s middle, in 15° steps with Shift', () => {
    let id = '';
    const s = scene((made) => { id = room(made); });
    s.store.getState().setSelection([id]);
    const turn = grip(s, 'turn');
    // From straight above the middle to its right: a quarter turn, but for the pointer's slack.
    s.pull([[turn.x, turn.y], [200 + 150, 150 + 9]], { shift: true });
    expect(read(s, id)).toMatchObject({ shape: 'rectangle' });
    const [first, second] = s.drawings()[0]!.points;
    expect([first, second]).toEqual([pt(250, 50), pt(250, 250)]);
    expect(steps(s)).toBe(1);
  });

  it('scale a text from a corner, keeping its shape, and turn it', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addText(label(300, 300)); });
    s.store.getState().setSelection([id]);
    const corner = grip(s, 'corner', 1, 1);
    const { frame } = handlesOf([read(s, id)], s.renderer.layer.measure)!;
    // Twice as far from the opposite corner, along the diagonal.
    s.pull([[corner.x, corner.y], [corner.x + 2 * frame.halfWidth, corner.y + 2 * frame.halfHeight]]);
    const text = s.texts()[0]!;
    expect(text.scale).toBeCloseTo(2);
    expect(text.fontSize).toBe(24);
    const turn = grip(s, 'turn');
    s.pull([[turn.x, turn.y], [turn.x + 5000, turn.y]], { shift: true });
    expect(s.texts()[0]?.rotation).toBe(90);
    expect(steps(s)).toBe(2);
  });

  it('show a turn as it goes and put it back on Escape', () => {
    let id = '';
    const s = scene((made) => { id = room(made); });
    s.store.getState().setSelection([id]);
    const turn = grip(s, 'turn');
    s.press(turn.x, turn.y);
    s.pointer('pointermove', 350, 150);
    expect(s.drawings()[0]?.points).toEqual(rectanglePoints(pt(100, 100), pt(300, 200)));
    expect(s.renderer.selecting.handleEscape()).toBe(true);
    s.pointer('pointerup', 350, 150);
    expect(s.drawings()[0]?.points).toEqual(rectanglePoints(pt(100, 100), pt(300, 200)));
    expect(steps(s)).toBe(0);
    expect(s.renderer.selecting.handleEscape()).toBe(false);
  });
});

describe('a line\'s points', () => {
  const path = (s: DrawScene): string => s.store.getState().addDrawing(line([pt(100, 100), pt(300, 100), pt(300, 300)], { type: 'line' }));

  it('are dragged one at a time, onto the grid where it snaps and freely with Alt', () => {
    let id = '';
    const s = scene((made) => { id = path(made); });
    s.store.getState().setSelection([id]);
    s.pull([[300, 100], [352, 77]]);
    expect(s.drawings()[0]?.points).toEqual([pt(100, 100), pt(350, 70), pt(300, 300)]);
    s.pull([[350, 70], [352, 77]], { alt: true });
    expect(s.drawings()[0]?.points[1]).toEqual(pt(352, 77));
    expect(steps(s)).toBe(2);
  });

  it('take one more by a click on an edge, and a drag there moves the line', () => {
    let id = '';
    const s = scene((made) => { id = path(made); });
    s.store.getState().setSelection([id]);
    s.pull([[200, 100]]);
    expect(s.drawings()[0]?.points).toEqual([pt(100, 100), pt(200, 100), pt(300, 100), pt(300, 300)]);
    expect(steps(s)).toBe(1);
    s.pull([[150, 100], [160, 130]]);
    expect(s.drawings()[0]?.points[0]).toEqual(pt(110, 130));
    expect(s.drawings()[0]?.points).toHaveLength(4);
  });

  it('lose one to a double click or to Delete over it, but a line keeps two', () => {
    let id = '';
    const s = scene((made) => { id = path(made); });
    s.store.getState().setSelection([id]);
    s.pull([[300, 100]]);
    expect(s.drawings()[0]?.points).toHaveLength(3);
    s.pull([[300, 100]], { soon: true });
    expect(s.drawings()[0]?.points).toEqual([pt(100, 100), pt(300, 300)]);
    expect(steps(s)).toBe(1);
    // The line has no point to spare: Delete over one of them is not the point's, and goes on to whoever deletes the selection.
    expect(s.renderer.selecting.handleDelete()).toBe(false);
    s.renderer.selecting.pointer.cursorAt(100, 100, () => false);
    expect(s.renderer.selecting.handleDelete()).toBe(false);
    expect(s.drawings()[0]?.points).toHaveLength(2);
    expect(steps(s)).toBe(1);
  });

  it('take Delete only where a point goes: not on a triangle, and not after the selection changed under the pointer', () => {
    let id = '';
    let other = '';
    const s = scene((made) => {
      id = path(made);
      other = made.store.getState().addDrawing(line([pt(400, 400), pt(500, 400), pt(500, 500), pt(400, 400)], { type: 'line' }));
    });
    // A closed line keeps three points.
    s.store.getState().setSelection([other]);
    s.renderer.selecting.pointer.cursorAt(500, 400, () => false);
    expect(s.renderer.selecting.handleDelete()).toBe(false);
    expect(s.drawings().find((drawing) => drawing.id === other)?.points).toHaveLength(4);
    // The pointer rests on a point of the path; a key then selects the triangle: Delete is no longer that point's.
    s.store.getState().setSelection([id]);
    s.renderer.selecting.pointer.cursorAt(300, 100, () => false);
    s.store.getState().setSelection([other]);
    expect(s.renderer.selecting.handleDelete()).toBe(false);
    expect(s.drawings().map((drawing) => drawing.points.length)).toEqual([3, 4]);
    // With the path selected again and the pointer on its corner, the corner goes.
    s.store.getState().setSelection([id]);
    s.renderer.selecting.pointer.cursorAt(300, 100, () => false);
    expect(s.renderer.selecting.handleDelete()).toBe(true);
    expect(s.drawings().find((drawing) => drawing.id === id)?.points).toEqual([pt(100, 100), pt(300, 300)]);
  });
});

describe('what the Draw tool just made', () => {
  it('is selected and shows its handles; a press on one reshapes it, and a press elsewhere draws the next', () => {
    const s = scene();
    s.tool({ mode: 'rectangle' });
    s.pull([[70, 70], [210, 140]]);
    const [first] = s.drawings();
    expect(selected(s)).toEqual([first?.id]);
    const corner = grip(s, 'corner', 1, 1);
    expect(s.pull([[corner.x, corner.y], [corner.x + 70, corner.y + 70]])).toBe(true);
    expect(s.drawings()).toHaveLength(1);
    expect(s.drawings()[0]?.points[2]).toEqual(pt(280, 210));
    // Inside its frame is no handle: the press lets go of it and draws.
    expect(s.pull([[140, 140], [210, 210]])).toBe(false);
    expect(s.drawings()).toHaveLength(2);
    expect(selected(s)).toEqual([s.drawings()[1]?.id]);
  });

  it('is selected after a line, a stamp and a text alike', () => {
    const s = scene();
    s.tool({ mode: 'line' });
    s.pull([[70, 70], [210, 140]]);
    expect(selected(s)).toEqual([s.drawings()[0]?.id]);
    s.tool({ mode: 'stamp' });
    s.pull([[400, 400]]);
    expect(selected(s)).toEqual([s.drawings()[1]?.id]);
    s.tool({ mode: 'text' });
    s.press(500, 500);
    s.pointer('pointerup', 500, 500);
    s.type('Gate');
    s.fieldKey('Enter');
    expect(s.texts()).toHaveLength(1);
    expect(selected(s)).toEqual([s.texts()[0]?.id]);
  });

  it('is not selected after a pen stroke: no handles show, and the next stroke starts on the end of the last', () => {
    const s = scene();
    s.tool({ mode: 'pen' });
    expect(s.pull([[10, 10], [60, 12], [120, 40]])).toBe(false);
    expect(s.drawings()).toHaveLength(1);
    expect(selected(s)).toEqual([]);
    expect(s.renderer.selecting.framedIds.size).toBe(0);
    // On the last stroke's end, where the corner of its frame would stand: the press draws.
    expect(s.pull([[120, 40], [180, 90], [240, 60]])).toBe(false);
    expect(s.drawings()).toHaveLength(2);
    expect(s.drawings()[0]?.points[0]).toEqual(pt(10, 10));
    expect(selected(s)).toEqual([]);
  });

  it('is let go of when a pen stroke begins, whatever mode made it', () => {
    const s = scene();
    s.tool({ mode: 'rectangle' });
    s.pull([[70, 70], [210, 140]]);
    expect(selected(s)).toHaveLength(1);
    s.tool({ mode: 'pen' });
    // The stroke as the pen itself hears it, without the dispatch that lets go of a selection on its way.
    s.pointer('pointerdown', 400, 400);
    expect(selected(s)).toEqual([]);
    s.pointer('pointermove', 460, 420);
    s.pointer('pointerup', 520, 400);
    expect(s.drawings()).toHaveLength(2);
    expect(selected(s)).toEqual([]);
  });
});

describe('the menu and the double click', () => {
  const labels = (): string[] => (openContextMenuGlobal.mock.calls[0]?.[0] ?? []).flatMap((entry) => (entry.type === 'item' ? [entry.label] : []));
  const choose = (name: string): unknown => openContextMenuGlobal.mock.calls.at(-1)?.[0].flatMap((entry) => (entry.type === 'item' && entry.label === name ? [entry] : []))[0]?.onClick();

  it('opens on the press, for drawings and texts alike, with no colours and no sizes', () => {
    let ids: string[] = [];
    const s = scene((made) => { ids = [made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])), made.store.getState().addText(label(500, 300))]; });
    expect(s.press(200, 100, { button: 2 })).toBe(true);
    expect(selected(s)).toEqual([ids[0]]);
    expect(labels()).toEqual(['Hide from players', 'On the map', 'Lock', 'Group', 'Ungroup', 'To front', 'To back', 'Duplicate', 'Delete']);
    openContextMenuGlobal.mockClear();
    s.press(500, 300, { button: 2 });
    expect(labels()).toEqual(['Edit', 'Hide from players', 'On the map', 'Lock', 'Group', 'Ungroup', 'To front', 'To back', 'Duplicate', 'Delete']);
    expect(s.press(600, 500, { button: 2 })).toBe(false);
  });

  it('changes the whole selection, and says what each row will do', () => {
    let ids: string[] = [];
    const s = scene((made) => { ids = [made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])), made.store.getState().addText(label(500, 300))]; });
    s.store.getState().setSelection(ids);
    s.press(200, 100, { button: 2 });
    choose('Hide from players');
    choose('On the map');
    choose('Lock');
    expect(s.drawings()[0]).toMatchObject({ hidden: true, layer: 'map', locked: true });
    expect(s.texts()[0]).toMatchObject({ hidden: true, layer: 'map', locked: true });
    expect(steps(s)).toBe(3);
    openContextMenuGlobal.mockClear();
    s.press(200, 100, { button: 2 });
    expect(labels().slice(0, 3)).toEqual(['Show to players', 'Above the tokens', 'Unlock']);
    // Locked, they take their unlocking first.
    choose('Unlock');
    s.press(200, 100, { button: 2 });
    choose('Show to players');
    choose('Above the tokens');
    expect(s.drawings()[0]).not.toHaveProperty('hidden');
    expect(s.drawings()[0]).not.toHaveProperty('layer');
    expect(s.texts()[0]).not.toHaveProperty('locked');
    choose('Delete');
    expect([s.drawings(), s.texts(), selected(s)]).toEqual([[], [], []]);
  });

  it('offers a locked one its unlocking and a copy, and nothing else', () => {
    let ids: string[] = [];
    const s = scene((made) => { ids = [made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)], { locked: true })), made.store.getState().addText(label(500, 300, { locked: true }))]; });
    const offered = (): string[] => (openContextMenuGlobal.mock.calls.at(-1)?.[0] ?? []).flatMap((entry) => (entry.type === 'item' && !entry.disabled ? [entry.label] : []));
    s.press(500, 300, { button: 2 });
    expect(labels()).toEqual(['Edit', 'Hide from players', 'On the map', 'Unlock', 'Group', 'Ungroup', 'To front', 'To back', 'Duplicate', 'Delete']);
    expect(offered()).toEqual(['Unlock', 'Duplicate']);
    // A row chosen all the same changes nothing.
    for (const row of ['Edit', 'Hide from players', 'On the map', 'Group', 'Ungroup', 'To front', 'To back', 'Delete']) choose(row);
    expect(s.texts()[0]).toMatchObject({ x: 500, y: 300, locked: true });
    expect(s.texts()[0]).not.toHaveProperty('hidden');
    expect(s.field()).toBeNull();
    expect(steps(s)).toBe(0);
    choose('Unlock');
    expect(s.texts()[0]).not.toHaveProperty('locked');
    expect(steps(s)).toBe(1);

    // With one that is not locked, the rows speak of that one and change it alone.
    s.store.getState().setSelection(ids);
    s.press(200, 100, { button: 2 });
    expect(offered()).toEqual(['Hide from players', 'On the map', 'Lock', 'To front', 'To back', 'Duplicate', 'Delete']);
    choose('Hide from players');
    expect(s.texts()[0]).toMatchObject({ hidden: true });
    expect(s.drawings()[0]).not.toHaveProperty('hidden');
    choose('Delete');
    expect(s.texts()).toEqual([]);
    expect(s.drawings()[0]).toMatchObject({ locked: true });
    expect(selected(s)).toEqual([ids[0]]);
  });

  it('orders and duplicates from the menu', () => {
    let ids: string[] = [];
    const s = scene((made) => { ids = [made.store.getState().addDrawing(line([pt(100, 100), pt(300, 100)])), made.store.getState().addDrawing(line([pt(100, 200), pt(300, 200)]))]; });
    const order = (): string[] => annotationList(levelObjects(s.store.getState())).map(({ id }) => id);
    s.press(200, 100, { button: 2 });
    choose('To front');
    expect(order()).toEqual([ids[1], ids[0]]);
    // The layer lays them in the new order.
    expect(s.node('drawing', ids[0]!)!.zIndex).toBeGreaterThan(s.node('drawing', ids[1]!)!.zIndex);
    choose('To back');
    expect(order()).toEqual(ids);
    choose('Duplicate');
    expect(s.drawings()).toHaveLength(3);
  });

});

describe('drawings and texts selected with tokens', () => {
  /** A token, a drawing and a text, all selected, with the move tool: the tokens' own drag is the dispatch's, and stands in here as the undo step it holds open. */
  function mixed(): { s: DrawScene; ids: string[] } {
    let ids: string[] = [];
    const s = scene((made) => {
      const state = made.store.getState();
      made.store.setState({ objects: { ...state.objects, tokens: { orc: { id: 'orc', kind: 'token', imagePath: 'orc.png', x: 35, y: 35, size: 1 } } } });
      ids = [state.addDrawing(line([pt(100, 100), pt(300, 100)])), state.addText(label(500, 300))];
    });
    s.store.getState().setActiveTool('move');
    s.store.getState().setSelection(['orc', ...ids]);
    return { s, ids };
  }

  it('show no handles of their own: the selection has the tokens\' frame', () => {
    const { s, ids } = mixed();
    expect(s.renderer.selecting.framedIds.size).toBe(0);
    expect(s.renderer.selecting.pointer.gripDown(309, 109, {} as never)).toBe(false);
    s.store.getState().setSelection(ids);
    expect([...s.renderer.selecting.framedIds]).toEqual(ids);
  });

  it('follow a drag of the tokens step by step in the store, as one undo step with theirs', () => {
    const { s } = mixed();
    beginHistoryTransaction(s.store);
    s.pointer('pointerdown', 35, 35);
    s.renderer.selecting.pointer.dragAlong({ global: { x: 35, y: 35 } } as never);
    s.pointer('pointermove', 38, 35);
    // Within the tokens' own threshold nothing has moved.
    expect(s.drawings()[0]?.points[0]).toEqual(pt(100, 100));
    s.pointer('pointermove', 95, 65);
    expect(s.drawings()[0]?.points[0]).toEqual(pt(160, 130));
    expect(s.texts()[0]).toMatchObject({ x: 560, y: 330 });
    s.pointer('pointerup', 95, 65);
    endHistoryTransaction(s.store);
    expect(steps(s)).toBe(1);
    undo(s);
    expect(s.drawings()[0]?.points[0]).toEqual(pt(100, 100));
    expect(s.texts()[0]).toMatchObject({ x: 500, y: 300 });
  });

  it('start the tokens\' drag when one of them is pressed, before their own', () => {
    const { s } = mixed();
    expect(s.press(200, 100)).toBe(true);
    expect(s.dragTokens).toHaveBeenCalledOnce();
    s.pointer('pointermove', 260, 130);
    expect(s.drawings()[0]?.points[0]).toEqual(pt(160, 130));
    expect(s.texts()[0]).toMatchObject({ x: 560, y: 330 });
    s.pointer('pointerup', 260, 130);
    expect(steps(s)).toBe(1);
  });

  it('stay where a lost pointer leaves them, as the tokens do, and Escape is not theirs to take', () => {
    const { s } = mixed();
    s.press(200, 100);
    s.pointer('pointermove', 260, 130);
    expect(s.renderer.selecting.handleEscape()).toBe(false);
    window.dispatchEvent(new Event('blur'));
    expect(s.drawings()[0]?.points).toEqual([pt(160, 130), pt(360, 130)]);
    expect(s.texts()[0]).toMatchObject({ x: 560, y: 330 });
    expect(steps(s)).toBe(1);
    expect(s.renderer.selecting.dragging).toBe(false);
  });

  it('turn with a group of tokens: texts too, each step in the store', () => {
    const { s, ids } = mixed();
    const turn = s.renderer.selecting.turnAlong(['orc', ...ids])!;
    expect(turn.annotations.map(({ id }) => id)).toEqual(ids);
    turn.show({ a: 0, b: 1, c: -1, d: 0, tx: 400, ty: 0, turn: 90 });
    expect(s.texts()[0]).toMatchObject({ x: 100, y: 500, rotation: 90 });
    expect(s.drawings()[0]?.points).toEqual([pt(300, 100), pt(300, 300)]);
    turn.drop();
    expect(s.texts()[0]).toMatchObject({ x: 500, y: 300 });
    expect(s.texts()[0]).not.toHaveProperty('rotation');
    expect(s.drawings()[0]?.points).toEqual([pt(100, 100), pt(300, 100)]);
  });
});
