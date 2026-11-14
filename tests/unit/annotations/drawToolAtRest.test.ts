// @vitest-environment jsdom
import type { Container, EventSystem } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawingInput } from '../../../src/app/annotations/annotationTypes';
import { SELECTION_BAR } from '../../../src/app/pixi/annotations/BarMenuPress';
import { DRAW_TOOL_BARS } from '../../../src/app/pixi/annotations/TypingWatch';
import { drawScene, type DrawScene } from '../../helpers/drawScene';

// jsdom draws no glyphs: the turn handle's never arrives
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

type Point = { x: number; y: number };
const box = (x: number, y: number, more: Partial<DrawingInput> = {}): DrawingInput =>
  ({ type: 'rectangle', points: [{ x, y }, { x: x + 140, y }, { x: x + 140, y: y + 140 }, { x, y: y + 140 }, { x, y }], color: '#ffffff', width: 4, opacity: 1, fill: 'solid', ...more });

let s: DrawScene;
let bars: HTMLElement | undefined;
const put: (() => void)[] = [];
afterEach(() => {
  for (const back of put.splice(0)) back();
  bars?.remove();
  bars = undefined;
  s.destroy();
});

const canvas = (): HTMLElement => s.viewport.options.events.domElement;
const part = <T extends Container = Container>(name: string): T => s.renderer.chrome.getChildByLabel(name, true) as T;
/** The mark that shows what a press will place. */
const placing = (): string | null => ['dot', 'cell', 'stamp'].find((kind) => part(`placing-${kind}`).visible) ?? null;

/** The tool's bars as the view lays them out, with one menu button that stands open or closed. */
function barsWithMenu(open: boolean): HTMLButtonElement {
  bars = document.body.createDiv({ cls: DRAW_TOOL_BARS.slice(1) });
  return bars.createEl('button', { attr: { 'aria-haspopup': 'menu', 'aria-expanded': String(open) } });
}

/** A press on the map as the browser tells of it before the canvas hears it, then as the dispatch hands it on. */
function pressOnMap(x: number, y: number): boolean {
  canvas().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  const taken = s.press(x, y);
  s.pointer('pointerup', x, y);
  return taken;
}

/** The pointer rests at the screen point (x, y) of the canvas, over `under`, and no move has told the tool of it. */
function rest(x: number, y: number, under: () => Element | null = canvas): void {
  const events = s.viewport.options.events as { pointer?: unknown };
  events.pointer = { global: { x, y }, nativeEvent: { clientX: x, clientY: y, altKey: false, pointerType: 'mouse' } } as unknown as EventSystem['pointer'];
  const doc = canvas().ownerDocument as Document & { elementFromPoint?: Document['elementFromPoint'] };
  const before = doc.elementFromPoint;
  doc.elementFromPoint = () => under();
  put.push(() => {
    doc.elementFromPoint = before;
    delete events.pointer;
  });
}

describe('a press beside an open menu of the Draw tool\'s bars', () => {
  it('only closes the menu: no dot, no stamp, no path that waits, no text', () => {
    s = drawScene();
    const menu = barsWithMenu(true);
    for (const mode of ['pen', 'stamp', 'line', 'rectangle', 'text'] as const) {
      s.tool({ mode });
      expect(pressOnMap(300, 300)).toBe(true);
      expect(s.drawings()).toHaveLength(0);
      expect(s.renderer.drawing).toBe(false);
      expect(s.field()).toBeNull();
    }
    // The menu closed: the next press is the tool's again.
    menu.setAttribute('aria-expanded', 'false');
    s.tool({ mode: 'stamp' });
    expect(pressOnMap(300, 300)).toBe(false);
    expect(s.drawings()).toHaveLength(1);
  });

  it('leaves what is selected selected, in Select mode and for the shape just made', () => {
    s = drawScene();
    const id = s.store.getState().addDrawing(box(100, 100));
    const menu = barsWithMenu(true);
    for (const mode of ['select', 'rectangle'] as const) {
      s.tool({ mode });
      s.store.getState().setSelection([id]);
      expect(pressOnMap(600, 500)).toBe(true);
      expect(s.store.getState().selectedIds).toEqual([id]);
    }
    menu.setAttribute('aria-expanded', 'false');
    expect(pressOnMap(600, 500)).toBe(false);
    expect(s.store.getState().selectedIds).toEqual([]);
  });

  it('only closes a menu of the bar under a selection with the move tool: what is selected stays, nothing else is taken', () => {
    s = drawScene();
    const [first, second] = [s.store.getState().addDrawing(box(100, 100)), s.store.getState().addDrawing(box(400, 100))];
    s.store.getState().setActiveTool('move');
    s.store.getState().setSelection([first]);
    bars = document.body.createDiv({ cls: SELECTION_BAR });
    const button = bars.createEl('button', { attr: { 'aria-haspopup': 'menu', 'aria-expanded': 'true' } });
    expect(pressOnMap(470, 170)).toBe(true);
    expect(s.store.getState().selectedIds).toEqual([first]);
    button.setAttribute('aria-expanded', 'false');
    expect(pressOnMap(470, 170)).toBe(true);
    expect(s.store.getState().selectedIds).toEqual([second]);
  });
});

