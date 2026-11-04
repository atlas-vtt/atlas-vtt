import { CHROME_ATTRIBUTE, OWNER_ATTRIBUTE } from '../interaction/chrome';

/** Where focus may go without leaving an edit: a menu (any Atlas menu, a submenu of one) or the surface's chrome. */
const STAYS = `[role="menu"], [${OWNER_ATTRIBUTE}], [${CHROME_ATTRIBUTE}]`;

/**
 * Whether focus moving to `target` stays inside `container`, in a menu one of
 * its controls opened (a portal elsewhere in the document), or on the
 * surface's chrome (a handle, which never takes focus, spec §3.4). Read
 * without `instanceof`: a node of a popout window is none of this window's classes.
 */
export function focusStaysIn(container: Element | null, target: EventTarget | null): boolean {
  const node = target as Partial<Element> | null;
  if (!container || typeof node?.closest !== 'function') return false;
  return container.contains(node as Element) || node.closest(STAYS) !== null;
}
