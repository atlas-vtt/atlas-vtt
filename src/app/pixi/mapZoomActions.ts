import { Point } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { mapFit } from './fitMapRect';
import type { PixelRect } from './mosaicCanvas/pyramid';
import { SmoothWheelZoom } from './SmoothWheelZoom';
import { allowZoom } from './zoomRange';

/** Glides the camera to where the whole map shows: what the Fit map hotkey and the zoom buttons' Fit do. */
export function fitMapInView(viewport: Viewport, rect: PixelRect): void {
  const fit = mapFit(viewport, rect);
  allowZoom(viewport, fit.scale);
  viewport.animate({
    position: { x: fit.x, y: fit.y },
    scale: fit.scale,
    time: 400,
    ease: 'easeInOutCubic',
  });
}

/**
 * One step of zoom about the middle of the view, in (1) or out (-1): as far as a notch of a
 * mouse wheel goes, with the wheel's glide and within the view's zoom range.
 */
export function zoomViewByNotch(viewport: Viewport, direction: 1 | -1): void {
  const wheel = viewport.plugins.get('wheel', true);
  if (!(wheel instanceof SmoothWheelZoom)) return;
  wheel.zoomBy(direction * wheel.notchDoublings, new Point(viewport.screenWidth / 2, viewport.screenHeight / 2));
}