describe('the Draw tool taken into hand with the pointer at rest', () => {
  it('shows what a press will place at once, and hides the cursor', () => {
    s = drawScene();
    rest(300, 300);
    s.tool({ mode: 'pen' });
    expect(placing()).toBe('dot');
    expect(part('placing-dot').position).toMatchObject({ x: 300, y: 300 });
    expect(s.viewport.cursor).toBe('none');
    s.tool({ mode: 'stamp' });
    expect(placing()).toBe('stamp');
  });

  it('shows nothing while the pointer rests on a bar, a panel or another tab', () => {
    s = drawScene();
    rest(300, 300, () => document.body);
    s.tool({ mode: 'pen' });
    expect(placing()).toBeNull();
  });

  it('puts the eraser\'s ring under the pointer, not where it was last', () => {
    s = drawScene();
    s.tool({ mode: 'eraser' });
    s.pointer('pointermove', 100, 100);
    s.store.getState().setActiveTool('move');
    rest(420, 260);
    s.store.getState().setActiveTool('draw');
    const ring = (s.renderer as unknown as { host: { ring: { getDisplayObject(): Container } } }).host.ring.getDisplayObject();
    expect(ring.visible).toBe(true);
    expect(ring.position).toMatchObject({ x: 420, y: 260 });
  });

  it('shows the cursor of a text just typed under the pointer, where the field stood', () => {
    s = drawScene();
    s.tool({ mode: 'text' });
    s.hover(300, 300);
    s.click(300, 300);
    // The field opens under the pointer: the canvas hears that the pointer left it.
    s.leave();
    s.type('Vault');
    rest(300, 300);
    s.fieldKey('Enter');
    expect(s.texts()).toHaveLength(1);
    expect(s.viewport.cursor).toBe('pointer');
  });
});

describe('the cursor after a drag of a drawing', () => {
  const cursorAfterDrag = (end: (at: Point) => void): string => {
    const to = { x: 400, y: 400 };
    expect(s.press(170, 170)).toBe(true);
    s.pointer('pointermove', to.x, to.y);
    // As the viewport's dispatch does with every move.
    s.viewport.cursor = s.hover(to.x, to.y) ?? 'default';
    expect(s.viewport.cursor).toBe('grabbing');
    end(to);
    return s.viewport.cursor;
  };

  it('is the hand that moves again once the move tool lets go of it, with the pointer still on it', () => {
    s = drawScene();
    s.store.getState().addDrawing(box(100, 100));
    s.store.getState().setActiveTool('move');
    expect(cursorAfterDrag((to) => s.pointer('pointerup', to.x, to.y))).toBe('move');
  });

  it('is left to the tokens\' drag where the drawing moves with tokens', () => {
    s = drawScene();
    const id = s.store.getState().addDrawing(box(100, 100));
    const token = s.store.getState().addToken({ x: 600, y: 100, imagePath: 'art/a.png' });
    s.store.getState().setActiveTool('move');
    s.store.getState().setSelection([id, token]);
    s.hover(170, 170);
    expect(s.press(170, 170)).toBe(true);
    expect(s.dragTokens).toHaveBeenCalledTimes(1);
    s.pointer('pointermove', 400, 400);
    // The tokens' drag sets its own cursor when it ends.
    s.viewport.cursor = 'pointer';
    s.pointer('pointerup', 400, 400);
    expect(s.viewport.cursor).toBe('pointer');
  });

  it('is the arrow again after Escape put the drawing back from under the pointer', () => {
    s = drawScene();
    s.store.getState().addDrawing(box(100, 100));
    s.store.getState().setActiveTool('move');
    expect(cursorAfterDrag(() => expect(s.renderer.selecting.handleEscape()).toBe(true))).toBe('default');
  });
});
