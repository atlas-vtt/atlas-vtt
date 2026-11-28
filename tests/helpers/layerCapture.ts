import { applyLayerVisibility, type LayerVisibility, type PlayerFrameCamera } from '../../src/app/pixi/playerSafeFrame';

/**
 * Renders a test's own stage with `layers` (and a players' camera) applied, as a map view's
 * `PictureCapture` applies its parts', then puts the DM's frame back and renders it again.
 */
export function captureWithLayerVisibility(
  layers: readonly LayerVisibility[],
  render: () => void,
  capture: () => void,
  camera?: PlayerFrameCamera,
): void {
  const { differs, restore } = applyLayerVisibility(layers, camera);
  if (!differs) {
    capture();
    return;
  }
  try {
    render();
    capture();
  } finally {
    restore();
    render();
  }
}

/**
 * `captureWithLayerVisibility` for a caller that renders the DM's frame itself afterwards, or
 * whose own render of it follows in the same task (`RenderScheduler`'s before-render hook), so
 * restoring costs no render here. The player frame is always rendered: nothing holds it yet.
 */
export function captureBeforeRender(
  layers: readonly LayerVisibility[],
  render: () => void,
  capture: () => void,
  camera?: PlayerFrameCamera,
): void {
  const { restore } = applyLayerVisibility(layers, camera);
  try {
    render();
    capture();
  } finally {
    restore();
  }
}
