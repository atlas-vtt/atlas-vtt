// @vitest-environment jsdom
import type { Container, Sprite } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSpots, handlesOf } from '../../../src/app/annotations/annotationHandles';
import { annotationList } from '../../../src/app/annotations/annotationList';
import type { DrawingInput, TextInput } from '../../../src/app/annotations/annotationTypes';
import { stampSize } from '../../../src/app/annotations/drawSizes';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { getHistoryStore } from '../../../src/app/stores/history';
import { CELL, drawScene, type DrawScene } from '../../helpers/drawScene';

// jsdom draws no glyphs: the turn handle's never arrives
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

type Point = { x: number; y: number };
const pt = (x: number, y: number): Point => ({ x, y });
const stamp = (x: number, y: number, more: Partial<DrawingInput> = {}): DrawingInput => ({ type: 'icon', icon: 'skull', points: [pt(x, y)], color: '#ffffff', width: CELL, opacity: 1, ...more });
const line = (points: Point[], more: Partial<DrawingInput> = {}): DrawingInput => ({ type: 'pen', points, color: '#ffffff', width: 4, opacity: 1, ...more });
const label = (x: number, y: number, more: Partial<TextInput> = {}): TextInput => ({ x, y, text: 'Vault', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...more });

let current: DrawScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

/** A scene holding what `fill` puts there, its history empty and nothing selected. */
function scene(fill: (s: DrawScene) => void = () => undefined): DrawScene {
  const s = current = drawScene();
  fill(s);
  getHistoryStore(s.store)!.getState().clear();
  s.store.getState().clearSelection();
  return s;
}

const steps = (s: DrawScene): number => getHistoryStore(s.store)!.getState().pastStates.length;
const selected = (s: DrawScene): string[] => s.store.getState().selectedIds;
const part = <T extends Container = Container>(s: DrawScene, name: string): T => s.renderer.chrome.getChildByLabel(name, true) as T;
/** The mark that shows what a press will place: which of them a render now would draw. */
const placing = (s: DrawScene): string | null =>
  (s.renderer.chrome.visible ? ['dot', 'cell', 'stamp'].find((kind) => part(s, `placing-${kind}`).visible) : undefined) ?? null;
const at = (node: Container): Point => pt(node.position.x, node.position.y);
/** Whether the quiet outline of what a press would take is drawn. */
const outlined = (s: DrawScene): boolean => (part(s, 'annotation-hover') as unknown as { context: { instructions: unknown[] } }).context.instructions.length > 0;

