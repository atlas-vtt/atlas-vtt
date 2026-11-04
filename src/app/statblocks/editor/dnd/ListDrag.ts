/**
 * One drag of an ability within its list (spec §7.2, §7.5), from a press on
 * its handle: our own press handling (threshold, pointer capture, Escape,
 * window blur, `pointercancel`) over the clamped list model of
 * `listDragGeometry`. Everything it binds is on the handle's own document and
 * window, so a popout works the same; `end` takes every mark, element and
 * listener away again. The handle takes no focus, so an ability being typed
 * keeps its input, its text and its caret through the drag.
 */

import { scrollNearEdge } from './autoScroll';
import type { Box, Point } from './dropGeometry';
import { ListDragView } from './listDragView';
import { clampToList, fragmentsOf, gapAt, gapLineOf, isNoMove, slidesFor, type Fragment, type ListItemBoxes } from './listDragGeometry';

/** A press becomes a drag after this many pixels (mouse, pen, trackpad). */
export const DRAG_THRESHOLD = 4;
/** A touch becomes a drag after resting this long within `TOUCH_TOLERANCE` px. */
export const TOUCH_DELAY_MS = 250;
const TOUCH_TOLERANCE = 5;
/** How far past its list the pointer pulls before the hint says why the ability stays. */
export const PULL_HINT = 24;

export interface ListDragHost {
  /** The list's items in order, read again whenever the list is measured. */
  items: () => HTMLElement[];
  /** The key of the item being moved. */
  itemKey: string;
  /** The scroller around the card, which scrolls near its edges; null without one. */
  scroller: HTMLElement | null;
  /** The drag began: the item is lifted. */
  onStart?: (() => void) | undefined;
  /** The gap the item would land in changed (null: where it is). */
  onGap?: ((gap: number | null, count: number) => void) | undefined;
  /** The pointer pulled past the list's edge, once per drag. */
  onPull?: (() => void) | undefined;
  /** Let go at a gap that moves the item, counted in the list as it stood. */
  onDrop: (from: number, gap: number) => void;
  /** Escape, a lost pointer, the window's blur, or letting go where it was. */
  onCancel: (started: boolean) => void;
}

