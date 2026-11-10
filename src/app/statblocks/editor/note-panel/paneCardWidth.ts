/**
 * How wide the statblock card is in a panel of a given width, as the stylesheets lay it out: the
 * panel's border at its start (`panel-frame.scss`), the scroller's stable gutter (`atlas-scrollbar`
 * asks for a thin scrollbar, which Chromium draws 11 px wide whatever `::-webkit-scrollbar` says),
 * the pane's padding on either side and the one-column feed width (`statblock-pane.scss`,
 * `$statblock-feed-max-width`). Pure, so whoever draws the card elsewhere can lay it out at the
 * width the GM sees it at.
 */

const PANEL_BORDER = 1;
const SCROLL_GUTTER = 11;
const PANE_PADDING = 16;
/** The widest a one-column card stands in its pane: the DM screen's feed. */
export const ONE_COLUMN_CARD_MAX = 540;
/**
 * What a statblock panel stands in when its width is not known: wide enough that a one-column card
 * takes its full feed width, as it does in most note views.
 */
export const FALLBACK_PANEL_WIDTH = 600;

/** The card's width in CSS pixels in a panel `panelWidth` wide, for a template of `maxColumns` columns. */
export function paneCardWidth(panelWidth: number, maxColumns: number): number {
  const inner = Math.max(0, panelWidth - PANEL_BORDER - SCROLL_GUTTER - 2 * PANE_PADDING);
  return Math.round(maxColumns <= 1 ? Math.min(inner, ONE_COLUMN_CARD_MAX) : inner);
}
