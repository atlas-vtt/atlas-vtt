import { useEffect, type RefObject } from 'react';

/** Under this it is the rounding of a zoomed window, not more to come. */
const SLACK_PX = 1;

/**
 * Says on a row that scrolls sideways which way more of it lies (`data-more-start`, `data-more-end`) and how high its
 * scrollbar is where it takes room (`--atlas-strips-bar`), for the stylesheet alone, so scrolling renders nothing.
 */
export function useMoreToScroll(row: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = row.current;
    if (!element) return undefined;
    // ponytail: left and right as written; a right-to-left row would fade the wrong side, add `direction` if Atlas gets such a language.
    const update = (): void => {
      element.toggleAttribute('data-more-start', element.scrollLeft > SLACK_PX);
      element.toggleAttribute('data-more-end', element.scrollWidth - element.clientWidth - element.scrollLeft > SLACK_PX);
      element.style.setProperty('--atlas-strips-bar', `${element.offsetHeight - element.clientHeight}px`);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const resized = new ResizeObserver(update);
    resized.observe(element);
    const held = new MutationObserver(update);
    held.observe(element, { childList: true });
    return (): void => {
      element.removeEventListener('scroll', update);
      resized.disconnect();
      held.disconnect();
    };
  }, [row]);
}