function boxOf(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

export class ListDrag {
  private active = false;
  private ended = false;
  private items: ListItemBoxes[] = [];
  private fragments: Fragment[] = [];
  private elements: HTMLElement[] = [];
  private from = -1;
  private gap: number | null = null;
  private pulledOnce = false;
  private scrolledAt = 0;
  private pointer: Point;
  private grab: Point = { x: 0, y: 0 };
  private frame = 0;
  private touchTimer = 0;
  private view: ListDragView | null = null;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly pointerId: number;
  private readonly touch: boolean;

  constructor(private readonly host: ListDragHost, private readonly handle: HTMLElement, event: PointerEvent) {
    this.doc = handle.doc;
    this.win = handle.win;
    this.pointerId = event.pointerId;
    this.touch = event.pointerType === 'touch';
    this.pointer = { x: event.clientX, y: event.clientY };
    this.doc.addEventListener('pointermove', this.onMove, true);
    this.doc.addEventListener('pointerup', this.onUp, true);
    this.doc.addEventListener('pointercancel', this.onLost, true);
    this.doc.addEventListener('keydown', this.onKey, true);
    this.win.addEventListener('blur', this.onLost);
    if (this.touch) this.touchTimer = this.win.setTimeout(() => this.activate(), TOUCH_DELAY_MS);
  }

  /** Whether the press became a drag. */
  get started(): boolean {
    return this.active;
  }

  /** Stops the drag as a cancel (the surface went away). */
  cancel(): void {
    this.finish(false);
  }

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const moved = Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y);
    if (!this.active) {
      if (this.touch) {
        if (moved > TOUCH_TOLERANCE) this.finish(false);
        return;
      }
      if (moved < DRAG_THRESHOLD) return;
      this.activate();
    }
    event.preventDefault();
    this.pointer = { x: event.clientX, y: event.clientY };
    this.schedule();
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.finish(true);
  };

  private readonly onLost = (): void => this.finish(false);

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.finish(false);
  };

  private activate(): void {
    if (this.active || this.ended) return;
    this.measure();
    this.from = this.items.findIndex((item) => item.key === this.host.itemKey);
    const element = this.elements[this.from];
    if (!element) {
      this.finish(false);
      return;
    }
    this.active = true;
    try {
      this.handle.setPointerCapture(this.pointerId);
    } catch {
      // A pointer the browser no longer knows: the document's listeners still follow it.
    }
    const box = element.getBoundingClientRect();
    this.grab = { x: this.pointer.x - box.left, y: this.pointer.y - box.top };
    this.view = new ListDragView(this.doc, element, this.fragments);
    this.scrolledAt = this.host.scroller?.scrollTop ?? 0;
    this.host.onStart?.();
    this.update();
  }

  private measure(): void {
    this.elements = this.host.items();
    this.items = this.elements.map((element) => ({
      key: element.getAttribute('data-item-key') ?? '',
      rects: [...element.getClientRects()].map(boxOf),
    }));
    this.fragments = fragmentsOf(this.items);
  }

  private schedule(): void {
    this.win.cancelAnimationFrame(this.frame);
    this.frame = this.win.requestAnimationFrame(() => this.update());
  }

  /** The measured boxes as they stand now: the scroller moved them by what it scrolled since. */
  private scrolled(): { items: ListItemBoxes[]; fragments: Fragment[] } {
    const dy = this.scrolledAt - (this.host.scroller?.scrollTop ?? 0);
    if (dy === 0) return { items: this.items, fragments: this.fragments };
    const move = (box: Box): Box => ({ ...box, top: box.top + dy, bottom: box.bottom + dy });
    return { items: this.items.map((item) => ({ ...item, rects: item.rects.map(move) })), fragments: this.fragments.map(move) };
  }

  private update(): void {
    if (!this.active || !this.view) return;
    if (this.host.scroller && scrollNearEdge(this.host.scroller, this.pointer)) this.schedule();
    const { items, fragments } = this.scrolled();
    const clamped = clampToList(fragments, this.pointer);
    const fragment = clamped ? fragments[clamped.fragment] : undefined;
    if (!clamped || !fragment) return;
    if (clamped.pulled > PULL_HINT && !this.pulledOnce) {
      this.pulledOnce = true;
      this.host.onPull?.();
    }
    const gap = gapAt(items, fragment, clamped.point.y);
    const next = isNoMove(this.from, gap) ? null : gap;
    const plan = next === null ? null : slidesFor(items, this.from, next);
    this.view.show({
      ghost: { left: fragment.left, top: clamped.point.y - this.grab.y, bounds: fragment },
      line: next === null ? null : plan?.line ?? gapLineOf(items, next),
      slides: plan?.shifts ?? null,
      elements: this.elements,
      keys: items.map((item) => item.key),
      fragments,
    });
    if (next !== this.gap) {
      this.gap = next;
      this.host.onGap?.(next, items.length);
    }
  }

  private finish(drop: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.win.clearTimeout(this.touchTimer);
    this.win.cancelAnimationFrame(this.frame);
    this.doc.removeEventListener('pointermove', this.onMove, true);
    this.doc.removeEventListener('pointerup', this.onUp, true);
    this.doc.removeEventListener('pointercancel', this.onLost, true);
    this.doc.removeEventListener('keydown', this.onKey, true);
    this.win.removeEventListener('blur', this.onLost);
    this.view?.remove();
    this.view = null;
    if (this.active) {
      try {
        this.handle.releasePointerCapture(this.pointerId);
      } catch {
        // Already released with the pointer.
      }
      this.swallowClick();
    }
    if (drop && this.active && this.gap !== null) this.host.onDrop(this.from, this.gap);
    else this.host.onCancel(this.active);
  }

  /** The click that follows a drag's release on the captured handle is not a click on it: it opens no menu. */
  private swallowClick(): void {
    const stop = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    this.doc.addEventListener('click', stop, { capture: true, once: true });
    this.win.setTimeout(() => this.doc.removeEventListener('click', stop, { capture: true }), 0);
  }
}
