/**
 * The lines the fog tool marks the map with before anything is fog: the cell under the pointer,
 * the cells of a drag, a polygon's corners and edges. A light line (red where it reveals) over a
 * dark one, both as wide on screen at any zoom, so they show on a light map and on fog, as the
 * brush's ring does.
 */
import type { Graphics } from 'pixi.js';
import type { Point } from '../../types/visionTypes';

/** Screen pixels. */
export const FOG_MARK = { width: 2, alpha: 0.6, casing: 4 } as const;
export const FOG_MARK_CASING = { color: 0x000000, alpha: 0.4 } as const;

/** Strokes the closed `outlines` (world points) into `g`, which the caller has cleared, in `color` for a viewport at `zoom`. */
export function strokeFogOutlines(g: Graphics, outlines: readonly (readonly Point[])[], color: number, zoom: number): void {
  const pixel = 1 / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  // The casing first, then the line: one stroke each, however many outlines there are.
  for (const pass of ['casing', 'line'] as const) {
    for (const outline of outlines) g.poly(outline.flatMap((point) => [point.x, point.y]), true);
    if (pass === 'casing') g.stroke({ width: FOG_MARK.casing * pixel, ...FOG_MARK_CASING });
    else g.stroke({ width: FOG_MARK.width * pixel, color, alpha: FOG_MARK.alpha });
  }
}
