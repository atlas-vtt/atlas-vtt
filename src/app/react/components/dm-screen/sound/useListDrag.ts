import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { pressBecameDrag } from '../../../../input/pressBecameDrag';

/** A press becomes a drag after this many pixels; before that it is a press of what lies under it. */
const DRAG_THRESHOLD = 4;
/**
 * Where a finger presses the item itself and the list scrolls (`restBeforeDrag`): the press is a
 * drag once the finger has rested this long within this many pixels, the statblock editor's own
 * numbers for a finger's drag (`dndConfig.ts`). One that moves first scrolls the list.
 */
export const TOUCH_REST_MS = 250;
export const TOUCH_REST_SLOP = 5;
/** Pixels from a scroller's edge at which a drag scrolls it, and how far each move then goes. */
const SCROLL_EDGE = 24;
const SCROLL_STEP = 12;

function indexAt(grid: HTMLElement, selector: string, x: number, y: number): number | null {
  const cards = [...grid.querySelectorAll<HTMLElement>(selector)];
  let best: number | null = null;
  let bestDistance = Infinity;
  cards.forEach((card, index) => {
    const box = card.getBoundingClientRect();
    const distance = Math.hypot(box.left + box.width / 2 - x, box.top + box.height / 2 - y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export interface ListDrag<T> {
  /** The items as the drag would leave them. */
  shown: readonly T[];
  draggingId: string | null;
  start: (item: T, event: ReactPointerEvent<HTMLElement>) => void;
  /** Whether the click that ends a press belongs to a drag, and presses nothing. */
  consumeClick: () => boolean;
}

export interface ListDragOptions<T> {
  idOf: (item: T) => string;
  /** What in the list stands for its items, in their order. */
  selector: string;
  canMove: (item: T) => boolean;
  onDrop: (item: T, index: number) => void;
  /** Scrolls while the pointer holds near its edge. */
  scrollerRef?: RefObject<HTMLElement | null>;
  /**
   * The items are pressed themselves, in a list a finger scrolls by them: a finger's press (and a
   * pen's, which scrolls as a finger does) drags only once it has rested (`TOUCH_REST_MS`), and
   * scrolls where it moves first. A mouse drags as ever. The items must let the browser pan
   * (`touch-action: pan-y`), which the drag stops for as long as it lasts.
   */
  restBeforeDrag?: boolean;
}

function scrollNear(scroller: HTMLElement | null | undefined, y: number): void {
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  if (y < box.top + SCROLL_EDGE) scroller.scrollTop -= SCROLL_STEP;
  else if (y > box.bottom - SCROLL_EDGE) scroller.scrollTop += SCROLL_STEP;
}

/** Moves an item among the others under the pointer; Escape, a lost pointer, a blur or the list leaving the screen put it back. */
export function useListDrag<T>(gridRef: RefObject<HTMLElement | null>, items: readonly T[], { idOf, selector, canMove, onDrop, scrollerRef, restBeforeDrag = false }: ListDragOptions<T>): ListDrag<T> {
  const [drag, setDrag] = useState<{ id: string; index: number } | null>(null);
  const draggedRef = useRef(false);
  const endRef = useRef<(() => void) | null>(null);
  /** A finger's drag is under way: the browser must not scroll the list with it. */
  const fingerDragsRef = useRef(false);

  useEffect(() => () => endRef.current?.(), []);

  // A browser decides at the touch's start whether its moves can be refused, so the listener
  // stands for as long as the list does and refuses only the moves of a drag.
  useEffect(() => {
    const grid = gridRef.current;
    if (!restBeforeDrag || !grid) return undefined;
    const holdStill = (event: TouchEvent): void => {
      if (fingerDragsRef.current && event.cancelable) event.preventDefault();
    };
    grid.addEventListener('touchmove', holdStill, { passive: false });
    return () => grid.removeEventListener('touchmove', holdStill);
  }, [gridRef, restBeforeDrag]);

  const start = useCallback((item: T, event: ReactPointerEvent<HTMLElement>): void => {
    const grid = gridRef.current;
    if (event.button !== 0 || !grid || !canMove(item)) return;
    const doc = grid.ownerDocument;
    const win = doc.defaultView ?? window;
    const from = { x: event.clientX, y: event.clientY };
    const { pointerId } = event;
    let index: number | null = null;
    draggedRef.current = false;
    endRef.current?.();
    // A finger on the item itself may be scrolling the list: it drags once it has rested.
    let resting = restBeforeDrag && (event.pointerType === 'touch' || event.pointerType === 'pen');
    const rest = resting ? win.setTimeout(() => {
      resting = false;
      if (gridGone()) return;
      fingerDragsRef.current = true;
      draggedRef.current = true;
      // The finger rests on: its long press, due a little later, opens no menu on what it drags.
      pressBecameDrag();
      index = indexAt(grid, selector, from.x, from.y);
      if (index !== null) setDrag({ id: idOf(item), index });
    }, TOUCH_REST_MS) : null;
    // A hidden grid has no places: every card measures 0×0 and the nearest is always the first.
    const gridGone = (): boolean => grid.getClientRects().length === 0;

    const end = (): void => {
      endRef.current = null;
      if (rest !== null) win.clearTimeout(rest);
      fingerDragsRef.current = false;
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', end, true);
      doc.removeEventListener('keydown', key, true);
      win.removeEventListener('blur', end);
      setDrag(null);
      // The click of this press, if it has one, comes right after the release; the next press owes it nothing.
      win.setTimeout(() => { draggedRef.current = false; }, 0);
    };
    const move = (moved: PointerEvent): void => {
      if (moved.pointerId !== pointerId) return;
      if (gridGone()) {
        end();
        return;
      }
      if (resting) {
        // It moved before it rested: the list scrolls, and nothing is dragged.
        if (Math.hypot(moved.clientX - from.x, moved.clientY - from.y) > TOUCH_REST_SLOP) end();
        return;
      }
      if (index === null && Math.hypot(moved.clientX - from.x, moved.clientY - from.y) < DRAG_THRESHOLD) return;
      draggedRef.current = true;
      scrollNear(scrollerRef?.current, moved.clientY);
      const over = indexAt(grid, selector, moved.clientX, moved.clientY);
      if (over !== null && over !== index) {
        index = over;
        setDrag({ id: idOf(item), index: over });
      }
    };
    const up = (released: PointerEvent): void => {
      if (released.pointerId !== pointerId) return;
      const shownStill = !gridGone();
      end();
      if (index !== null && shownStill) onDrop(item, index);
    };
    const key = (pressed: KeyboardEvent): void => {
      if (pressed.key !== 'Escape' || index === null) return;
      pressed.preventDefault();
      pressed.stopPropagation();
      end();
    };
    endRef.current = end;
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', end, true);
    doc.addEventListener('keydown', key, true);
    win.addEventListener('blur', end);
  }, [gridRef, canMove, onDrop, idOf, selector, scrollerRef, restBeforeDrag]);

  const consumeClick = useCallback((): boolean => {
    const dragged = draggedRef.current;
    draggedRef.current = false;
    return dragged;
  }, []);

  let shown = items;
  if (drag) {
    const moved = items.find((item) => idOf(item) === drag.id);
    if (moved !== undefined) {
      const others = items.filter((item) => item !== moved);
      shown = [...others.slice(0, drag.index), moved, ...others.slice(drag.index)];
    }
  }
  return { shown, draggingId: drag?.id ?? null, start, consumeClick };
}
