import { derivedImageFormat } from './imageEncoder';
import { fitWithin, type Size } from './imageLayout';

/**
 * WebKit on iPadOS draws nothing on a canvas above a size of its own (4096 × 4096 before
 * iPadOS 18, 8192 × 8192 from there) and says nothing: the picture comes out blank. So a canvas
 * larger than every platform takes is asked whether it holds a pixel in its far corner before
 * anything is drawn on it, and a picture that would not be drawn is fit within the next smaller
 * step instead. Pure but for `OffscreenCanvas`: runs in the workers and on the main thread.
 */

/** A canvas with sides up to this draws wherever Atlas runs. */
export const CANVAS_SAFE_SIDE = 4096;
/** The sides a picture is fit within, one after the other, when its canvas draws nothing. */
export const CANVAS_SIDE_STEPS: readonly number[] = [16384, 8192, CANVAS_SAFE_SIDE];

export interface CanvasLimit {
  /** The longest side found to draw after a larger canvas did not; `Infinity` while every canvas drew. */
  readonly maxSide: number;
  /**
   * What `make` makes of `wanted`, or of the largest smaller fit it makes anything of (`make`
   * answers null for a size it cannot draw at). What is learned stays: later pictures start at it.
   */
  largest<T>(wanted: Size, make: (size: Size) => T | null): T;
}

/** `wanted` within a square of `maxSide`, never scaled up. */
export function withinCanvas(wanted: Size, maxSide: number): Size {
  return Number.isFinite(maxSide) ? fitWithin(wanted, maxSide, maxSide) : wanted;
}

/** The largest step shorter than `side`, or undefined below the smallest. */
export function nextCanvasStep(side: number): number | undefined {
  return CANVAS_SIDE_STEPS.find((step) => step < side);
}

export function createCanvasLimit(): CanvasLimit {
  let maxSide = Infinity;
  return {
    get maxSide(): number {
      return maxSide;
    },
    largest<T>(wanted: Size, make: (size: Size) => T | null): T {
      for (let size = withinCanvas(wanted, maxSide); ;) {
        const made = make(size);
        if (made !== null) return made;
        const step = nextCanvasStep(Math.max(size.width, size.height));
        if (step === undefined) throw new Error('Could not create a drawing surface for the image.');
        maxSide = step;
        size = withinCanvas(wanted, step);
      }
    },
  };
}

/** Whether a pixel drawn in the far corner of `canvas` is there to be read; the canvas is left clear. */
export function holdsPixels(canvas: OffscreenCanvas): boolean {
  const context = canvas.getContext('2d');
  const reader = new OffscreenCanvas(1, 1).getContext('2d');
  if (!context || !reader) return false;
  const x = canvas.width - 1;
  const y = canvas.height - 1;
  context.fillRect(x, y, 1, 1);
  reader.drawImage(canvas, x, y, 1, 1, 0, 0, 1, 1);
  context.clearRect(x, y, 1, 1);
  return reader.getImageData(0, 0, 1, 1).data[3] !== 0;
}

/** Gives a canvas's pixels back now, not at garbage collection: WebKit counts every canvas alive against one total. */
export function releaseCanvas(canvas: OffscreenCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}

const realm = createCanvasLimit();
/** Whether this realm's canvases are asked before they are drawn on; unknown canvases are not. */
let asked = false;

/**
 * Finds out whether this realm's large canvases must be asked. Only an engine that cannot encode
 * WebP has such a limit (WebKit), and asking is not free elsewhere: Chromium would read a large
 * canvas back from the graphics card for the one pixel. Call it once before `drawingCanvas`.
 */
export async function learnCanvasLimit(): Promise<void> {
  // A realm that cannot say is left as every realm was before canvases were asked.
  asked = (await derivedImageFormat((width, height) => new OffscreenCanvas(width, height)).catch(() => 'webp')) === 'png';
}

/** A canvas of `size`, or null where this realm draws nothing on one that large. */
export function drawingCanvas(size: Size): OffscreenCanvas | null {
  if (!asked || Math.max(size.width, size.height) <= CANVAS_SAFE_SIDE) return new OffscreenCanvas(size.width, size.height);
  let canvas: OffscreenCanvas;
  try {
    canvas = new OffscreenCanvas(size.width, size.height);
  } catch {
    return null;
  }
  if (holdsPixels(canvas)) return canvas;
  releaseCanvas(canvas);
  return null;
}

/** A canvas for a picture of `wanted`: that size where this realm draws on it, else the largest fit it draws on. */
export function fittingCanvas(wanted: Size): OffscreenCanvas {
  return realm.largest(wanted, drawingCanvas);
}
