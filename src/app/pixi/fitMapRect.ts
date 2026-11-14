import type { PixelRect } from './mosaicCanvas/pyramid';
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

/** A view whose zoom range is fitted to its map: its limits and the size of its screen. */
type FittedView = ZoomLimited & { screenWidth: number; screenHeight: number };

/** The map each view's zoom range was last fitted to; the fit depends on the screen, which changes size (`refitZoomRange`). */
const fittedMaps = new WeakMap<FittedView, PixelRect>();

/** Sets the view's least zoom to what shows the whole map, where that is below `MIN_ZOOM`. */
export function fitZoomRange(viewport: FittedView, rect: PixelRect): void {
  fittedMaps.set(viewport, rect);
  setMapZoomFloor(viewport, mapFit(viewport, rect).scale);
}

/**
 * Fits the view's zoom range again to the map it was last fitted to, for a screen of another size:
 * a pane made smaller needs a lower least zoom to show the same map whole. Nothing for a view
 * that was never fitted to a map.
 */
export function refitZoomRange(viewport: FittedView): void {
  const rect = fittedMaps.get(viewport);
  if (rect) fitZoomRange(viewport, rect);
}

/** Centres the viewport on the map and zooms so the whole of it shows. */
export function fitMapRect(
  viewport: FittedView & { setZoom(scale: number): unknown; moveCenter(x: number, y: number): unknown },
  rect: PixelRect,
): void {
  const fit = mapFit(viewport, rect);
  fitZoomRange(viewport, rect);
  viewport.setZoom(fit.scale);
  viewport.moveCenter(fit.x, fit.y);
}
