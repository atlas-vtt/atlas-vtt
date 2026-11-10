/**
 * Geometry for showing the player view on a TV lying flat on the table: "one grid cell = N mm of
 * real glass". No DOM, so it is testable.
 */

export const MM_PER_INCH = 25.4;

/** Device pixels per millimetre of glass. Uses the diagonal, so any aspect ratio works. */
export function pxPerMM(resW: number, resH: number, diagIn: number): number {
  if (!(resW > 0) || !(resH > 0) || !(diagIn > 0)) throw new Error('resolution and TV diagonal must be > 0');
  return Math.hypot(resW, resH) / (diagIn * MM_PER_INCH);
}

/** Device pixels one grid cell must span so it measures `cellMm` on the glass. `trim` is a percentage. */
export function cellPx(resW: number, resH: number, diagIn: number, cellMm: number, trim = 100): number {
  return cellMm * pxPerMM(resW, resH, diagIn) * (trim / 100);
}

/** A bank card (ISO/IEC 7810 ID-1), the one object of a standard size every table has, in mm. */
export const CARD_MM = { width: 85.6, height: 53.98, radius: 3.18 } as const;

/**
 * Where the dial of the card fit starts on a screen of `screenW` × `screenH` device pixels: a
 * 55" TV, the most common table TV (4K where the screen reports no size). The card corrects it.
 */
export function firstGuessPxPerMm(screenW: number, screenH: number): number {
  return screenW > 0 && screenH > 0 ? pxPerMM(screenW, screenH, 55) : pxPerMM(3840, 2160, 55);
}

/** Camera `t` (0–1, eased in and out) of the way from `from` to `to`; zoom and size change at an even rate. */
export function glideCamera(
  from: { centerX: number; centerY: number; scale: number; width?: number; height?: number },
  to: { centerX: number; centerY: number; scale: number; width?: number; height?: number },
  t: number,
): { centerX: number; centerY: number; scale: number; width?: number; height?: number } {
  const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  // Sizes change by a factor, like the zoom, so the glide feels even at every step
  const between = (a: number, b: number): number => a * (b / a) ** k;
  const sized = from.width && from.height && to.width && to.height
    ? { width: between(from.width, to.width), height: between(from.height, to.height) }
    : {};
  return {
    centerX: from.centerX + (to.centerX - from.centerX) * k,
    centerY: from.centerY + (to.centerY - from.centerY) * k,
    scale: between(from.scale, to.scale),
    ...sized,
  };
}