describe('Stamp mode and a stamp that is there', () => {
  it('marks the stamp under the pointer as Select mode does, with a pointer for a cursor, and shows no stamp to place over it', () => {
    const s = scene((made) => { made.store.getState().addDrawing(stamp(105, 175)); });
    s.tool({ mode: 'stamp' });
    expect(s.hover(100, 170)).toBe('pointer');
    expect(outlined(s)).toBe(true);
    expect(placing(s)).toBeNull();
    // Beside it the press stamps: the stamp to be shows there, and no outline.
    expect(s.hover(300, 300)).toBe('none');
    expect(outlined(s)).toBe(false);
    expect(placing(s)).toBe('stamp');
  });

  it('selects it with a press and stamps nothing over it; a press beside it stamps as before', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addDrawing(stamp(105, 175)); });
    s.tool({ mode: 'stamp' });
    expect(s.pull([[100, 170]])).toBe(true);
    expect(s.drawings()).toHaveLength(1);
    expect(selected(s)).toEqual([id]);
    expect(steps(s)).toBe(0);
    // Selected, it shows its frame and needs no second outline.
    expect(s.hover(100, 170)).toBe('pointer');
    expect(outlined(s)).toBe(false);
    expect(s.pull([[300, 300]])).toBe(false);
    expect(s.drawings()).toHaveLength(2);
    expect(s.drawings()[1]?.points).toEqual([pt(315, 315)]);
    expect(selected(s)).toEqual([s.drawings()[1]?.id]);
  });

  it('moves it with a drag from that press, as one undo step, and puts it back on Escape', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addDrawing(stamp(105, 175)); });
    s.tool({ mode: 'stamp' });
    expect(s.pull([[100, 170], [200, 240]])).toBe(true);
    // Dropped in the next cell, it sits on that cell.
    expect(s.drawings()).toEqual([expect.objectContaining({ id, points: [pt(175, 245)] })]);
    expect(steps(s)).toBe(1);
    s.press(200, 240);
    s.pointer('pointermove', 400, 400);
    expect(s.hover(400, 400)).toBe('grabbing');
    expect(s.renderer.selecting.handleEscape()).toBe(true);
    s.pointer('pointerup', 400, 400);
    expect(s.drawings()[0]?.points).toEqual([pt(175, 245)]);
    expect(steps(s)).toBe(1);
  });

  it('adds a stamp to the selection with Shift, and takes one that is hidden or lies under the tokens', () => {
    const ids: string[] = [];
    const s = scene((made) => {
      const state = made.store.getState();
      ids.push(state.addDrawing(stamp(105, 175)), state.addDrawing(stamp(315, 175, { hidden: true, layer: 'map' })));
    });
    s.tool({ mode: 'stamp' });
    s.pull([[105, 175]]);
    expect(s.hover(315, 175)).toBe('pointer');
    expect(s.pull([[315, 175]], { shift: true })).toBe(true);
    expect(selected(s)).toEqual(ids);
    expect(s.drawings()).toHaveLength(2);
  });

  it('selects a locked stamp and moves it nowhere', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addDrawing(stamp(105, 175, { locked: true })); });
    s.tool({ mode: 'stamp' });
    expect(s.hover(105, 175)).toBe('pointer');
    expect(s.pull([[105, 175], [300, 300]])).toBe(true);
    expect(selected(s)).toEqual([id]);
    expect(s.drawings()).toEqual([expect.objectContaining({ points: [pt(105, 175)] })]);
    expect(steps(s)).toBe(0);
  });

  it('stamps on top with Alt held: the stamp there is passed over, and the stamp to be shows at the pointer', () => {
    const s = scene((made) => { made.store.getState().addDrawing(stamp(105, 175)); });
    s.tool({ mode: 'stamp' });
    expect(s.hover(100, 170, { alt: true })).toBe('none');
    expect(outlined(s)).toBe(false);
    expect(placing(s)).toBe('stamp');
    expect(at(part(s, 'placing-stamp'))).toEqual(pt(100, 170));
    expect(s.pull([[100, 170]], { alt: true })).toBe(false);
    expect(s.drawings().map(({ points }) => points[0])).toEqual([pt(105, 175), pt(100, 170)]);
  });

  it('takes stamps alone: a line or a text under the pointer is stamped over', () => {
    const s = scene((made) => {
      made.store.getState().addDrawing(line([pt(0, 175), pt(400, 175)], { width: 30 }));
      made.store.getState().addText(label(105, 175));
    });
    s.tool({ mode: 'stamp' });
    expect(s.hover(105, 175)).toBe('none');
    expect(placing(s)).toBe('stamp');
    expect(s.pull([[105, 175]])).toBe(false);
    expect(s.drawings()).toHaveLength(2);
    expect(s.field()).toBeNull();
  });

  it('selects a stamp with its group, as Select mode does', () => {
    const ids: string[] = [];
    const s = scene((made) => {
      const state = made.store.getState();
      ids.push(state.addDrawing(line([pt(400, 400), pt(500, 400)], { group: 'camp' })), state.addDrawing(stamp(105, 175, { group: 'camp' })));
    });
    s.tool({ mode: 'stamp' });
    s.pull([[105, 175]]);
    expect([...selected(s)].sort()).toEqual([...ids].sort());
  });

  it('keeps the handles of the stamp just placed: a press on one pulls it, and places nothing', () => {
    const s = scene();
    s.tool({ mode: 'stamp' });
    s.pull([[300, 300]]);
    const [placed] = s.drawings();
    const handles = handlesOf(annotationList(levelObjects(s.store.getState())), s.renderer.layer.measure)!;
    const corner = handleSpots(handles, 1).find(({ ref }) => ref.kind === 'corner' && ref.x === 1 && ref.y === 1)!.at;
    expect(s.hover(corner.x, corner.y)).toBe('nwse-resize');
    expect(placing(s)).toBeNull();
    expect(s.pull([[corner.x, corner.y], [corner.x + 70, corner.y + 70]])).toBe(true);
    expect(s.drawings()).toHaveLength(1);
    expect(s.drawings()[0]?.width).toBeGreaterThan(placed!.width);
  });
});

