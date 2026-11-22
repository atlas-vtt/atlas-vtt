import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How far a press moves before it is a drag, so a click on a place stays a click. */
const DRAG_THRESHOLD = 4;
/** How near its top or bottom edge the pointer scrolls a list, and how fast (px per second): from the slowest at the
 * zone's start to the fastest at the edge and past it. Measured in time, so every display scrolls alike. */
const SCROLL_EDGE = 64;
const SCROLL_SLOWEST = 300;
const SCROLL_FASTEST = 2000;
/** A frame that came late (a busy main thread) scrolls no further than one this long would. */
const SCROLL_FRAME_MAX_MS = 50;

/** The attribute that keeps a place among its own: a held place only lands among places of the same group. */
export const DRAG_GROUP_ATTRIBUTE = 'data-drag-group';

interface Point {
  x: number;
  y: number;
}

/** A place as it was measured at the press: its centre, and its top and bottom edge. */
interface Box extends Point {
  top: number;
  bottom: number;
}

interface Drag {
  pointerId: number;
  from: number;
  to: number;
  start: Point;
  /** Where the pointer is now, and how far the list has scrolled since the press. */
  pointer: Point;
  scrolled: number;
  scrollStart: number;
  /** How far the held place has moved in the list's content, scrolling included. */
  delta: Point;
  moved: boolean;
  /** Each place as it was when the drag began: the row may wrap into a grid. */
  boxes: Box[];
  axis: RowDragOptions['axis'];
  /** The group of each place (`DRAG_GROUP_ATTRIBUTE`). */
  groups: (string | null)[];
}

export interface RowDragOptions {
  /** A list of one column moves its held place up and down only. */
  axis?: 'both' | 'vertical';
  /** The element the places scroll in: held near its top or bottom edge, a place scrolls it on. */
  scroller?: () => HTMLElement | null;
}

