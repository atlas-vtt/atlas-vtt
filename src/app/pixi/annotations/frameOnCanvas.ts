import type { Viewport } from 'pixi-viewport';
import { frameCorners, framePoint, type Frame } from '../../annotations/annotationFrame';
import { HANDLE_LOOK } from '../../annotations/annotationHandles';

/** From the frame's line to the outer edge of its corner handles, screen pixels. */
const HANDLE_REACH = HANDLE_LOOK.gap + HANDLE_LOOK.grip;
/** From the frame's line to the far edge of its turn handle, screen pixels. */
const TURN_REACH = HANDLE_LOOK.gap + HANDLE_LOOK.stem + HANDLE_LOOK.turnRadius;

/** What the frame of selected drawings and texts shows on the canvas, in the canvas' pixels: its corners with their handles, and its turn handle. */
export function frameOnCanvas(frame: Frame, viewport: Pick<Viewport, 'scale' | 'toScreen'>): { x: number; y: number }[] {
  const zoom = Math.abs(viewport.scale.x) || 1;
  return [...frameCorners(frame, HANDLE_REACH / zoom), framePoint(frame, { x: 0, y: -1 }, TURN_REACH / zoom)].map((point) => {
    const at = viewport.toScreen(point.x, point.y);
    return { x: at.x, y: at.y };
  });
}
