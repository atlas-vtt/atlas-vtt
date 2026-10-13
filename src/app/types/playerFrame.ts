/** A width and a height: of a screen in CSS pixels, of a picture in its own. */
export interface Size {
  width: number;
  height: number;
}

/** What a canvas or window shows: its size in CSS pixels, and the device pixels to each of them. */
export interface Screen extends Size {
  resolution: number;
}

/** A rectangle of the world, by its centre and its size. */
export interface WorldView extends Size {
  centerX: number;
  centerY: number;
}

/**
 * The players' picture as it is rendered: `width` × `height` pixels, `resolution` of them to each
 * of its points, showing the world around (`centerX`, `centerY`) at `scale` points per world pixel.
 */
export interface PlayerFrame extends Size {
  resolution: number;
  /** Whether its edges are smoothed with multisampling. */
  antialias: boolean;
  centerX: number;
  centerY: number;
  scale: number;
}

/**
 * A part of a rendered players' frame, as a canvas holds it right now: `width` × `height` pixels
 * at (`x`, `y`) of `image`, which belong at (`left`, `top`) of the frame. The canvas keeps it
 * only until the next part is drawn, so it is copied at once.
 */
export interface FramePiece extends Size {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  left: number;
  top: number;
}