export interface RowDrag {
  /** Starts a drag of the place at `index` from a press on it. */
  onPointerDown: (index: number, event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  /**
   * How far the place at `index` stands aside (or, held, follows the pointer), as a CSS `translate`; unset while
   * nothing is held, so a place's own stylesheet may move it then.
   */
  offsetOf: (index: number) => string | undefined;
  /** The place being held, or null. */
  held: number | null;
  /** True for the one render after a drop, while the row takes its new order without sliding. */
  settling: boolean;
}

/**
 * How far the held place moves to land at `index`: in a row or grid it takes that place's centre; in a column, whose
 * places may differ in height (a side and its cards), its edge meets that place's far edge.
 */
function landing(drag: Drag, index: number): Point {
  const held = drag.boxes[drag.from]!;
  const at = drag.boxes[index]!;
  if (drag.axis !== 'vertical') return { x: at.x - held.x, y: at.y - held.y };
  return { x: 0, y: index > drag.from ? at.bottom - held.bottom : at.top - held.top };
}

/** The places of the held one's group. */
function ownPlaces(drag: Drag): number[] {
  return drag.boxes.flatMap((_, index) => (drag.groups[index] === drag.groups[drag.from] ? [index] : []));
}

/** The place of the held one's group whose landing lies nearest `delta`. */
function nearest(drag: Drag, delta: Point): number {
  let best = drag.from;
  let distance = Number.POSITIVE_INFINITY;
  for (const index of ownPlaces(drag)) {
    const at = landing(drag, index);
    const d = (at.x - delta.x) ** 2 + (at.y - delta.y) ** 2;
    if (d < distance) {
      best = index;
      distance = d;
    }
  }
  return best;
}

/** How far the held place may move either way: as far as the first and last places of its group. */
function groupReach(drag: Drag): { min: Point; max: Point } {
  const reach = ownPlaces(drag).map((index) => landing(drag, index));
  const xs = reach.map((at) => at.x);
  const ys = reach.map((at) => at.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** The drag with the pointer at `pointer` and the list scrolled `scrolled` since the press. */
function follow(drag: Drag, pointer: Point, scrolled: number): Drag {
  const moved = drag.moved || Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) > DRAG_THRESHOLD;
  const { min, max } = groupReach(drag);
  const pulled = { x: drag.axis === 'vertical' ? 0 : pointer.x - drag.start.x, y: pointer.y - drag.start.y + scrolled };
  const delta = { x: Math.min(Math.max(pulled.x, min.x), max.x), y: Math.min(Math.max(pulled.y, min.y), max.y) };
  const to = moved ? nearest(drag, delta) : drag.from;
  return { ...drag, pointer, scrolled, delta, moved, to };
}

/** How fast to scroll `box` (px per second) with the pointer at height `y`: none unless near an edge, and none past the group's end. */
function edgeScroll(box: DOMRect, y: number, drag: Drag): number {
  const { min, max } = groupReach(drag);
  const speed = (distance: number): number => {
    const depth = Math.min(1, (SCROLL_EDGE - distance) / SCROLL_EDGE);
    return SCROLL_SLOWEST + (SCROLL_FASTEST - SCROLL_SLOWEST) * depth * depth;
  };
  if (y - box.top < SCROLL_EDGE && drag.delta.y > min.y) return -speed(y - box.top);
  if (box.bottom - y < SCROLL_EDGE && drag.delta.y < max.y) return speed(box.bottom - y);
  return 0;
}

/** The `translate` an element is drawn with now. */
function translationOf(element: Element): Point {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element).translate ?? 'none';
  const [x = '0', y = '0'] = style === 'none' ? [] : style.split(' ');
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
}

/**
 * Where `element` stands in its layout, `scrolled` since the press added back: its centre as drawn (a lift's scale and
 * a shiver's turn leave it), without its `translate`, and its layout height.
 */
function measure(element: Element, scrolled = 0): Box {
  const rect = element.getBoundingClientRect();
  const moved = translationOf(element);
  const height = (element as HTMLElement).offsetHeight || rect.height;
  const x = rect.left + rect.width / 2 - moved.x;
  const y = rect.top + rect.height / 2 - moved.y + scrolled;
  return { x, y, top: y - height / 2, bottom: y + height / 2 };
}

/** The click a drop ends in is no click on what was dropped: it is taken before anything hears it. */
function swallowNextClick(win: Window): void {
  const swallow = (event: MouseEvent): void => {
    event.stopPropagation();
    event.preventDefault();
  };
  win.addEventListener('click', swallow, { capture: true, once: true });
  // A drop that ends outside the place sends no click: the next real one must not be taken
  win.setTimeout(() => win.removeEventListener('click', swallow, { capture: true }), 0);
}

/**
 * Reordering places by pointer, as on a phone's home screen: the held place follows the pointer, the places it passes
 * slide into their neighbour's place by CSS (`translate`), and the new order is handed to `onMove` once, on release.
 * `places` gives the places in their order (a row that may wrap into a grid, a list split into groups). A place marked
 * with a group (`DRAG_GROUP_ATTRIBUTE`) lands only among its group, whose places follow each other. The pointer is
 * captured once the press becomes a drag, so a finger drags as the mouse does and a plain click still reaches what was
 * pressed; a cancelled pointer drops nothing. The held place stops at the first and last places of its group. Places
 * that scroll (`scroller`) are measured in the list's content, and held near its top or bottom edge a place scrolls the
 * list on until its group ends.
 */
export function useRowDrag(places: () => readonly Element[], onMove: (from: number, to: number) => void, { axis = 'both', scroller }: RowDragOptions = {}): RowDrag {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settling, setSettling] = useState(false);
  const current = useRef<Drag | null>(null);
  current.current = drag;
  // The window the places are in: a popout's frames run on its own
  const win = useRef<Window>(window);

  useEffect(() => {
    if (!settling) return undefined;
    const view = win.current;
    const frame = view.requestAnimationFrame(() => setSettling(false));
    return () => view.cancelAnimationFrame(frame);
  }, [settling]);

