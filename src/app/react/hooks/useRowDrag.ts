import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/** How far a press moves before it is a drag, so a click on a place stays a click. */
const DRAG_THRESHOLD = 4;
/** How near its top or bottom edge the pointer scrolls a list, and how fast at most (px per frame), faster further in. */
const SCROLL_EDGE = 56;
const SCROLL_SPEED = 14;

/** The attribute that keeps a place among its own: a held place only lands among places of the same group. */
export const DRAG_GROUP_ATTRIBUTE = 'data-drag-group';

interface Point {
  x: number;
  y: number;
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
  /** The centre of each place when the drag began: the row may wrap into a grid. */
  centres: Point[];
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
  /** How far the place at `index` stands aside (or, held, follows the pointer), as a CSS `translate`. */
  offsetOf: (index: number) => string;
  /** The place being held, or null. */
  held: number | null;
  /** True for the one render after a drop, while the row takes its new order without sliding. */
  settling: boolean;
}

/** The place of the held one's group whose centre lies nearest `point`. */
function nearest(drag: Drag, point: Point): number {
  let best = drag.from;
  let distance = Number.POSITIVE_INFINITY;
  drag.centres.forEach((centre, index) => {
    if (drag.groups[index] !== drag.groups[drag.from]) return;
    const d = (centre.x - point.x) ** 2 + (centre.y - point.y) ** 2;
    if (d < distance) {
      best = index;
      distance = d;
    }
  });
  return best;
}

/** How far the held place may move either way: as far as the first and last places of its group. */
function groupReach(drag: Drag): { min: Point; max: Point } {
  const held = drag.centres[drag.from]!;
  const own = drag.centres.filter((_, index) => drag.groups[index] === drag.groups[drag.from]);
  const xs = own.map((centre) => centre.x - held.x);
  const ys = own.map((centre) => centre.y - held.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** The drag with the pointer at `pointer` and the list scrolled `scrolled` since the press. */
function follow(drag: Drag, pointer: Point, scrolled: number, axis: RowDragOptions['axis']): Drag {
  const moved = drag.moved || Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) > DRAG_THRESHOLD;
  const { min, max } = groupReach(drag);
  const pulled = { x: axis === 'vertical' ? 0 : pointer.x - drag.start.x, y: pointer.y - drag.start.y + scrolled };
  const delta = { x: Math.min(Math.max(pulled.x, min.x), max.x), y: Math.min(Math.max(pulled.y, min.y), max.y) };
  const held = drag.centres[drag.from]!;
  const to = moved ? nearest(drag, { x: held.x + delta.x, y: held.y + delta.y }) : drag.from;
  return { ...drag, pointer, scrolled, delta, moved, to };
}

/** How far to scroll `box` this frame with the pointer at height `y`: none unless near an edge, and none past the group's end. */
function edgeScroll(box: DOMRect, y: number, drag: Drag): number {
  const { min, max } = groupReach(drag);
  const share = (distance: number): number => Math.min(1, (SCROLL_EDGE - distance) / SCROLL_EDGE);
  if (y - box.top < SCROLL_EDGE && drag.delta.y > min.y) return -SCROLL_SPEED * share(y - box.top);
  if (box.bottom - y < SCROLL_EDGE && drag.delta.y < max.y) return SCROLL_SPEED * share(box.bottom - y);
  return 0;
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
    const tick = (): void => {
      const now = current.current;
      if (now?.moved) {
        const speed = edgeScroll(box.getBoundingClientRect(), now.pointer.y, now);
        // The list glides when it is scrolled (`scroll-behavior: smooth`); a drag moves it at once
        if (speed !== 0) box.scrollTo({ top: box.scrollTop + speed, behavior: 'instant' });
        const scrolled = box.scrollTop - now.scrollStart;
        if (scrolled !== now.scrolled) setDrag(follow(now, now.pointer, scrolled, axis));
      }
      frame = view.requestAnimationFrame(tick);
    };
    let frame = view.requestAnimationFrame(tick);
    return () => view.cancelAnimationFrame(frame);
  }, [holding, axis]);

  const onPointerDown = (index: number, event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    const elements = places();
    if (!elements[index]) return;
    const centres = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const groups = elements.map((element) => element.getAttribute(DRAG_GROUP_ATTRIBUTE));
    const start = { x: event.clientX, y: event.clientY };
    setDrag({
      pointerId: event.pointerId, from: index, to: index, start, pointer: start, scrolled: 0, scrollStart: scroller?.()?.scrollTop ?? 0,
      delta: { x: 0, y: 0 }, moved: false, centres, groups,
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
    const next = follow(now, { x: event.clientX, y: event.clientY }, now.scrolled, axis);
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

  const offsetOf = (index: number): string => {
    if (!drag?.moved) return '0 0';
    const { from, to, delta, centres } = drag;
    if (index === from) return `${delta.x}px ${delta.y}px`;
    // The places between take one step towards where the held one came from.
    const step = from < to && index > from && index <= to ? -1 : to < from && index >= to && index < from ? 1 : 0;
    if (step === 0) return '0 0';
    const own = centres[index]!;
    const into = centres[index + step]!;
    return `${into.x - own.x}px ${into.y - own.y}px`;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, offsetOf, held: drag?.moved ? drag.from : null, settling };
}
