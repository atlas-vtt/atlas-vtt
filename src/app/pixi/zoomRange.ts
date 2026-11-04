import type { ClampZoom } from 'pixi-viewport';

/** The zoom range of a view; a camera that needs more widens it (`allowZoom`, `fitZoomRange`). */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

/** The part of a pixi-viewport whose zoom limits are read and widened here. */
export interface ZoomLimited {
  plugins: { get<T>(name: string, ignorePaused?: boolean): T | null | undefined };
}

function limitsOf(viewport: ZoomLimited): ClampZoom['options'] | null {
  return viewport.plugins.get<ClampZoom>('clamp-zoom', true)?.options ?? null;
}

/** Lets `viewport` zoom to `scale` beyond its limits where needed, so an animation to it and later wheel input agree. */
export function allowZoom(viewport: ZoomLimited, scale: number): void {
  const limits = limitsOf(viewport);
  if (!limits || !Number.isFinite(scale) || scale <= 0) return;
  if (typeof limits.minScale === 'number') limits.minScale = Math.min(limits.minScale, scale);
  if (typeof limits.maxScale === 'number') limits.maxScale = Math.max(limits.maxScale, scale);
}

/**
 * Sets the least zoom of a view showing a map: `MIN_ZOOM`, or less where the whole map
 * (`fitScale`) needs it, so a map of any size can be seen whole and zoomed out to with the wheel.
 */
export function setMapZoomFloor(viewport: ZoomLimited, fitScale: number): void {
  const limits = limitsOf(viewport);
  if (!limits) return;
  limits.minScale = Number.isFinite(fitScale) && fitScale > 0 ? Math.min(MIN_ZOOM, fitScale) : MIN_ZOOM;
}