  // While a place is held the list scrolls on near its edges, and follows a scroll the pointer made (a wheel)
  const holding = drag?.moved === true;
  const scrollerRef = useRef(scroller);
  scrollerRef.current = scroller;
  useEffect(() => {
    const box = holding ? scrollerRef.current?.() : null;
    if (!box) return undefined;
    const view = box.ownerDocument.defaultView ?? window;
    let last: number | null = null;
    // What a step scrolled less than asked, as the list scrolls by whole pixels on some screens
    let carry = 0;
    const tick = (time: number): void => {
      const elapsed = last === null ? 0 : Math.min(time - last, SCROLL_FRAME_MAX_MS);
      last = time;
      const now = current.current;
      if (now?.moved) {
        const speed = edgeScroll(box.getBoundingClientRect(), now.pointer.y, now);
        if (speed === 0) carry = 0;
        else {
          const target = box.scrollTop + carry + (speed * elapsed) / 1000;
          // The list glides when it is scrolled (`scroll-behavior: smooth`); a drag moves it at once
          box.scrollTo({ top: target, behavior: 'instant' });
          carry = Math.max(-1, Math.min(1, target - box.scrollTop));
        }
        const scrolled = box.scrollTop - now.scrollStart;
        if (scrolled !== now.scrolled) setDrag(follow(now, now.pointer, scrolled));
      }
      frame = view.requestAnimationFrame(tick);
    };
    let frame = view.requestAnimationFrame(tick);
    return () => view.cancelAnimationFrame(frame);
  }, [holding]);

  // A place may change its shape as it is lifted (a side piles its cards up): the places are measured again once the
  // lift is laid out, before it is painted
  useLayoutEffect(() => {
    const now = current.current;
    if (!holding || !now) return;
    const elements = places();
    if (elements.length !== now.boxes.length) return;
    setDrag(follow({ ...now, boxes: elements.map((element) => measure(element, now.scrolled)) }, now.pointer, now.scrolled));
    // Only as the lift begins: `places` is a new function every render
  }, [holding]);

  const onPointerDown = (index: number, event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    const elements = places();
    if (!elements[index]) return;
    const boxes = elements.map((element) => measure(element));
    const groups = elements.map((element) => element.getAttribute(DRAG_GROUP_ATTRIBUTE));
    const start = { x: event.clientX, y: event.clientY };
    setDrag({
      pointerId: event.pointerId, from: index, to: index, start, pointer: start, scrolled: 0, scrollStart: scroller?.()?.scrollTop ?? 0,
      delta: { x: 0, y: 0 }, moved: false, boxes, groups, axis,
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const now = current.current;
    if (!now || event.pointerId !== now.pointerId) return;
    // Released elsewhere before it became a drag: the press is over
    if ((event.buttons & 1) === 0) {
      setDrag(null);
      return;
    }
    const next = follow(now, { x: event.clientX, y: event.clientY }, now.scrolled);
    if (next.moved && !now.moved) event.currentTarget.setPointerCapture(event.pointerId);
    setDrag(next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>): void => {
    const now = current.current;
    if (!now || event.pointerId !== now.pointerId) return;
    setDrag(null);
    if (!now.moved) return;
    win.current = event.currentTarget.ownerDocument.defaultView ?? window;
    swallowNextClick(win.current);
    if (now.to !== now.from) {
      setSettling(true);
      onMove(now.from, now.to);
    }
  };

  const onPointerCancel = (): void => setDrag(null);

  const offsetOf = (index: number): string | undefined => {
    if (!drag?.moved) return undefined;
    const { from, to, delta, boxes } = drag;
    if (index === from) return `${delta.x}px ${delta.y}px`;
    // The places between take one step towards where the held one came from: in a column by the held one's height and
    // the gap beside it, elsewhere into their neighbour's place.
    const step = from < to && index > from && index <= to ? -1 : to < from && index >= to && index < from ? 1 : 0;
    if (step === 0) return '0 0';
    if (drag.axis === 'vertical') {
      const by = step < 0 ? boxes[from]!.top - boxes[from + 1]!.top : boxes[from]!.bottom - boxes[from - 1]!.bottom;
      return `0px ${by}px`;
    }
    const own = boxes[index]!;
    const into = boxes[index + step]!;
    return `${into.x - own.x}px ${into.y - own.y}px`;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, offsetOf, held: drag?.moved ? drag.from : null, settling };
}
