import { PLAIN_BACK_BUFFER_RESOLUTION } from '../pixi/lighting/engine/backBuffer';
import type { PlayerCameraState } from '../types/playerCamera';
import type { PlayerFrame, Screen, Size, WorldView } from '../types/playerFrame';

/**
 * Most pixels a players' frame is rendered with: a frame at the player window's own size costs
 * what its pixels cost, on the GM's graphics card, and a 3840 × 2160 frame took four to eight
 * times the capture of a pane. A larger window gets a frame of its shape with this many pixels,
 * which the browser scales up. A later device setting can read another budget here.
 */
export const PLAYER_FRAME_PIXEL_BUDGET = 2560 * 1440;

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** The whole pixels of a screen's canvas; none for a screen without a size. */
function pixelsOf(screen: Screen): Size | null {
  if (!isPositive(screen.width) || !isPositive(screen.height) || !isPositive(screen.resolution)) return null;
  const width = Math.round(screen.width * screen.resolution);
  const height = Math.round(screen.height * screen.resolution);
  return width >= 1 && height >= 1 ? { width, height } : null;
}

/** Whether `view` is a rectangle with a place and a size. */
function isWorldView({ centerX, centerY, width, height }: WorldView): boolean {
  return Number.isFinite(centerX) && Number.isFinite(centerY) && isPositive(width) && isPositive(height);
}

/** Whether `camera` holds the world rectangle it frames; half a rectangle is none. */
function framesOwnView(camera: PlayerCameraState): camera is PlayerCameraState & Size {
  return camera.width !== undefined && camera.height !== undefined;
}

/**
 * The world rectangle `camera` frames: its own, else what `screen` (the GM's) shows at its scale.
 * None while neither is known.
 */
export function viewOf(camera: PlayerCameraState, screen: Size | undefined): WorldView | null {
  const { centerX, centerY, scale } = camera;
  const size = framesOwnView(camera) ? camera : screen && { width: screen.width / scale, height: screen.height / scale };
  if (!size) return null;
  const view = { centerX, centerY, width: size.width, height: size.height };
  return isWorldView(view) ? view : null;
}

/** What a viewport offers of its camera: the world point in the middle of its screen, its zoom and its screen. */
interface ViewportCamera {
  readonly center: { x: number; y: number };
  readonly scale: { x: number };
  readonly screenWidth: number;
  readonly screenHeight: number;
}

/** The camera of the DM's viewport, with the world rectangle its screen shows. */
export function viewportCamera(viewport: ViewportCamera): PlayerCameraState {
  const scale = viewport.scale.x;
  return { centerX: viewport.center.x, centerY: viewport.center.y, scale, width: viewport.screenWidth / scale, height: viewport.screenHeight / scale };
}

/**
 * `camera` holding the world rectangle it frames on `screen`, so that it keeps that rectangle
 * whatever size the screen takes later. A camera that has one, or no screen to read it from, is
 * returned as it is.
 */
export function framedCamera(camera: PlayerCameraState, screen: Size | undefined): PlayerCameraState {
  if (framesOwnView(camera)) return camera;
  const view = viewOf(camera, screen);
  return view ? { ...camera, width: view.width, height: view.height } : camera;
}

/**
 * The players' frame for `window`, showing `view`: centred on the view's centre and scaled so
 * that all of the view fits in the window (the rest of the window shows the map around it). It
 * has the window's own pixels, up to the budget; a larger window gets fewer in its own shape,
 * never fewer than `pane`, the canvas the players' picture was a copy of, has. Null where there
 * is nothing to render: a window or a view without a size.
 */
export function playerFrame(window: Screen, view: WorldView, pane?: Screen): PlayerFrame | null {
  const full = pixelsOf(window);
  if (!full || !isWorldView(view)) return null;
  const panePixels = pane ? pixelsOf(pane) : null;
  const budget = Math.max(PLAYER_FRAME_PIXEL_BUDGET, panePixels ? panePixels.width * panePixels.height : 0);
  const pixels = full.width * full.height;
  const shrink = pixels > budget ? Math.sqrt(budget / pixels) : 1;
  const width = Math.max(1, Math.round(full.width * shrink));
  const height = Math.max(1, Math.round(full.height * shrink));
  const resolution = width / window.width;
  return {
    width,
    height,
    resolution,
    // As the canvas' back buffer: smoothed below two pixels per point, and only while it costs what the budget allows
    antialias: resolution < PLAIN_BACK_BUFFER_RESOLUTION && Math.min(pixels, budget) <= PLAYER_FRAME_PIXEL_BUDGET,
    centerX: view.centerX,
    centerY: view.centerY,
    scale: Math.min(window.width / view.width, height / resolution / view.height),
  };
}
