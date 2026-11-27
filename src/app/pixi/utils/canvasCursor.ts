/**
 * The mouse cursor shown over the PIXI canvas.
 *
 * PIXI's EventSystem writes the cursor as an inline style on the canvas, which
 * a CSS class cannot outrank, so cursor changes have to be written inline too.
 */

/** What sets a cursor of its own over the whole canvas while it lasts. */
export type ToolCursorOwner = 'laser' | 'alignment' | 'placement';

/** Each canvas's live tool cursors by owner, oldest first: a Map keeps the order its entries were set in. */
const toolCursors = new WeakMap<HTMLCanvasElement, Map<ToolCursorOwner, string>>();

/**
 * Sets `owner`'s cursor over the canvas: the laser's hidden arrow, the grid alignment's crosshair, the
 * placement's grip. The owner set last is shown; the map shows a cursor of its own above it
 * (`showMapCursor`) and gives this one back after.
 */
export function setToolCursor(canvas: HTMLCanvasElement, owner: ToolCursorOwner, cursor: string): void {
  const entries = toolCursors.get(canvas) ?? new Map<ToolCursorOwner, string>();
  entries.delete(owner);
  entries.set(owner, cursor);
  toolCursors.set(canvas, entries);
  canvas.style.cursor = cursor;
}

/** Ends `owner`'s cursor over the canvas: the owner set before it shows again, or the system's arrow. */
export function clearToolCursor(canvas: HTMLCanvasElement, owner: ToolCursorOwner): void {
  if (!toolCursors.get(canvas)?.delete(owner)) return;
  canvas.style.cursor = toolCursorOf(canvas) ?? 'auto';
}

/** The tool cursor shown over the canvas: the one set last of those still live; null where none is. */
export function toolCursorOf(canvas: HTMLCanvasElement): string | null {
  let last: string | null = null;
  for (const cursor of toolCursors.get(canvas)?.values() ?? []) last = cursor;
  return last;
}

/** Shows a cursor of the map's own over the canvas (a pin's, a token's, a handle's), above the tool cursor. */
export function showMapCursor(canvas: HTMLCanvasElement, cursor: string): void {
  canvas.style.cursor = cursor;
}
