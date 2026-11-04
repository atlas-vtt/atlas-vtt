import type { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { LevelSurface } from '../../types/sceneLevelTypes';
import type { Point } from '../../types/visionTypes';
import { areaHandlePoint } from '../../vision/polygonArea';
import { PolygonAreaOverlay } from '../areas/PolygonAreaOverlay';

/** Above the light zones' outlines (94), below the light markers (95). */
export const LEVEL_SURFACES_Z_INDEX = 94.5;

/** An opening's badge: a hole, a dark disc in a ring; in screen pixels about the badge's middle. */
function drawHole(g: Graphics, at: Point, pixel: number, color: number, alpha: number): void {
  g.circle(at.x, at.y, 5.5 * pixel).stroke({ width: 1.6 * pixel, color, alpha });
  g.circle(at.x, at.y, 3 * pixel).fill({ color, alpha });
}

/** A floor's badge: three planks. */
function drawPlanks(g: Graphics, at: Point, pixel: number, color: number, alpha: number): void {
  for (const y of [-4, 0, 4]) g.moveTo(at.x - 5.5 * pixel, at.y + y * pixel).lineTo(at.x + 5.5 * pixel, at.y + y * pixel);
  g.stroke({ width: 1.6 * pixel, color, alpha, cap: 'round' });
}

/**
 * The openings and floors of the level shown (`PolygonAreaOverlay`), as the GM edits them: each
 * with a badge, a hole for an opening, planks for a floor. A GM overlay (`GmOverlays`), shown only
 * in the lighting tool's openings mode.
 */
export function levelSurfaceOverlay(viewport: Viewport): PolygonAreaOverlay<LevelSurface> {
  return new PolygonAreaOverlay<LevelSurface>(viewport, {
    label: 'level-surfaces',
    zIndex: LEVEL_SURFACES_Z_INDEX,
    restingAlpha: 0,
    handleOf: (surface) => areaHandlePoint(surface.polygon),
    decorate: (g, surface, { at, pixel, theme, alpha }) => {
      if (surface.open) drawHole(g, at, pixel, theme.stroke, alpha);
      else drawPlanks(g, at, pixel, theme.stroke, alpha);
    },
  });
}
