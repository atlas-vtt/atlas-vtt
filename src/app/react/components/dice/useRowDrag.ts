import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/** How far a press moves before it is a drag, so a tap on a die's × stays a tap. */
const DRAG_THRESHOLD = 4;

interface Drag {
  pointerId: number;
  from: number;
  to: number;
  startX: number;
  dx: number;
  moved: boolean;
  /** Where each place of the row stood when the drag began, and the distance from one to the next. */
  lefts: number[];
  pitch: number;
}

export interface RowDrag {
  /** Starts a drag of the place at `index` from a press on it. */
  onPointerDown: (index: number, event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  /** How far the place at `index` stands aside (or, held, follows the pointer), in px. */
  offsetOf: (index: number) => number;
  /** The place being held, or null. */
  held: number | null;
  /** True for the one render after a drop, while the row takes its new order without sliding. */
  settling: boolean;
}

/**
 * Reordering one row by pointer, as on a phone's home screen: the held place follows the pointer, the places it
 * passes slide aside by CSS (`translate`), and the new order is handed to `onMove` once, on release. Pointer
 * events with the pointer captured, so a finger drags as the mouse does; a cancelled pointer drops nothing. `row` is the element whose children are the places.
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
    const lefts = [...row.current.children].slice(0, count).map((child) => child.getBoundingClientRect().left);
    const pitch = lefts.length > 1 ? lefts[1]! - lefts[0]! : 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, from: index, to: index, startX: event.clientX, dx: 0, moved: false, lefts, pitch });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const now = current.current;
    if (!now || event.pointerId !== now.pointerId) return;
    const dx = event.clientX - now.startX;
    const moved = now.moved || Math.abs(dx) > DRAG_THRESHOLD;
    const to = moved && now.pitch > 0 ? Math.max(0, Math.min(count - 1, Math.round(now.from + dx / now.pitch))) : now.from;
    setDrag({ ...now, dx, moved, to });
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

  const offsetOf = (index: number): number => {
    if (!drag?.moved) return 0;
    const { from, to, dx, pitch } = drag;
    if (index === from) return dx;
    if (from < to && index > from && index <= to) return -pitch;
    if (to < from && index >= to && index < from) return pitch;
    return 0;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, offsetOf, held: drag?.moved ? drag.from : null, settling };
}
