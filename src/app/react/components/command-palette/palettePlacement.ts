/** Offsets in the overlay's own coordinate frame, not the viewport's. */
export interface PalettePosition {
  width: number;
  left: number;
  /** From the view's lower edge to the palette's: it stands above the toolbar. */
  bottom: number;
  /** Set where the palette hangs from the view's top instead (`placePaletteAtTop`). */
  top?: number;
  /** What the palette's height leaves free of the view's: the room under it, or its top and what a keyboard covers. */
  reserved: number;
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
 * the view allows and otherwise keeps PALETTE_VIEW_MARGIN from its sides. A toolbar hidden away
 * (Show toolbar on hover) leaves its place free: the palette then stands PALETTE_VIEW_MARGIN above
 * the view's lower edge.
 */
export function placePalette(toolbar: Box, frame: Box, toolbarHidden = false): PalettePosition {
  const room = Math.max(0, frame.width - 2 * PALETTE_VIEW_MARGIN);
  const width = Math.min(room, Math.min(Math.max(toolbar.width, PALETTE_MIN_WIDTH), PALETTE_MAX_WIDTH));
  const centred = toolbar.left - frame.left + (toolbar.width - width) / 2;
  const left = Math.min(Math.max(centred, PALETTE_VIEW_MARGIN), frame.width - PALETTE_VIEW_MARGIN - width);
  const bottom = toolbarHidden ? PALETTE_VIEW_MARGIN : frame.bottom - toolbar.top + PALETTE_TOOLBAR_GAP;
  return { width, left, bottom, reserved: bottom };
}

/**
 * Where a finger opens the palette: at the top of the view, since the keyboard rises from the
 * bottom. Sideways it stands where `position` put it. Its height ends above what the keyboard
 * covers of the view: `seenBottom` is the lower edge of what the window shows, in the frame's
 * coordinates.
 */
export function placePaletteAtTop(position: PalettePosition, frame: Pick<Box, 'top' | 'bottom'>, seenBottom: number): PalettePosition {
  const covered = Math.max(0, frame.bottom - Math.max(frame.top, seenBottom));
  return { ...position, top: PALETTE_VIEW_MARGIN, reserved: PALETTE_VIEW_MARGIN + covered };
}
