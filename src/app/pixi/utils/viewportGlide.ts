import type { Viewport } from 'pixi-viewport';
import { CriticalSpring } from './criticalSpring';

export interface CameraTarget {
  /** The world point at the middle of the view. */
  x: number;
  y: number;
  scale: number;
}

/** Seconds a glide takes to all but arrive. */
const GLIDE_SECONDS = 0.55;
/** The longest step of the springs: a frame that was long in coming (a window in the background) is no leap. */
const MAX_STEP_SECONDS = 0.05;

/**
 * Moves the camera to `target` with one spring for its place and its zoom, so the GM sees where
 * the view goes. Any wheel or press on `canvas` ends the glide where it is: the camera is the
 * GM's. Returns what ends it.
 *
 * ponytail: stepped by requestAnimationFrame like `ValueTransition`, a frame behind PIXI's ticker
 * at worst; move it to the app's ticker if a glide ever judders.
 */
export function glideViewport(viewport: Viewport, canvas: HTMLElement, target: CameraTarget): () => void {
  const view = canvas.ownerDocument.defaultView ?? window;
  const x = new CriticalSpring(viewport.center.x, target.x, GLIDE_SECONDS);
  const y = new CriticalSpring(viewport.center.y, target.y, GLIDE_SECONDS);
  // Zoom is felt in ratios, so it is the logarithm that travels evenly.
  const zoom = new CriticalSpring(Math.log(viewport.scale.x), Math.log(target.scale), GLIDE_SECONDS);
  let frame = 0;
  let last = performance.now();

  const end = (): void => {
    view.cancelAnimationFrame(frame);
    canvas.removeEventListener('wheel', end);
    canvas.removeEventListener('pointerdown', end);
  };
  const step = (now: number): void => {
    const seconds = Math.min(MAX_STEP_SECONDS, (now - last) / 1000);
    last = now;
    viewport.scale.set(Math.exp(zoom.step(seconds)));
    viewport.moveCenter(x.step(seconds), y.step(seconds));
    viewport.emit('zoomed', { viewport, type: 'animate' });
    if (x.settled && y.settled && zoom.settled) end();
    else frame = view.requestAnimationFrame(step);
  };

  canvas.addEventListener('wheel', end, { passive: true });
  canvas.addEventListener('pointerdown', end);
  frame = view.requestAnimationFrame(step);
  return end;
}
