import { useCallback, useEffect, useRef } from 'react';
import { ListDrag, type ListDragHost } from './ListDrag';

export interface ListDragStarter {
  /** A press on an item's handle: it becomes a drag once the pointer moves (or a touch rests), else stays a click. */
  press: (host: ListDragHost, handle: HTMLElement, event: PointerEvent) => void;
  /** Whether a drag is under way. */
  dragging: () => boolean;
}

/**
 * Binds handle presses to `ListDrag` (spec §7.5): one drag at a time, and a
 * drag the surface's unmount cuts short is cancelled, writing nothing. It is
 * mounted at rest around the card, never inside an editor that a click
 * opens, so no blur can unmount it mid-press.
 */
export function useListDrag(): ListDragStarter {
  const current = useRef<ListDrag | null>(null);
  useEffect(() => () => current.current?.cancel(), []);

  const press = useCallback((host: ListDragHost, handle: HTMLElement, event: PointerEvent): void => {
    current.current?.cancel();
    const settle = (): void => {
      current.current = null;
    };
    current.current = new ListDrag({
      ...host,
      onDrop: (from, gap) => {
        settle();
        host.onDrop(from, gap);
      },
      onCancel: (started) => {
        settle();
        host.onCancel(started);
      },
    }, handle, event);
  }, []);

  const dragging = useCallback((): boolean => current.current?.started === true, []);
  return { press, dragging };
}
