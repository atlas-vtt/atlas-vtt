/**
 * Where a tile's Options stand: beside the card, in the note's column, at
 * the height of the tile they belong to, where a card of any length leaves
 * them their whole height. They keep clear of the dock where the column has
 * the room and stand over it where it has not; only where the column is too
 * narrow for them at all (the card above the note) do they go below the tile
 * and its toolbar, or above them (`placeClearOf`, which places a new tile's
 * Name the same way). They slide up rather than leave the view, and scroll
 * only where they are taller than the view itself. Their width never changes.
 * Pure, all in one coordinate system.
 */

import type { Box } from '../gapGeometry';

export interface OptionsRoom {
  /** The tile the Options belong to. */
  tile: Box;
  /** Its toolbar, while it shows. */
  toolbar: Box | null;
  /** The panel the card stands in: the Options go left of it. */
  card: Box;
  /** The dock, while it shows. */
  dock: Box | null;
  /** What the Options must stay inside: the editor. */
  view: Box;
}

export interface OptionsPlacement {
  left: number;
  top: number;
  /** Set where the Options are taller than their room: they scroll inside this height. */
  maxHeight: number | null;
  /** `beside`: in the note's column; `below` and `above`: over the card. */
  side: 'beside' | 'below' | 'above';
}

/** Room between the Options and what they stand next to. */
export const OPTIONS_GAP = 8;
/** Room they keep to the view's edges. */
export const OPTIONS_MARGIN = 8;

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high));

/** The Options' place for their natural size (`height`: their whole content, also while they scroll). */
export function placeOptions(room: OptionsRoom, size: { width: number; height: number }): OptionsPlacement {
  const { tile, toolbar, card, dock, view } = room;
  const top = view.top + OPTIONS_MARGIN;
  const bottom = view.bottom - OPTIONS_MARGIN;
  const leftmost = view.left + OPTIONS_MARGIN;
  const whole = Math.max(0, bottom - top);

  // Beside the card: clear of the dock first, else over it.
  const edges = [...(dock ? [dock.left] : []), card.left].map((edge) => edge - OPTIONS_GAP - size.width);
  const beside = edges.find((left) => left >= leftmost);
  if (beside !== undefined) {
    const height = Math.min(size.height, whole);
    return { left: beside, top: clamp(tile.top, top, bottom - height), maxHeight: size.height > whole ? whole : null, side: 'beside' };
  }

  // Over the card, clear of the tile and its toolbar, on the tile's left edge.
  const clear = toolbar ? { ...tile, top: Math.min(tile.top, toolbar.top), bottom: Math.max(tile.bottom, toolbar.bottom) } : tile;
  return placeClearOf(clear, view, size);
}

/**
 * A popover's place over the card, `gap` clear of `clear` (a tile, with its
 * toolbar where that shows): below it where it fits or has more room, else
 * above, never over it; its left edge on the box's, inside the view. Where
 * neither side holds it whole it scrolls within the larger.
 */
export function placeClearOf(clear: Box, view: Box, size: { width: number; height: number }, gap = OPTIONS_GAP): OptionsPlacement & { side: 'below' | 'above' } {
  const top = view.top + OPTIONS_MARGIN;
  const bottom = view.bottom - OPTIONS_MARGIN;
  const clearTop = clear.top - gap;
  const clearBottom = clear.bottom + gap;
  const below = Math.max(0, bottom - clearBottom);
  const above = Math.max(0, clearTop - top);
  const left = clamp(clear.left, view.left + OPTIONS_MARGIN, view.right - OPTIONS_MARGIN - size.width);
  if (size.height <= below || below >= above) {
    return { left, top: clearBottom, maxHeight: size.height > below ? below : null, side: 'below' };
  }
  const height = Math.min(size.height, above);
  return { left, top: clearTop - height, maxHeight: size.height > above ? above : null, side: 'above' };
}
