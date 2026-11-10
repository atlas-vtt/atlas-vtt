import { useLayoutEffect, useRef, type RefObject } from 'react';
import { MOTION_EASE_OUT, MOTION_NORMAL_MS } from '../../utils/motion';

/** How far the view comes from: a thread from the right, the whole log back from the left. */
const SWAP_SHIFT_PX = 12;

/**
 * Moves the list in when the panel changes between the whole log and a thread: a thread lies one
 * level deeper, so it slides in from the right and the log comes back from the left, fading in.
 * With reduced motion it only fades.
 */
export function useViewSwap(view: RefObject<HTMLElement | null>, thread: string | null): void {
  const shown = useRef(thread);
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = thread;
    const element = view.current;
    if (before === thread || element === null || typeof element.animate !== 'function') return undefined;
    const calm = element.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
    const from = calm ? 0 : (thread === null ? -1 : 1) * SWAP_SHIFT_PX;
    const swap = element.animate([{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }], { duration: MOTION_NORMAL_MS, easing: MOTION_EASE_OUT });
    return () => swap.cancel();
  }, [view, thread]);
}
