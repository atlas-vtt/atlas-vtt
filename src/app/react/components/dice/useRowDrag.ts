import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/** How far a press moves before it is a drag, so a tap on a die's × stays a tap. */
const DRAG_THRESHOLD = 4;

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

/** The place whose centre lies nearest `point`. */
function nearest(centres: readonly Point[], point: Point): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  centres.forEach((centre, index) => {
    const d = (centre.x - point.x) ** 2 + (centre.y - point.y) ** 2;
    if (d < distance) {
      best = index;
      distance = d;
    }
  });
  return best;
}

/**
 * Reordering the places of a row that may wrap into a grid, by pointer, as on a phone's home screen: the held place
 * follows the pointer, the places it passes slide into their neighbour's place by CSS (`translate`), and the new
 * order is handed to `onMove` once, on release. Pointer events with the pointer captured, so a finger drags as the
 * mouse does; a cancelled pointer drops nothing. `row` is the element whose first `count` children are the places.
 */
export function useRowDrag(row: React.RefObject<HTMLElement | null>, count: number, onMove: (from: number, to: number) => void): RowDrag {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settling, setSettling] = useState(false);
  const current = useRef<Drag | null>(null);
  current.current = drag;

  useEffect(() => {
    if (!settling) return undefined;
    const win = row.current?.ownerDocument.defaultView ?? window;
    const frame = win.requestAnimationFrame(() => setSettling(false));
    return () => win.cancelAnimationFrame(frame);
  }, [settling, row]);

  const onPointerDown = (index: number, event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || !row.current) return;
    const centres = [...row.current.children].slice(0, count).map((child) => {
      const rect = child.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, from: index, to: index, start: { x: event.clientX, y: event.clientY }, delta: { x: 0, y: 0 }, moved: false, centres });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const now = current.current;
    if (!now || event.pointerId !== now.pointerId) return;
    const delta = { x: event.clientX - now.start.x, y: event.clientY - now.start.y };
    const moved = now.moved || Math.hypot(delta.x, delta.y) > DRAG_THRESHOLD;
    const held = now.centres[now.from]!;
    const to = moved ? nearest(now.centres, { x: held.x + delta.x, y: held.y + delta.y }) : now.from;
    setDrag({ ...now, delta, moved, to });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>): void => {
    const now = current.current;
    if (!now || event.pointerId !== now.pointerId) return;
    setDrag(null);
    if (now.moved && now.to !== now.from) {
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
