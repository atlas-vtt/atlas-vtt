import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/** How far a press moves before it is a drag, so a click on a place stays a click. */
const DRAG_THRESHOLD = 4;

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
  delta: Point;
  moved: boolean;
  /** The centre of each place when the drag began: the row may wrap into a grid. */
  centres: Point[];
  /** The group of each place (`DRAG_GROUP_ATTRIBUTE`). */
  groups: (string | null)[];
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
 * pressed; a cancelled pointer drops nothing.
 */
export function useRowDrag(places: () => readonly Element[], onMove: (from: number, to: number) => void): RowDrag {
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

  const onPointerDown = (index: number, event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    const elements = places();
    if (!elements[index]) return;
    const centres = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const groups = elements.map((element) => element.getAttribute(DRAG_GROUP_ATTRIBUTE));
    setDrag({ pointerId: event.pointerId, from: index, to: index, start: { x: event.clientX, y: event.clientY }, delta: { x: 0, y: 0 }, moved: false, centres, groups });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const now = current.current;
    if (!now || event.pointerId !== now.pointerId) return;
    // Released elsewhere before it became a drag: the press is over
    if ((event.buttons & 1) === 0) {
      setDrag(null);
      return;
    }
    const delta = { x: event.clientX - now.start.x, y: event.clientY - now.start.y };
    const moved = now.moved || Math.hypot(delta.x, delta.y) > DRAG_THRESHOLD;
    if (moved && !now.moved) event.currentTarget.setPointerCapture(event.pointerId);
    const held = now.centres[now.from]!;
    const to = moved ? nearest(now, { x: held.x + delta.x, y: held.y + delta.y }) : now.from;
    setDrag({ ...now, delta, moved, to });
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
