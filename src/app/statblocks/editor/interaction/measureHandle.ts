/** Reads from the drawn card what `placeHandle` needs (spec §3.3): the columns, the target's box and its first line. */

import { columnsOf, placeHandle, type Box, type HandlePlacement } from './handleGeometry';

const SHEET = '.atlas-statblock';
const COLUMNS = '.atlas-sb-columns';
const HEADING = '.atlas-sb-heading, .atlas-sb-section-heading';

function boxOf(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** The line height an element's text is set in, in pixels. */
function lineHeightOf(element: HTMLElement): number {
  const style = element.win.getComputedStyle(element);
  const line = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(line)) return line;
  const font = Number.parseFloat(style.fontSize);
  return Number.isFinite(font) ? font * 1.2 : 20;
}

/** The target's first line: a heading that leads it, else one line of its own text from its top. */
function firstLineOf(element: HTMLElement, box: Box): { top: number; bottom: number } {
  const heading = element.querySelector<HTMLElement>(HEADING);
  const headingBox = heading?.getBoundingClientRect();
  if (headingBox && headingBox.height > 0 && headingBox.top - box.top < 2) return { top: headingBox.top, bottom: headingBox.bottom };
  return { top: box.top, bottom: box.top + Math.min(lineHeightOf(element), box.bottom - box.top) };
}

/** Where the handle of `element` stands on its card, in client coordinates; null for an element that is not drawn. */
export function measureHandle(element: HTMLElement): HandlePlacement | null {
  const rects = element.getClientRects();
  const first = rects[0];
  if (!first || !element.isConnected) return null;
  const sheet = element.closest(SHEET);
  const flow = sheet?.querySelector(COLUMNS);
  const tops = flow ? [...flow.children].filter((child) => child.hasAttribute('data-block-id')) : [];
  const columns = columnsOf(tops.flatMap((frame) => [...frame.getClientRects()].map(boxOf)));
  const box = boxOf(first);
  const card = sheet?.getBoundingClientRect();
  return placeHandle(box, firstLineOf(element, box), columns, card?.left ?? box.left, card?.top);
}
