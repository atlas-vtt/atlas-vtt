/** A view's camera: the world point at the centre of its screen and its zoom. */
export interface ViewCamera {
  centerX: number;
  centerY: number;
  scale: number;
  /** The level of the scene the view shows; unset is the first. */
  level?: string | undefined;
}

/** Puts the viewport's camera at `camera`. */
export function showCamera(viewport: { setZoom(scale: number): unknown; moveCenter(x: number, y: number): unknown }, camera: ViewCamera): void {
  // The zoom first: moveCenter places the viewport by its current scale.
  viewport.setZoom(camera.scale);
  viewport.moveCenter(camera.centerX, camera.centerY);
}
