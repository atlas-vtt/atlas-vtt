/**
 * The widths statblocks are shown at outside a pane, in CSS pixels. The hover
 * preview's are mirrored by `$statblock-preview-*` in `styles/_tokens.scss`
 * (a unit test keeps them equal); the DM screen lays its feeds out with these.
 * A template reads as one column at all of them (`columns: 22em 2` needs about
 * 590 px for two).
 */

/** The hover preview is at most this wide, */
export const STATBLOCK_PREVIEW_MAX_WIDTH = 480;
/** and this wide in a window at least `STATBLOCK_PREVIEW_WIDE_FROM` wide. */
export const STATBLOCK_PREVIEW_WIDE_MAX_WIDTH = 540;
export const STATBLOCK_PREVIEW_WIDE_FROM = 1600;

/** A DM screen feed narrower than this makes a statblock hard to read. */
export const STATBLOCK_FEED_MIN_WIDTH = 340;
/** A feed wider than this only spreads its text out. */
export const STATBLOCK_FEED_MAX_WIDTH = 540;
