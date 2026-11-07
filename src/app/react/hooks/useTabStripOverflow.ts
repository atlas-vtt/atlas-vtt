import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../utils/motion';

/** Pixels per line for wheels that report their delta in lines. */
export const WHEEL_LINE_PX = 16;

export interface TabStripOverflow {
  /** The tabs are wider than the strip, so it scrolls. */
  overflows: boolean;
  /** Tabs are cut off at the start of the strip. */
  hiddenBefore: boolean;
  /** Tabs are cut off at the end of the strip. */
  hiddenAfter: boolean;
}

/**
 * Makes a horizontal tab strip scrollable with any pointing device and reports
 * where tabs are cut off. Trackpads scroll it natively; a vertical mouse wheel
 * scrolls it sideways, as in browsers and code editors. The tab marked
 * `aria-selected` scrolls into view whenever `activeTabId` changes, at once
 * when the strip first appears and smoothly afterwards.
 */
export function useTabStripOverflow(strip: HTMLElement | null, activeTabId: string | null): TabStripOverflow {
  const [overflows, setOverflows] = useState(false);
  const [hiddenBefore, setHiddenBefore] = useState(false);
  const [hiddenAfter, setHiddenAfter] = useState(false);
  const revealedIn = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!strip) return undefined;
    // A tab moved by a drag (useTabReorderDrag) widens the scroll width without being any wider,
    // so while tabs are reordered the strip keeps the extent it had before.
    let restingMaxScroll = 0;
    const measure = (): void => {
      if (strip.dataset.reordering === undefined) {
        restingMaxScroll = strip.scrollWidth - strip.clientWidth;
        setOverflows(restingMaxScroll > 1);
      }
      setHiddenBefore(strip.scrollLeft > 1);
      setHiddenAfter(strip.scrollLeft < restingMaxScroll - 1);
    };
    const scrollWithWheel = (event: WheelEvent): void => {
      const isVertical = Math.abs(event.deltaY) > Math.abs(event.deltaX);
      if (!isVertical || restingMaxScroll <= 1) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaMode === event.DOM_DELTA_LINE ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
    };

    // Tabs change width when they are added, removed or renamed, without resizing the strip.
    const resizes = new ResizeObserver(measure);
    const observeTabs = (): void => {
      resizes.disconnect();
      resizes.observe(strip);
      for (const tab of Array.from(strip.children)) resizes.observe(tab);
    };
    const tabChanges = new MutationObserver(() => {
      observeTabs();
      measure();
    });
    observeTabs();
    // `data-reordering` going away puts every tab back in its place: the strip is measured again then.
    tabChanges.observe(strip, { childList: true, attributes: true, attributeFilter: ['data-reordering'] });
    measure();
    strip.addEventListener('scroll', measure, { passive: true });
    strip.addEventListener('wheel', scrollWithWheel, { passive: false });
    return (): void => {
      resizes.disconnect();
      tabChanges.disconnect();
      strip.removeEventListener('scroll', measure);
      strip.removeEventListener('wheel', scrollWithWheel);
    };
  }, [strip]);

  useLayoutEffect(() => {
    const activeTab = strip?.querySelector('[aria-selected="true"]');
    if (!strip || !activeTab) return;
    const isFirstReveal = revealedIn.current !== strip;
    revealedIn.current = strip;
    activeTab.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: isFirstReveal || prefersReducedMotion(activeTab) ? 'auto' : 'smooth',
    });
  }, [strip, activeTabId]);

  return { overflows, hiddenBefore, hiddenAfter };
}
