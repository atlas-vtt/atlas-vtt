/**
 * The mouse cursor shown over the PIXI canvas.
 *
 * PIXI's EventSystem writes the cursor as an inline style on the canvas, which
 * a CSS class cannot outrank, so cursor changes have to be written inline too.
 */

const setByTools = new WeakMap<HTMLCanvasElement, string>();

/**
 * Sets the cursor a tool or panel shows over the canvas: the laser's hidden arrow, the grid
 * alignment's crosshair. The map shows a cursor of its own above it (`showMapCursor`) and gives
 * this one back after.
 */
export function setCanvasCursor(canvas: HTMLCanvasElement, cursor: string): void {
  setByTools.set(canvas, cursor);
  canvas.style.cursor = cursor;
}

/** Shows a cursor of the map's own over the canvas (a pin's, a token's, a handle's), above the one a tool or panel set. */
export function showMapCursor(canvas: HTMLCanvasElement, cursor: string): void {
  canvas.style.cursor = cursor;
}

/** The cursor a tool or panel last set on the canvas; null where none has. */
export function toolCursorOf(canvas: HTMLCanvasElement): string | null {
  return setByTools.get(canvas) ?? null;
}
