import type { PixelRect } from './mapImage/pyramid';

/** Share of the screen the fitted map takes along its tighter side. */
const FIT_PADDING = 0.9;
const MIN_FIT_ZOOM = 0.1;
const MAX_FIT_ZOOM = 5;

/** The camera that shows the whole of `rect`: its centre and zoom. */
export interface MapFit {
  x: number;
  y: number;
  scale: number;
}

/** Where the camera goes to show the whole map within a screen of `screenWidth` × `screenHeight`. */
export function mapFit(screen: { screenWidth: number; screenHeight: number }, rect: PixelRect): MapFit {
  const scale = Math.min((screen.screenWidth * FIT_PADDING) / rect.width, (screen.screenHeight * FIT_PADDING) / rect.height);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    scale: Math.max(MIN_FIT_ZOOM, Math.min(scale, MAX_FIT_ZOOM)),
  };
}

/** Centres the viewport on the map and zooms so the whole of it shows. */
export function fitMapRect(
  viewport: { screenWidth: number; screenHeight: number; setZoom(scale: number): unknown; moveCenter(x: number, y: number): unknown },
  rect: PixelRect,
): void {
  const fit = mapFit(viewport, rect);
  viewport.setZoom(fit.scale);
  viewport.moveCenter(fit.x, fit.y);
}