describe('Text mode and a text that is there', () => {
  it('opens the text under a click for typing, where it would have started another on top', () => {
    let id = '';
    const s = scene((made) => { id = made.store.getState().addText(label(200, 300)); });
    s.tool({ mode: 'text' });
    expect(s.hover(200, 300)).toBe('pointer');
    expect(outlined(s)).toBe(true);
    expect(s.pull([[200, 300]])).toBe(true);
    expect(s.field()?.value).toBe('Vault');
    expect(selected(s)).toEqual([id]);
    expect(s.texts()).toHaveLength(1);
    // Beside it the cursor is the text cursor, and a click starts a new text.
    s.fieldKey('Escape');
    expect(s.hover(500, 100)).toBe('text');
    expect(outlined(s)).toBe(false);
    expect(placing(s)).toBeNull();
  });

  it('starts a new text over it with Alt held', () => {
    const s = scene((made) => { made.store.getState().addText(label(200, 300)); });
    s.tool({ mode: 'text' });
    expect(s.hover(200, 300, { alt: true })).toBe('text');
    expect(s.pull([[200, 300]], { alt: true })).toBe(false);
    expect(s.field()?.value).toBe('');
  });

  it('selects a locked text without opening it, and takes texts alone', () => {
    let id = '';
    const s = scene((made) => {
      id = made.store.getState().addText(label(200, 300, { locked: true }));
      made.store.getState().addDrawing(stamp(455, 175));
    });
    s.tool({ mode: 'text' });
    expect(s.pull([[200, 300]])).toBe(true);
    expect(s.field()).toBeNull();
    expect(selected(s)).toEqual([id]);
    expect(s.hover(455, 175)).toBe('text');
    expect(s.pull([[455, 175]])).toBe(false);
    expect(s.field()?.value).toBe('');
  });
});

