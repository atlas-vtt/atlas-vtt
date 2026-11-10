/**
 * The ink Atlas draws its own marks on the map with (the selection highlight, measurements), in
 * screen pixels: an accent line held by a thin dark line on either side, and a soft shade beyond.
 */

/** Widths and opacity of the line itself. */
export const CANVAS_INK = {
  /** The accent line. */
  stroke: 2,
  /** The dark line on either side of the accent, which keeps it readable on a light map. */
  keyline: 1,
  /** The dark line's opacity: enough to hold the accent on parchment, nothing on a dark map. */
  keylineAlpha: 0.3,
} as const;

/** One band of the shade. */
export interface InkBand {
  readonly width: number;
  readonly alpha: number;
}

/**
 * A soft dark falloff beyond the dark line, as bands of `width` screen pixels. Bands of one pixel
 * fading evenly: wider steps showed as stripes along a straight edge and made a box's frame read
 * heavier than a token's ring.
 */
export const INK_SHADE: readonly InkBand[] = [
  { width: 1, alpha: 0.1 },
  { width: 1, alpha: 0.065 },
  { width: 1, alpha: 0.04 },
  { width: 1, alpha: 0.02 },
];

/** How far the shade reaches beyond the dark line, in screen pixels. */
export const INK_SHADE_REACH = INK_SHADE.reduce((sum, band) => sum + band.width, 0);
