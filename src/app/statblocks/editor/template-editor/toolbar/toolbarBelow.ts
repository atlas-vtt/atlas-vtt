/**
 * Where the selected block's toolbar stands (spec §4.2): 8 px below the
 * block's selection outline, inside the panel's visible box; above the block
 * only where the room below runs out. Its right edge meets the block's: a
 * statblock's lines start at the left, so the toolbar covers the empty end of
 * the line below rather than its words, and never the handles in the gutter.
 * Pure, all in window coordinates.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ToolbarPlacement {
  /** In the coordinates of the layer the toolbar is drawn in. */
  left: number;
  top: number;
  /** Above the block, because the room below ran out. */
  above: boolean;
  /** The block is scrolled out of sight: no toolbar. */
  hidden: boolean;
}

/** How far the selection outline stands off the block. */
export const OUTLINE_OFFSET = 4;
/** Room between the outline and the toolbar. */
export const TOOLBAR_GAP = 8;

export const HIDDEN_TOOLBAR: ToolbarPlacement = { left: 0, top: 0, above: false, hidden: true };

/**
 * The toolbar's place for a block's box: `view` is the visible part of the
 * panel, `layer` the box of the layer it is drawn in. Below where it fits;
 * above where it does not and above does; else against the view's bottom
 * edge (a block taller than the view: the toolbar then stands over its lower,
 * unseen part).
 */
export function placeBelow(block: Box, view: Box, layer: Box, size: { width: number; height: number }): ToolbarPlacement {
  const hidden = block.bottom < view.top || block.top > view.bottom;
  const below = block.bottom + OUTLINE_OFFSET + TOOLBAR_GAP;
  const above = block.top - OUTLINE_OFFSET - TOOLBAR_GAP - size.height;
  const fitsBelow = below + size.height <= view.bottom;
  const fitsAbove = above >= view.top;
  const top = fitsBelow ? below : fitsAbove ? above : view.bottom - size.height - TOOLBAR_GAP;
  const maxLeft = Math.max(view.left, view.right - size.width);
  const left = Math.min(Math.max(block.right - size.width, block.left, view.left), maxLeft);
  return { left: left - layer.left, top: top - layer.top, above: !fitsBelow && fitsAbove, hidden };
}
