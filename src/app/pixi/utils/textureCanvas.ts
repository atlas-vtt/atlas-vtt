import { getDomHost } from '../../host/dom';

/** A canvas to draw a texture on, with its 2D context. */
export interface TextureCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

/**
 * A canvas of `width` × `height` for a texture that is drawn once, with its pixels in main memory;
 * null where no 2D canvas is available. Chromium keeps the pixels of an accelerated 2D canvas in
 * the GPU process: when that process dies it hands each such canvas back blank, and PIXI uploads
 * every texture again from its canvas once the WebGL context is restored, so badges, icons and
 * glyphs stayed blank until the map was opened again. A canvas made for frequent reads is kept in
 * main memory and keeps them.
 */
export function textureCanvas(width: number, height: number): TextureCanvas | null {
  const canvas = getDomHost().createCanvas(undefined, { width, height });
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return context ? { canvas, context } : null;
}
