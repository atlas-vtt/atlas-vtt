/**
 * The corner handles of the fog area selected in Areas mode: a small disc on every corner, in
 * the theme's accent, as large on screen at any zoom; the one pointed at or dragged is filled.
 */
import type { Graphics } from 'pixi.js';
import { cornerAt, edgeAt } from '../../fog/fogAreaEdit';
import { insideOutline } from '../../fog/fogAreaStroke';
import type { Point } from '../../types/visionTypes';
import type { CanvasBadgeTheme } from '../utils/canvasBadgeColors';

/** Screen pixels. */
export const FOG_HANDLE = { radius: 4.5, lit: 6, cornerReach: 9, edgeReach: 6 } as const;

/**
 * The cursor over the selected area's `outline` at the world point `at`: `grab` on a corner, which
 * a press drags, and `move` inside, where a press moves the area. Null on an edge, where a press
 * adds a corner, and outside.
 */
export function areaCursorAt(outline: readonly Point[], at: Point, zoom: number): string | null {
  if (cornerAt(outline, at, FOG_HANDLE.cornerReach / zoom) !== null) return 'grab';
  if (edgeAt(outline, at, FOG_HANDLE.edgeReach / zoom)) return null;
  return insideOutline(at, outline) ? 'move' : null;
}

/** Draws the handles of `outline` into `g` (cleared first) for a viewport at `zoom`; `lit` is the corner pointed at or dragged. */
export function drawAreaHandles(g: Graphics, outline: readonly Point[], zoom: number, theme: CanvasBadgeTheme, lit: number | null): void {
  g.clear();
  const pixel = 1 / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  outline.forEach((corner, index) => {
    const held = index === lit;
    const radius = (held ? FOG_HANDLE.lit : FOG_HANDLE.radius) * pixel;
    // A dark hairline keeps the handle's edge on a map as light as the handle.
    g.circle(corner.x, corner.y, radius + pixel).stroke({ width: pixel, color: 0x000000, alpha: 0.45 });
    g.circle(corner.x, corner.y, radius).fill({ color: held ? theme.accent : theme.background });
    g.circle(corner.x, corner.y, radius - 0.75 * pixel).stroke({ width: 1.5 * pixel, color: theme.accent });
  });
}
