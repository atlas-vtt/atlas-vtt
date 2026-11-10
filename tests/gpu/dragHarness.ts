/**
 * Pointer drags for the template editor's browser tests: pointer events sent
 * in the window an element lives in (a popout stand-in included), one move
 * per frame, as a mouse sends them.
 */

import { frames } from './sidePanesHarness';

export interface Point {
  x: number;
  y: number;
}

type PointerType = 'pointerdown' | 'pointermove' | 'pointerup';

/** The middle of an element, or a point inside its box at fractions of its width and height. */
export function pointIn(element: Element, fx = 0.5, fy = 0.5): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width * fx, y: rect.top + rect.height * fy };
}

/** Sends one pointer event at a client point of `win`, to whatever is drawn there. */
export function pointer(win: Window, type: PointerType, at: Point): void {
  const doc = win.document;
  const target = doc.elementFromPoint(at.x, at.y) ?? doc.body;
  const Event = (win as Window & typeof globalThis).PointerEvent;
  target.dispatchEvent(new Event(type, {
    bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, pointerId: 1, pointerType: 'mouse',
    isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, view: win,
  }));
}

/** Presses at `from`, moves past the drag threshold, then on to `to` in `steps` frames; the pointer stays down. */
export async function pickUpAndMove(win: Window, from: Point, to: Point, steps = 8): Promise<void> {
  pointer(win, 'pointerdown', from);
  pointer(win, 'pointermove', { x: from.x + 6, y: from.y + 6 });
  await frames(1, win);
  for (let step = 1; step <= steps; step++) {
    pointer(win, 'pointermove', { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps });
    await frames(1, win);
  }
  await frames(2, win);
}

/**
 * Points at a block, as the pointer coming over it does, and returns its
 * gutter handle: the only place a pointer drag of a block starts (spec §7.1).
 */
export async function gripOf(frame: Element): Promise<HTMLElement> {
  const win = frame.ownerDocument.defaultView ?? window;
  pointer(win, 'pointermove', pointIn(frame));
  await frames(2, win);
  const grip = frame.ownerDocument.querySelector<HTMLElement>('.atlas-sb-handle[data-glyph="grip"]');
  if (!grip) throw new Error('The block shows no handle.');
  return grip;
}

/** Lets go where the pointer is. */
export async function drop(win: Window, at: Point): Promise<void> {
  pointer(win, 'pointerup', at);
  await frames(2, win);
}

/** The drop line's middle, in client coordinates; null while none shows. */
export function dropLine(doc: Document = document): (Point & { orientation: string }) | null {
  const line = doc.querySelector<HTMLElement>('.atlas-te-drop-line');
  if (!line) return null;
  return { ...pointIn(line), orientation: line.dataset.orientation ?? '' };
}

/** Sends a key press (keydown) to an element of whatever window it lives in. */
export function press(target: Element, key: string, code: string = key): void {
  const win = target.ownerDocument.defaultView ?? window;
  const Event = (win as Window & typeof globalThis).KeyboardEvent;
  target.dispatchEvent(new Event('keydown', { key, code, bubbles: true, cancelable: true, composed: true, view: win }));
}

type PopoutWindow = Window & typeof globalThis;

/**
 * A second window, as Obsidian's popouts are: the page's styles copied into
 * its head, and Obsidian's node helpers (`win`, `doc`, `instanceOf`) on its
 * own prototypes, `instanceOf` matching a class of either window by name.
 */
export function openPopout(): { win: PopoutWindow; container: HTMLElement; close: () => void } {
  const win = window.open('', `atlas-popout-${Date.now()}`, 'width=1100,height=760') as PopoutWindow | null;
  if (!win) throw new Error('The browser opened no popout window.');
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) win.document.head.append(node.cloneNode(true));
  Object.defineProperties(win.Node.prototype, {
    doc: { get(this: Node) { return this.ownerDocument ?? win.document; }, configurable: true },
    win: { get(this: Node) { return this.ownerDocument?.defaultView ?? win; }, configurable: true },
  });
  Object.defineProperty(win.Element.prototype, 'instanceOf', {
    configurable: true,
    value(this: Element, type: { name: string; prototype: unknown }): boolean {
      const own = (win as unknown as Record<string, unknown>)[type.name];
      return this instanceof (type as unknown as typeof Element) || (typeof own === 'function' && this instanceof (own as typeof Element));
    },
  });
  // Obsidian gives every window's elements its DOM helpers (`createDiv`, …): the main window's, as the setup installed them.
  for (const name of ['createDiv', 'createEl', 'createSpan']) {
    const helper = (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
    if (typeof helper === 'function') Object.defineProperty(win.HTMLElement.prototype, name, { configurable: true, value: helper });
  }
  win.document.body.style.margin = '0';
  const container = win.document.createElement('div');
  win.document.body.append(container);
  return { win, container, close: () => win.close() };
}
