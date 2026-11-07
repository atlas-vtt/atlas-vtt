import { useEffect, useState, type RefObject } from 'react';

/** Under this it is the rounding of a zoomed window, not more to come. */
const SLACK_PX = 1;

/** How many of a row's items lie out of view, or partly, on each side. */
export interface MoreToScroll {
  before: number;
  after: number;
}

const NONE: MoreToScroll = { before: 0, after: 0 };

function countOut(row: HTMLElement): MoreToScroll {
  const box = row.getBoundingClientRect();
  let before = 0;
  let after = 0;
  for (const item of row.children) {
    const rect = item.getBoundingClientRect();
    if (rect.left < box.left - SLACK_PX) before++;
    else if (rect.right > box.right + SLACK_PX) after++;
  }
  return before === 0 && after === 0 ? NONE : { before, after };
}

/**
 * Says on a row that scrolls sideways which way more of it lies (`data-more-start`, `data-more-end`) and how high its
 * scrollbar is where it takes room (`--atlas-strips-bar`), for the stylesheet; and answers how many items lie out of
 * view on each side, for the buttons that lead to them. Scrolling renders only when those counts change.
 */
export function useMoreToScroll(row: RefObject<HTMLElement | null>): MoreToScroll {
  const [more, setMore] = useState<MoreToScroll>(NONE);
  useEffect(() => {
    const element = row.current;
    if (!element) return undefined;
    // ponytail: left and right as written; a right-to-left row would fade the wrong side, add `direction` if Atlas gets such a language.
    const update = (): void => {
      element.toggleAttribute('data-more-start', element.scrollLeft > SLACK_PX);
      element.toggleAttribute('data-more-end', element.scrollWidth - element.clientWidth - element.scrollLeft > SLACK_PX);
      element.style.setProperty('--atlas-strips-bar', `${element.offsetHeight - element.clientHeight}px`);
      const next = countOut(element);
      setMore((shown) => (shown.before === next.before && shown.after === next.after ? shown : next));
    };
    element.addEventListener('scroll', update, { passive: true });
    // Measured when the observer answers, after layout: a row observed anew answers once, so a strip that comes or
    // goes is counted then, not in the middle of the render that added it (which laid the desk out twice a press).
    const resized = new ResizeObserver(update);
    resized.observe(element);
    const held = new MutationObserver(() => {
      resized.unobserve(element);
      resized.observe(element);
    });
    held.observe(element, { childList: true });
    return (): void => {
      element.removeEventListener('scroll', update);
      resized.disconnect();
      held.disconnect();
    };
  }, [row]);
  return more;
}
