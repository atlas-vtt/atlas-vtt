/**
 * The GM's working view of a presented scene: the centre and visible world size of the
 * view's map viewport. pixi-viewport emits `frame-end` on every tick, so watching it
 * sees gestures, programmatic moves and resizes alike (`ViewAtlasState.camera` is never
 * written, so it cannot be used). No PIXI imports: the viewport is described by what is read.
 */
import type { ViewCamera } from '../../api/types/views';

/** What the camera needs of a view: its renderer's viewport, when there is one. */
export interface CameraView {
  readonly renderer?: { getViewportInstance?(): CameraViewport | null } | null;
}

/** What the camera needs of pixi-viewport's `Viewport`. */
export interface CameraViewport {
  readonly center: { readonly x: number; readonly y: number };
  readonly worldScreenWidth: number;
  readonly worldScreenHeight: number;
  readonly destroyed: boolean;
  on(event: 'frame-end', listener: () => void): unknown;
  off(event: 'frame-end', listener: () => void): unknown;
}

export type { ViewCamera };

function liveViewport(view: CameraView): CameraViewport | null {
  const viewport = view.renderer?.getViewportInstance?.() ?? null;
  return viewport && !viewport.destroyed ? viewport : null;
}

/** The view's camera now; null without a live viewport or while it has no size. */
export function viewCamera(view: CameraView): ViewCamera | null {
  const viewport = liveViewport(view);
  if (!viewport) return null;
  const width = viewport.worldScreenWidth;
  const height = viewport.worldScreenHeight;
  if (!(width > 0) || !(height > 0)) return null;
  return { centerX: viewport.center.x, centerY: viewport.center.y, width, height };
}

/** Calls `listener` after every frame of the view's viewport; a no-op without one. */
export function watchViewCamera(view: CameraView, listener: () => void): () => void {
  const viewport = liveViewport(view);
  if (!viewport) return () => {};
  viewport.on('frame-end', listener);
  return () => {
    if (!viewport.destroyed) viewport.off('frame-end', listener);
  };
}
