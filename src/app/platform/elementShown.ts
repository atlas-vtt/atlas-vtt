/**
 * Whether the element is on screen as far as layout goes: connected and inside nothing that is
 * `display: none` (a view in a tab behind another). `Element.checkVisibility` answers that where the
 * web view has it (iPadOS 17.4); older ones are asked for the element's boxes, of which a hidden one has none.
 */
export function isElementShown(element: Element | null | undefined): boolean {
  if (!element?.isConnected) return false;
  if (typeof element.checkVisibility === 'function') return element.checkVisibility();
  return element.getClientRects().length > 0;
}