describe('what a press will place, under the pointer', () => {
  it('shows each mode its mark in the place of the cursor, and the others the cursor they had', () => {
    const s = scene();
    s.tool({ mode: 'stamp', size: 'm' });
    expect(s.hover(100, 170)).toBe('none');
    expect(placing(s)).toBe('stamp');
    // On the cell it will land on, as large as it will be, see-through.
    const ghost = part<Sprite>(s, 'placing-stamp');
    expect(at(ghost)).toEqual(pt(105, 175));
    expect(ghost.width).toBeCloseTo(stampSize('m', CELL));
    expect(ghost.alpha).toBeCloseTo(0.6);
    s.tool({ mode: 'pen' });
    expect(s.hover(101, 171)).toBe('none');
    expect([placing(s), at(part(s, 'placing-dot'))]).toEqual(['dot', pt(101, 171)]);
    for (const mode of ['line', 'rectangle', 'ellipse'] as const) {
      s.tool({ mode });
      // Where the shape will start: the grid's point, or the pointer's own with Alt.
      expect(s.hover(68, 73), mode).toBe('none');
      expect([placing(s), at(part(s, 'placing-dot'))], mode).toEqual(['dot', pt(70, 70)]);
      s.hover(68, 73, { alt: true });
      expect(at(part(s, 'placing-dot')), mode).toEqual(pt(68, 73));
    }
    s.tool({ mode: 'cells' });
    expect(s.hover(100, 170)).toBe('none');
    expect(placing(s)).toBe('cell');
    s.tool({ mode: 'eraser' });
    expect(s.hover(100, 170)).toBeNull();
    expect(placing(s)).toBeNull();
    s.tool({ mode: 'text' });
    expect(s.hover(100, 170)).toBe('text');
    expect(placing(s)).toBeNull();
    s.tool({ mode: 'select' });
    expect(s.hover(100, 170)).toBeNull();
    expect(placing(s)).toBeNull();
  });

  it('follows the tool with the pointer at rest: another mode, size or symbol shows at once, and nothing once the tool is left', () => {
    const s = scene();
    s.tool({ mode: 'pen' });
    s.hover(100, 170);
    const dot = part(s, 'placing-dot') as unknown as { context: { instructions: { data: { style: { color: number } } }[] } };
    expect(dot.context.instructions[0]?.data.style.color).toBe(0xffffff);
    s.store.getState().setDrawTool({ color: '#ff0000' });
    expect(dot.context.instructions[0]?.data.style.color).toBe(0xff0000);
    s.store.getState().setDrawTool({ mode: 'stamp', size: 'm' });
    expect(placing(s)).toBe('stamp');
    expect(s.viewport.cursor).toBe('none');
    const ghost = part<Sprite>(s, 'placing-stamp');
    s.store.getState().setDrawTool({ size: 'l' });
    expect(ghost.width).toBeCloseTo(stampSize('l', CELL));
    expect(at(ghost)).toEqual(pt(70, 140));
    s.store.getState().setDrawTool({ mode: 'eraser' });
    expect(placing(s)).toBeNull();
    expect(s.viewport.cursor).toBe('default');
    s.store.getState().setDrawTool({ mode: 'pen' });
    expect(placing(s)).toBe('dot');
    s.store.getState().setActiveTool('move');
    expect(placing(s)).toBeNull();
    expect(s.viewport.cursor).toBe('default');
    // With another tool in hand nothing of it comes back, whatever the pointer does.
    expect(s.hover(100, 170)).toBeNull();
    expect(placing(s)).toBeNull();
  });

  it('goes when the pointer leaves the canvas, and stays away until it is back', () => {
    const s = scene();
    s.tool({ mode: 'pen' });
    s.hover(100, 170);
    s.leave();
    expect(placing(s)).toBeNull();
    s.store.getState().setDrawTool({ mode: 'stamp' });
    s.viewport.emit('moved', { viewport: s.viewport, type: 'wheel' });
    expect(placing(s)).toBeNull();
    s.hover(100, 170);
    expect(placing(s)).toBe('stamp');
  });

  it('makes way for the shape under way, keeps the cursor hidden until it is done, and is back at the pointer after', () => {
    const s = scene();
    s.tool({ mode: 'pen' });
    s.hover(50, 50);
    s.pointer('pointerdown', 50, 50);
    s.pointer('pointermove', 90, 60);
    expect(s.hover(90, 60)).toBe('none');
    expect(placing(s)).toBeNull();
    s.pointer('pointerup', 90, 60);
    expect([placing(s), at(part(s, 'placing-dot'))]).toEqual(['dot', pt(90, 60)]);
    // A box has no picture until it has a size: its dot stays until then.
    s.tool({ mode: 'rectangle' });
    s.hover(140, 140);
    s.pointer('pointerdown', 140, 140);
    expect(placing(s)).toBe('dot');
    s.pointer('pointermove', 280, 210);
    expect(s.hover(280, 210)).toBe('none');
    expect(placing(s)).toBeNull();
    s.key('Escape');
    expect(placing(s)).toBe('dot');
    // The cells a drag passes are its picture; the eraser keeps its arrow beside the ring.
    s.tool({ mode: 'cells' });
    s.hover(100, 170);
    s.pointer('pointerdown', 100, 170);
    expect(s.hover(100, 170)).toBe('none');
    expect(placing(s)).toBeNull();
    s.pointer('pointerup', 100, 170);
    expect(placing(s)).toBe('cell');
    s.tool({ mode: 'eraser' });
    s.pointer('pointerdown', 100, 170);
    expect(s.hover(100, 170)).toBeNull();
    s.pointer('pointerup', 100, 170);
  });

  it('hides while a right-drag pans, with the system\'s cursor, and is back at the pointer when the pan ends', () => {
    const s = scene();
    s.tool({ mode: 'pen' });
    s.hover(100, 170);
    s.viewport.emit('drag-start', {});
    expect(placing(s)).toBeNull();
    expect(s.viewport.cursor).toBe('default');
    expect(s.hover(160, 200)).toBeNull();
    expect(placing(s)).toBeNull();
    s.viewport.emit('drag-end', {});
    expect([placing(s), at(part(s, 'placing-dot'))]).toEqual(['dot', pt(160, 200)]);
    expect(s.viewport.cursor).toBe('none');
    // A pan that something else ended says nothing: the release ends it.
    s.viewport.emit('drag-start', {});
    expect(placing(s)).toBeNull();
    s.pointer('pointerup', 160, 200, { button: 2 });
    expect(placing(s)).toBe('dot');
  });

  it('stays under the pointer when the wheel moves or zooms the map, a dot as large on screen as before where its line is thin', () => {
    const s = scene();
    s.tool({ mode: 'pen', size: 's' });
    s.hover(100, 170);
    const dot = part(s, 'placing-dot');
    s.viewport.moveCorner(40, 30);
    s.viewport.emit('moved', { viewport: s.viewport, type: 'wheel' });
    expect(at(dot)).toEqual(pt(140, 200));
    const before = dot.getLocalBounds().width;
    s.viewport.setZoom(0.25);
    s.viewport.emit('zoomed', { viewport: s.viewport, type: 'wheel' });
    const world = s.viewport.toWorld(100, 170);
    expect(at(dot)).toEqual(pt(world.x, world.y));
    expect(dot.getLocalBounds().width).toBeGreaterThan(before * 2);
  });

  it('snaps or lets go with Alt pressed while the pointer rests', () => {
    const s = scene();
    s.tool({ mode: 'line' });
    s.hover(68, 73);
    const dot = part(s, 'placing-dot');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    expect(at(dot)).toEqual(pt(68, 73));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
    expect(at(dot)).toEqual(pt(70, 70));
  });

  it('shows nothing while the canvas shows the players\' picture, or a text is typed', () => {
    const s = scene();
    s.tool({ mode: 'stamp' });
    s.hover(100, 170);
    s.store.getState().setGMView(false);
    expect(placing(s)).toBeNull();
    expect(s.viewport.cursor).toBe('default');
    expect(s.hover(100, 170)).toBeNull();
    s.store.getState().setGMView(true);
    expect(s.hover(100, 170)).toBe('none');
    expect(placing(s)).toBe('stamp');
    s.tool({ mode: 'text' });
    expect(s.hover(100, 170)).toBe('text');
    s.click(100, 170);
    expect(s.field()).not.toBeNull();
    expect(s.viewport.cursor).toBe('default');
    expect(s.hover(300, 300)).toBeNull();
  });

  it('writes nothing to the store, however far the pointer moves', () => {
    const s = scene();
    s.tool({ mode: 'stamp' });
    const heard = vi.fn();
    const stop = s.store.subscribe(heard);
    for (let x = 0; x < 700; x += 7) s.hover(x, 100 + (x % 90));
    stop();
    expect(heard).not.toHaveBeenCalled();
    expect(steps(s)).toBe(0);
  });
});
