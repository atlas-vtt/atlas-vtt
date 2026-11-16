const TABBABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
].join(', ');

/** Layers that take Tab for themselves while focus is in them. */
const OWN_LAYERS = '[role="dialog"], [role="menu"], [role="listbox"], .modal-container';

/** The elements Tab may stop at inside `container`, in order: not inert, hidden or taken out of the tab order. */
export function tabbableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter((element) =>
    element.tabIndex >= 0 && !element.closest('[inert], [hidden], [aria-hidden="true"]'));
}

/**
 * The stops Tab (forward) or Shift+Tab (back) tries from `current`, nearest first, wrapping at
 * either end; from outside the stops, the first (or, going back, the last) leads.
 */
export function tabStopsFrom(stops: readonly HTMLElement[], current: Element | null, back: boolean): HTMLElement[] {
  const index = current ? stops.indexOf(current as HTMLElement) : -1;
  const ordered = back ? [...stops].reverse() : [...stops];
  if (index === -1) return ordered;
  const at = back ? stops.length - 1 - index : index;
  return [...ordered.slice(at + 1), ...ordered.slice(0, at)];
}

/**
 * Handles a Tab or Shift+Tab press for a dialog that keeps focus inside `container` (WAI-ARIA dialog
 * pattern): from its last stop to its first and back, from outside it (focus on the body) to its
 * first. Returns false, leaving the event alone, for any other key, for Tab with a modifier and while
 * focus is in a dialog or menu opened over this one (portaled out of it), which keeps its own Tab.
 */
export function keepTabWithin(container: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return false;
  const doc = container.ownerDocument;
  const focused = doc.activeElement;
  if (focused && focused !== doc.body && !container.contains(focused) && focused.closest(OWN_LAYERS)) return false;
  event.preventDefault();
  event.stopPropagation();
  // A stop that is not shown (display: none) takes no focus: the one after it is tried.
  const candidates = tabStopsFrom(tabbableIn(container), container.contains(focused) ? focused : null, event.shiftKey);
  if (!candidates.some((candidate) => { candidate.focus(); return doc.activeElement === candidate; })) container.focus();
  return true;
}
