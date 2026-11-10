/**
 * Scrolls `container`, and nothing else, until `element` shows: with its top at the container's
 * (`start`), or no farther than it takes (`nearest`). `scrollIntoView` scrolls every ancestor
 * that can scroll, the map view around a panel included. Include up to `followingSiblings`
 * after the element where they fit, without scrolling the element itself out of view.
 */
export function scrollWithin(container: HTMLElement, element: Element, block: 'start' | 'nearest', followingSiblings = 0): void {
  const box = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  let last = element;
  for (let index = 0; index < followingSiblings && last.nextElementSibling; index++) {
    last = last.nextElementSibling;
  }
  const fromTop = rect.top - box.top;
  const pastBottom = last.getBoundingClientRect().bottom - box.bottom;
  if (block === 'start' || fromTop < 0) container.scrollTop += fromTop;
  // Keep the active element visible even when the following siblings do not all fit.
  else if (pastBottom > 0) container.scrollTop += Math.min(pastBottom, fromTop);
}
