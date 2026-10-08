import type { PlayerCameraState } from '../types/playerCamera';

/** A width and a height: of a screen in CSS pixels, of a canvas in its own. */
export interface Size {
  width: number;
  height: number;
}

/** The screen a canvas shows: its size in CSS pixels, and the canvas pixels to each of them. */
export interface Screen extends Size {
  resolution: number;
}

/** A rectangle of a canvas, in its pixels. */
export interface CanvasPart extends Size {
  x: number;
  y: number;
}

/** What players were frozen on: the camera, the screen it was centred in and the pixels of that screen's canvas. */
export interface FrozenFrame {
  camera: PlayerCameraState;
  screen: Size;
  pixels: Size;
}

/** How a canvas whose screen changed size gives players the frame they were frozen on. */
export interface FrozenView {
  /** The camera to render the canvas through. */
  camera: PlayerCameraState;
  /** The part of the rendered canvas that is the frozen frame. */
  part: CanvasPart;
  /** The size of the players' canvas: the pixels they were frozen on. */
  size: Size;
}

/**
 * The player window fits the canvas it is given into itself, so a canvas of another size is another
 * zoom for players. While they are frozen, the DM's pane may change size (a sidebar, a split): the
 * frozen frame then is the middle of a larger screen, copied pixel for pixel, and a screen too
 * small for it is rendered zoomed out and copied enlarged. Nothing while the screen is the frozen one.
 */
export function frozenView(frozen: FrozenFrame, screen: Screen, canvas: Size): FrozenView | undefined {
  if (screen.width === frozen.screen.width && screen.height === frozen.screen.height) return undefined;
  const fit = Math.min(1, screen.width / frozen.screen.width, screen.height / frozen.screen.height);
  const frameWidth = frozen.screen.width * fit;
  const frameHeight = frozen.screen.height * fit;
  // A canvas has whole pixels where its screen may have none (125 %): a frame copied as it is has the pixels it was frozen with
  const { width, height } = fit === 1 ? frozen.pixels : {
    width: Math.min(canvas.width, Math.round(frameWidth * screen.resolution)),
    height: Math.min(canvas.height, Math.round(frameHeight * screen.resolution)),
  };
  const part = { x: Math.round((canvas.width - width) / 2), y: Math.round((canvas.height - height) / 2), width, height };
  const scale = frozen.camera.scale * fit;
  // The part begins on a whole pixel: the camera moves by what lies between the frame's middle there and the screen's
  const offCentreX = part.x / screen.resolution + (frameWidth - screen.width) / 2;
  const offCentreY = part.y / screen.resolution + (frameHeight - screen.height) / 2;
  const moved = fit !== 1 || offCentreX !== 0 || offCentreY !== 0;
  const camera = moved
    ? { centerX: frozen.camera.centerX - offCentreX / scale, centerY: frozen.camera.centerY - offCentreY / scale, scale }
    : frozen.camera;
  return { camera, part, size: frozen.pixels };
}
