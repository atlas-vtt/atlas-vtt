/** Offsets in the overlay's own coordinate frame, not the viewport's. */
export interface PalettePosition {
  width: number;
  left: number;
  bottom: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  bottom: number;
}

/** The palette is never narrower than this while the view has room for it. */
export const PALETTE_MIN_WIDTH = 560;
/** The palette is never wider than this, however long the toolbar. */
export const PALETTE_MAX_WIDTH = 720;
/** Distance the palette keeps from the view's sides. */
export const PALETTE_VIEW_MARGIN = 16;
/** Gap between the palette and the toolbar it rises out of. */
export const PALETTE_TOOLBAR_GAP = 8;

/**
 * Places the palette above the toolbar: as wide as the toolbar, but within
 * PALETTE_MIN_WIDTH and PALETTE_MAX_WIDTH, so a toolbar with few or many
 * tools neither squeezes nor stretches it, and never wider than the view. It stays centred on the toolbar where
 * the view allows and otherwise keeps PALETTE_VIEW_MARGIN from its sides.
 */
export function placePalette(toolbar: Box, frame: Box): PalettePosition {
  const room = Math.max(0, frame.width - 2 * PALETTE_VIEW_MARGIN);
  const width = Math.min(room, Math.min(Math.max(toolbar.width, PALETTE_MIN_WIDTH), PALETTE_MAX_WIDTH));
  const centred = toolbar.left - frame.left + (toolbar.width - width) / 2;
  const left = Math.min(Math.max(centred, PALETTE_VIEW_MARGIN), frame.width - PALETTE_VIEW_MARGIN - width);
  return { width, left, bottom: frame.bottom - toolbar.top + PALETTE_TOOLBAR_GAP };
}
