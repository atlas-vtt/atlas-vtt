/**
 * How the fog area selected in Areas mode is told from the others: its outline is drawn more
 * than twice as heavy, and every corner has a handle as a drawing program's are: light with an
 * edge in the theme's accent and a dark hairline round it, so it shows on any map. The handle
 * pointed at or dragged is larger and filled with the accent. All as large on screen at any zoom.
 */
import type { Graphics } from 'pixi.js';
import { cornerAt, edgeAt } from '../../fog/fogAreaEdit';
import { insideOutline } from '../../fog/fogAreaStroke';
import { outlineRings } from '../../fog/fogKeyhole';
import type { Point } from '../../types/visionTypes';
import type { CanvasBadgeTheme } from '../utils/canvasBadgeColors';

/** Screen pixels. */
export const FOG_HANDLE = { radius: 5, lit: 6.5, cornerReach: 9, edgeReach: 6 } as const;
/** The selected area's outline, in screen pixels: an area's own is 2 wide over a casing of 4 (`fogAreaOutlines.ts`). */
const SELECTED = { casing: 7.5, width: 5 } as const;
const LIGHT = 0xffffff;
const DARK = { color: 0x000000, alpha: 0.5 } as const;

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

/** Traces the edge of `outline`: where it has holes, its own and each hole's, never the slit between them. */
function trace(g: Graphics, outline: readonly Point[]): void {
  for (const ring of outlineRings(outline)) {
    const first = ring[0];
    if (!first) continue;
    g.moveTo(first.x, first.y);
    for (let i = 1; i < ring.length; i++) g.lineTo(ring[i]!.x, ring[i]!.y);
    g.closePath();
  }
}

/**
 * Draws the selected area's `outline` and its handles into `g` (cleared first) for a viewport at
 * `zoom`; `lit` is the corner pointed at or dragged.
 */
export function drawAreaHandles(g: Graphics, outline: readonly Point[], zoom: number, theme: CanvasBadgeTheme, lit: number | null): void {
  g.clear();
  const pixel = 1 / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  trace(g, outline);
  g.stroke({ width: SELECTED.casing * pixel, ...DARK, join: 'round' });
  trace(g, outline);
  g.stroke({ width: SELECTED.width * pixel, color: theme.accent, join: 'round' });
  outline.forEach((corner, index) => {
    const held = index === lit;
    const radius = (held ? FOG_HANDLE.lit : FOG_HANDLE.radius) * pixel;
    g.circle(corner.x, corner.y, radius + 0.5 * pixel).stroke({ width: pixel, ...DARK });
    g.circle(corner.x, corner.y, radius).fill({ color: held ? theme.accent : LIGHT });
    g.circle(corner.x, corner.y, radius - 0.75 * pixel).stroke({ width: 1.5 * pixel, color: held ? LIGHT : theme.accent });
  });
}
