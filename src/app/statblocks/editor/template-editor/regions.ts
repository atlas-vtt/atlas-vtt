/**
 * Tab between the template editor's regions (§7.7): the canvas is one stop,
 * however many blocks it holds, and Tab always leaves it, forward to whatever
 * follows it in the document and back to whatever precedes the card. Nothing
 * holds Tab: where no stop follows, the browser takes the key as it would.
 */

const TABBABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]', '[contenteditable="true"]',
].join(', ');

/** Whether Tab can stop on the element: focusable, shown, not inert. */
function isTabStop(element: HTMLElement): boolean {
  return element.tabIndex >= 0
    && element.getClientRects().length > 0
    && element.closest('[inert], [hidden]') === null;
}

function tabStops(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(TABBABLE)].filter(isTabStop);
}

/**
 * The first tab stop after `region` and outside it (step 1), or the last one
 * before `from` and outside it (step -1); null when there is none.
 */
export function tabStopBeside(region: HTMLElement, from: HTMLElement, step: 1 | -1): HTMLElement | null {
  const stops = tabStops(region.doc);
  if (step === 1) {
    return stops.find((stop) => !region.contains(stop) && (region.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) ?? null;
  }
  return stops.filter((stop) => !from.contains(stop) && (from.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_PRECEDING) !== 0).at(-1) ?? null;
}

/** Whether keys typed now go into text: an input, a text area or editable content. */
export function typesText(element: Element | null): boolean {
  if (!element) return false;
  if (element.instanceOf(HTMLTextAreaElement)) return true;
  if (element.instanceOf(HTMLInputElement)) {
    return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes(element.type);
  }
  return element.instanceOf(HTMLElement) && element.isContentEditable;
}
