/** Room a popover keeps from its tile and from the window's edges, in px. */
export const POPOVER_GAP = 10;
export const POPOVER_MARGIN = 8;
/** How far from the popover's corners its caret may sit, so it never meets their curve. */
const CARET_INSET = 28;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PopoverPlace {
  left: number;
  top: number;
  /** Below the tile, or above it where the room below runs out and above holds more. */
  side: 'below' | 'above';
  /** The caret's distance from the popover's left edge: under the tile's middle where it can be. */
  caret: number;
}

/**
 * Where a popover of `size` stands for the tile `anchor` in a window of `view`: under it, centred on
 * it, kept inside the window; above it only where it fits there and not below.
 */
export function placeUnderTile(anchor: Box, size: { width: number; height: number }, view: { width: number; height: number }): PopoverPlace {
  const below = anchor.top + anchor.height + POPOVER_GAP;
  const roomBelow = view.height - POPOVER_MARGIN - below;
  const roomAbove = anchor.top - POPOVER_GAP - POPOVER_MARGIN;
  const side = size.height > roomBelow && roomAbove > roomBelow ? 'above' : 'below';
  const rawTop = side === 'below' ? below : anchor.top - POPOVER_GAP - size.height;
  const top = Math.max(POPOVER_MARGIN, Math.min(rawTop, view.height - POPOVER_MARGIN - size.height));
  const centre = anchor.left + anchor.width / 2;
  const left = Math.max(POPOVER_MARGIN, Math.min(centre - size.width / 2, view.width - POPOVER_MARGIN - size.width));
  const caret = Math.max(CARET_INSET, Math.min(centre - left, size.width - CARET_INSET));
  return { left, top, side, caret };
}
