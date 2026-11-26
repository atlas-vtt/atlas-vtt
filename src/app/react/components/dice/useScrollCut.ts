import type React from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';

/** Which ends of a sideways scrolling element's content lie out of view. */
export interface ScrollCut {
  start: boolean;
  end: boolean;
}

const NONE: ScrollCut = { start: false, end: false };

function cutOf(element: HTMLElement): ScrollCut {
  const rest = element.scrollWidth - element.clientWidth;
  return { start: element.scrollLeft > 0.5, end: element.scrollLeft < rest - 0.5 };
}

/** Measures `element` again, keeping the state object while its ends stay as they were. */
function remeasure(element: HTMLElement, setCut: React.Dispatch<React.SetStateAction<ScrollCut>>): void {
  const next = cutOf(element);
  setCut((before) => (before.start === next.start && before.end === next.end ? before : next));
}

/**
 * Follows which ends of `ref`'s content are scrolled out of view: after every render, on scroll and when the
 * element changes size. A scroll-state container query did not reach the pseudo-elements here (the overlay
 * scrollbars give a scroller a shadow root), so the ends are measured.
 */
export function useScrollCut(ref: React.RefObject<HTMLElement | null>): ScrollCut {
  const [cut, setCut] = useState<ScrollCut>(NONE);

  useLayoutEffect(() => {
    if (ref.current) remeasure(ref.current, setCut);
  });

  useEffect(() => {
    const element = ref.current;
    const Observer = element?.ownerDocument.defaultView?.ResizeObserver;
    if (!element) return undefined;
    const measure = (): void => remeasure(element, setCut);
    element.addEventListener('scroll', measure, { passive: true });
    const observer = Observer ? new Observer(measure) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [ref]);

  return cut;
}
