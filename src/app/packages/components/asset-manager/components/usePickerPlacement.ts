import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { POPOVER_VIEW_MARGIN } from '../../primitives/popoverFit';

/** Room between the trigger and the list, as every select's. */
const GAP = 4;

/**
 * Where a list portaled out of a clipping column hangs from its trigger: below it, starting at its left edge, at
 * least as wide as it and no wider than the room to the right of it in the list's own frame (its offset parent).
 * Custom properties for the list's class to read; none until both elements are there. Follows the window's size.
 */
export function usePickerPlacement(trigger: HTMLElement | null, list: HTMLElement | null): CSSProperties | undefined {
  const [placement, setPlacement] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!trigger || !list) {
      setPlacement(undefined);
      return undefined;
    }
    const place = (): void => {
      const frame = (list.offsetParent ?? list.ownerDocument.body).getBoundingClientRect();
      const at = trigger.getBoundingClientRect();
      setPlacement({
        '--atlas-picker-left': `${at.left - frame.left}px`,
        '--atlas-picker-top': `${at.bottom - frame.top + GAP}px`,
        '--atlas-picker-min-width': `${at.width}px`,
        '--atlas-picker-room': `${Math.max(at.width, frame.right - at.left - POPOVER_VIEW_MARGIN)}px`,
      } as CSSProperties);
    };
    place();
    const view = list.ownerDocument.defaultView;
    view?.addEventListener('resize', place);
    return () => view?.removeEventListener('resize', place);
  }, [trigger, list]);

  return placement;
}
