/**
 * Scrolling while a drag rests near a scroller's top or bottom edge (spec
 * §7.3): within `SCROLL_EDGE` px, faster the closer to the edge. Shared by
 * the template editor's block drag and the panel's ability drag.
 */

import type { Point } from './dropGeometry';

/** How close to the scroller's top or bottom edge the pointer scrolls it, and how fast at most per frame. */
export const SCROLL_EDGE = 48;
const SCROLL_SPEED = 18;

/** Scrolls one frame's step for a pointer at `client`; true when the scroller moved. */
export function scrollNearEdge(scroller: HTMLElement, client: Point): boolean {
  const view = scroller.getBoundingClientRect();
  if (client.x < view.left || client.x > view.right) return false;
  const near = client.y < view.top + SCROLL_EDGE
    ? -(view.top + SCROLL_EDGE - client.y)
    : client.y > view.bottom - SCROLL_EDGE ? client.y - view.bottom + SCROLL_EDGE : 0;
  if (near === 0) return false;
  const before = scroller.scrollTop;
  scroller.scrollTop += Math.max(-SCROLL_SPEED, Math.min(SCROLL_SPEED, near / 2));
  return scroller.scrollTop !== before;
}

/** Scrolls so a box shows, with some room around it (a keyboard drag's next place). */
export function revealInScroller(scroller: HTMLElement, box: { top: number; bottom: number }): void {
  const view = scroller.getBoundingClientRect();
  if (box.top < view.top + SCROLL_EDGE) scroller.scrollTop -= view.top + SCROLL_EDGE - box.top;
  else if (box.bottom > view.bottom - SCROLL_EDGE) scroller.scrollTop += box.bottom - view.bottom + SCROLL_EDGE;
}

/** The nearest ancestor of an element that scrolls vertically; null where none does. */
export function scrollerOf(element: Element): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = node.win.getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}
