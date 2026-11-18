import { LongPress, type PressClock } from './longPress';
import { noteTouchMenu } from './touchMenuPoint';

/** What is Atlas' own in a document: its views and cards, and what it portals to the body (menus, dialogs, panels). */
const ATLAS_ELEMENT = '.atlas-vtt-plugin, :not(body):not(html)[class*="atlas-"]';
/**
 * Where a long press is the system's: text is selected and edited there. The map's canvas has
 * its own gestures (`TouchGestures`).
 */
const NOT_BRIDGED = 'input, textarea, select, [contenteditable], .cm-editor, .markdown-source-view, .markdown-reading-view, .markdown-preview-view, canvas';

const HAPTIC_MS = 10;

/** Whether a long press on `target` is turned into a secondary click. */
export function bridgesLongPress(target: EventTarget | null): target is Element {
  if (!isElement(target)) return false;
  return target.closest(ATLAS_ELEMENT) !== null && target.closest(NOT_BRIDGED) === null;
}

function isElement(target: EventTarget | null): target is Element {
  return target !== null && 'closest' in target && typeof target.closest === 'function';
}

/**
 * The secondary click of a finger, for everything Atlas draws outside the map. A finger that
 * rests on an Atlas element sends it the `contextmenu` event a right-click sends, which is what
 * Atlas' own handlers and Obsidian's listen for; so no handler knows about touch.
 *
 * One timing on every device: iOS never sends `contextmenu` for a touch, and Android's web view
 * sends its own about 100 ms later, which is swallowed here. The tap that would follow the
 * release is swallowed too, text under the finger is not selected, and a list that scrolls
 * under the finger ends the press.
 */
export class ContextMenuBridge {
  private readonly win: Window;
  private readonly longPress: LongPress;
  private readonly own = new WeakSet<Event>();
  private target: Element | null = null;
  private pointerId: number | null = null;
  /** The long press fired: the release that follows is no click. */
  private fired = false;
  /** Touch pointers down in the document, on Atlas' elements or not. */
  private touches = 0;

  constructor(private readonly doc: Document, clock?: PressClock) {
    this.win = doc.defaultView ?? window;
    const timers: PressClock = clock ?? {
      setTimeout: (run, ms) => this.win.setTimeout(run, ms),
      clearTimeout: (id) => this.win.clearTimeout(id),
    };
    this.longPress = new LongPress(timers, (at) => this.fire(at.x, at.y));
    doc.addEventListener('pointerdown', this.onPointerDown, true);
    doc.addEventListener('pointermove', this.onPointerMove, true);
    doc.addEventListener('pointerup', this.onPointerEnd, true);
    doc.addEventListener('pointercancel', this.onPointerEnd, true);
    doc.addEventListener('scroll', this.drop, true);
    doc.addEventListener('contextmenu', this.onContextMenu, true);
    doc.addEventListener('click', this.onClick, true);
    doc.addEventListener('selectstart', this.onSelectStart, true);
    this.win.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    this.drop();
    const { doc } = this;
    doc.removeEventListener('pointerdown', this.onPointerDown, true);
    doc.removeEventListener('pointermove', this.onPointerMove, true);
    doc.removeEventListener('pointerup', this.onPointerEnd, true);
    doc.removeEventListener('pointercancel', this.onPointerEnd, true);
    doc.removeEventListener('scroll', this.drop, true);
    doc.removeEventListener('contextmenu', this.onContextMenu, true);
    doc.removeEventListener('click', this.onClick, true);
    doc.removeEventListener('selectstart', this.onSelectStart, true);
    this.win.removeEventListener('blur', this.onBlur);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    this.touches++;
    this.fired = false;
    // A second finger is a gesture of two, never a press
    if (this.touches > 1 || !bridgesLongPress(event.target)) {
      this.drop();
      return;
    }
    this.target = event.target;
    this.pointerId = event.pointerId;
    this.longPress.begin({ x: event.clientX, y: event.clientY });
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.longPress.pending) return;
    if (!this.longPress.move({ x: event.clientX, y: event.clientY })) this.target = null;
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    this.touches = Math.max(0, this.touches - 1);
    if (event.pointerId !== this.pointerId) return;
    this.drop();
    // A press the browser took away is followed by no click
    if (event.type === 'pointercancel') this.fired = false;
  };

  /** The press is no long press any more: the finger left, moved, or the list under it scrolled. */
  private readonly drop = (): void => {
    this.longPress.cancel();
    this.target = null;
    this.pointerId = null;
  };

  private readonly onBlur = (): void => {
    this.drop();
    this.touches = 0;
    this.fired = false;
  };

  private fire(x: number, y: number): void {
    const target = this.target;
    this.target = null;
    if (!target?.isConnected) return;
    this.fired = true;
    noteTouchMenu(x, y);
    if ('vibrate' in this.win.navigator) this.win.navigator.vibrate(HAPTIC_MS);
    // The window's own constructor: a popout's document gets a popout's event
    const view = this.doc.defaultView ?? window;
    const event = new view.MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 2, buttons: 2 });
    this.own.add(event);
    target.dispatchEvent(event);
  }

  /** The web view's own `contextmenu` for a finger on an Atlas element: Atlas has sent its own, or will. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.own.has(event) || !bridgesLongPress(event.target)) return;
    const byTouch = this.touches > 0 || ('pointerType' in event && event.pointerType === 'touch');
    if (!byTouch) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (!this.fired) return;
    this.fired = false;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onSelectStart = (event: Event): void => {
    if (this.longPress.pending || this.fired) event.preventDefault();
  };
}
