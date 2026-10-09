import type { PixelRect } from './mapImage/pyramid';
import { MAX_ZOOM, MIN_ZOOM, setMapZoomFloor, type ZoomLimited } from './zoomRange';

/** Share of the screen the fitted map takes along its tighter side. */
const FIT_PADDING = 0.9;

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
    // Never below what shows the whole map: a map larger than `MIN_ZOOM` allows widens the view's range.
    scale: scale > 0 ? Math.min(scale, MAX_ZOOM) : MIN_ZOOM,
  };
}

/** Sets the view's least zoom to what shows the whole map, where that is below `MIN_ZOOM`. */
export function fitZoomRange(viewport: ZoomLimited & { screenWidth: number; screenHeight: number }, rect: PixelRect): void {
  setMapZoomFloor(viewport, mapFit(viewport, rect).scale);
}

/** Centres the viewport on the map and zooms so the whole of it shows. */
export function fitMapRect(
  viewport: ZoomLimited & { screenWidth: number; screenHeight: number; setZoom(scale: number): unknown; moveCenter(x: number, y: number): unknown },
  rect: PixelRect,
): void {
  const fit = mapFit(viewport, rect);
  setMapZoomFloor(viewport, fit.scale);
  viewport.setZoom(fit.scale);
  viewport.moveCenter(fit.x, fit.y);
}
