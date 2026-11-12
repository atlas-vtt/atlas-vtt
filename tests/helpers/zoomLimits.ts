import type { ClampZoom, Viewport } from 'pixi-viewport';

/** The least zoom the view's limits allow. */
export function leastZoom(viewport: Viewport): unknown {
  return viewport.plugins.get<ClampZoom>('clamp-zoom')?.options.minScale;
}

/** What the wheel can reach: a zoom far below every limit, clamped. */
export function zoomOutAllTheWay(viewport: Viewport): number {
  viewport.setZoom(0.001);
  viewport.plugins.get<ClampZoom>('clamp-zoom')?.clamp();
  return viewport.scale.x;
}
