type Edges = Record<'top' | 'bottom' | 'left' | 'right', number>;
type EdgesOf = (element: Element) => Edges;

const screenEdges: EdgesOf = (element) => element.getBoundingClientRect();

/**
 * Where an element lies in the page's layout, before any transform: a list turned to face players at
 * another edge scrolls along its own axes, which the screen's no longer are.
 */
export function layoutEdges(element: Element): Edges {
  const own = element as HTMLElement;
  let left = own.offsetLeft;
  let top = own.offsetTop;
  for (let parent = own.offsetParent as HTMLElement | null; parent; parent = parent.offsetParent as HTMLElement | null) {
    left += parent.offsetLeft + parent.clientLeft;
    top += parent.offsetTop + parent.clientTop;
  }
  for (let parent = own.parentElement; parent; parent = parent.parentElement) {
    left -= parent.scrollLeft;
    top -= parent.scrollTop;
  }
  return { left, top, right: left + own.offsetWidth, bottom: top + own.offsetHeight };
}

/**
 * Scrolls `container`, and nothing else, until `element` shows: with its top at the container's
 * (`start`), or no farther than it takes (`nearest`). `scrollIntoView` scrolls every ancestor
 * that can scroll, the map view around a panel included. Include up to `followingSiblings`
 * after the element where they fit, without scrolling the element itself out of view. A list that
 * runs as a row scrolls along `x` (its left edge for the top). The element's `scroll-margin` stays in view before it.
 */
export function scrollWithin(container: HTMLElement, element: Element, block: 'start' | 'nearest', followingSiblings = 0, axis: 'x' | 'y' = 'y', edgesOf: EdgesOf = screenEdges): void {
  const box = edgesOf(container);
  const rect = edgesOf(element);
  let last = element;
  for (let index = 0; index < followingSiblings && last.nextElementSibling; index++) {
    last = last.nextElementSibling;
  }
  const [start, end] = axis === 'y' ? (['top', 'bottom'] as const) : (['left', 'right'] as const);
  const scroll = axis === 'y' ? 'scrollTop' : 'scrollLeft';
  // The room the element keeps before it (CSS `scroll-margin`, as `scrollIntoView` keeps it): badges standing over a card's top
  const style = element.ownerDocument?.defaultView?.getComputedStyle(element);
  const margin = Number.parseFloat((axis === 'y' ? style?.scrollMarginTop : style?.scrollMarginLeft) ?? '') || 0;
  const fromStart = rect[start] - margin - box[start];
  const pastEnd = edgesOf(last)[end] - box[end];
  if (block === 'start' || fromStart < 0) container[scroll] += fromStart;
  // Keep the active element visible even when the following siblings do not all fit.
  else if (pastEnd > 0) container[scroll] += Math.min(pastEnd, fromStart);
}
