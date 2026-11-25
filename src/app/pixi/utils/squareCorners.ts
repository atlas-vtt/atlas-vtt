import { getDomHost } from '../../host/dom';

/** On `body` while the GM wants no rounded corners in Atlas (Appearance settings), under any look. */
export const SQUARE_CORNERS_CLASS = 'atlas-square-corners';

/** Whether Atlas draws every corner square: its stylesheet does in the DOM, the canvas asks here. */
export function squareCorners(): boolean {
  return typeof document !== 'undefined' && getDomHost().activeDocument().body.classList.contains(SQUARE_CORNERS_CLASS);
}

/** The corner radius for the map's own UI (token bars, badges, chips, labels): `radius`, or 0 while corners are square. */
export function uiCorner(radius: number): number {
  return squareCorners() ? 0 : radius;
}

/** Calls `changed` whenever corners turn square or round in `body`'s window; returns what stops it. */
export function watchSquareCorners(body: HTMLElement, changed: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let square = squareCorners();
  const observer = new MutationObserver(() => {
    if (squareCorners() === square) return;
    square = squareCorners();
    changed();
  });
  observer.observe(body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
