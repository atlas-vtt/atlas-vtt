/**
 * Geometry for showing the player view on a TV lying flat on the table: "one grid cell = N mm of
 * real glass". No DOM, so it is testable.
 */

export const MM_PER_INCH = 25.4;

export const TV_DIAGONAL_PRESETS = [32, 40, 43, 50, 55, 65, 75, 85];
/** Resolutions of the signal the computer sends, not the panel's native one; `auto` reads the screen. */
export const TV_RESOLUTION_PRESETS = ['auto', '1920x1080', '2560x1440', '3840x2160'] as const;
export const CELL_MM_PRESETS = [25, 25.4, 27, 28, 30, 32];

/** Device pixels per millimetre of glass. Uses the diagonal, so any aspect ratio works. */
export function pxPerMM(resW: number, resH: number, diagIn: number): number {
  if (!(resW > 0) || !(resH > 0) || !(diagIn > 0)) throw new Error('resolution and TV diagonal must be > 0');
  return Math.hypot(resW, resH) / (diagIn * MM_PER_INCH);
}

/** Device pixels one grid cell must span so it measures `cellMm` on the glass. `trim` is a percentage. */
export function cellPx(resW: number, resH: number, diagIn: number, cellMm: number, trim = 100): number {
  return cellMm * pxPerMM(resW, resH, diagIn) * (trim / 100);
}

/** `"3840x2160"` → size; anything else (e.g. `auto`) → `fallback`. */
export function parseResolution(value: string, fallback: { w: number; h: number }): { w: number; h: number } {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/.exec(value.trim());
  return match ? { w: Number(match[1]), h: Number(match[2]) } : fallback;
}

/** Trim that makes the next measurement read `expectedMm` when it read `measuredMm` at `trim`. */
export function calibratedTrim(trim: number, expectedMm: number, measuredMm: number): number {
  if (!(measuredMm > 0) || !(expectedMm > 0)) return trim;
  return Math.round(trim * (expectedMm / measuredMm) * 100) / 100;
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
