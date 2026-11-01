import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Mood } from '../../../../sound/soundTypes';

/** A press becomes a drag after this many pixels; before that it is a press of the mood. */
const DRAG_THRESHOLD = 4;

function indexAt(grid: HTMLElement, x: number, y: number): number | null {
  const cards = [...grid.querySelectorAll<HTMLElement>('.atlas-sound-mood')];
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

export interface MoodDrag {
  /** The moods as the drag would leave them. */
  shown: readonly Mood[];
  draggingId: string | null;
  start: (mood: Mood, event: ReactPointerEvent<HTMLElement>) => void;
  /** Whether the click that ends a press belongs to a drag, and presses nothing. */
  consumeClick: () => boolean;
}

/** Moves a mood among the others under the pointer; Escape, a lost pointer or a blur put it back. */
export function useMoodDrag(gridRef: RefObject<HTMLElement | null>, moods: readonly Mood[], canMove: (mood: Mood) => boolean, onDrop: (mood: Mood, index: number) => void): MoodDrag {
  const [drag, setDrag] = useState<{ id: string; index: number } | null>(null);
  const draggedRef = useRef(false);

  const start = useCallback((mood: Mood, event: ReactPointerEvent<HTMLElement>): void => {
    const grid = gridRef.current;
    if (event.button !== 0 || !grid || !canMove(mood)) return;
    const doc = grid.ownerDocument;
    const win = doc.defaultView ?? window;
    const from = { x: event.clientX, y: event.clientY };
    const { pointerId } = event;
    let index: number | null = null;
    draggedRef.current = false;

    const end = (): void => {
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', cancel, true);
      doc.removeEventListener('keydown', key, true);
      win.removeEventListener('blur', cancel);
      setDrag(null);
    };
    const cancel = (): void => end();
    const move = (moved: PointerEvent): void => {
      if (moved.pointerId !== pointerId) return;
      if (index === null && Math.hypot(moved.clientX - from.x, moved.clientY - from.y) < DRAG_THRESHOLD) return;
      draggedRef.current = true;
      const over = indexAt(grid, moved.clientX, moved.clientY);
      if (over !== null && over !== index) {
        index = over;
        setDrag({ id: mood.id, index: over });
      }
    };
    const up = (released: PointerEvent): void => {
      if (released.pointerId !== pointerId) return;
      end();
      if (index !== null) onDrop(mood, index);
    };
    const key = (pressed: KeyboardEvent): void => {
      if (pressed.key !== 'Escape' || index === null) return;
      pressed.preventDefault();
      pressed.stopPropagation();
      end();
    };
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', cancel, true);
    doc.addEventListener('keydown', key, true);
    win.addEventListener('blur', cancel);
  }, [gridRef, canMove, onDrop]);

  const consumeClick = useCallback((): boolean => {
    const dragged = draggedRef.current;
    draggedRef.current = false;
    return dragged;
  }, []);

  let shown = moods;
  if (drag) {
    const moved = moods.find((mood) => mood.id === drag.id);
    if (moved) {
      const others = moods.filter((mood) => mood !== moved);
      shown = [...others.slice(0, drag.index), moved, ...others.slice(drag.index)];
    }
  }
  return { shown, draggingId: drag?.id ?? null, start, consumeClick };
}
