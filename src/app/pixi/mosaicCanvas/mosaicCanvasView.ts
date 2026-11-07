import type { Container } from 'pixi.js';
import type { PixelRect } from './pyramid';

/** `image`: another image (or none) is shown, its world rect may differ; `albedo`: `albedoTexture()` became ready. */
export type MosaicCanvasChange = 'image' | 'albedo';

/** Where a map's pixels are read from: the whole image fit within `maxSide`, or a part of it, or null without one. */
export interface MapPixels {
  overview(maxSide: number): Promise<ImageBitmap | null>;
  /** `rect` of the image (its pixels) fit within `maxSide`, from the finest level that shows it so: cells at their size on a huge map. */
  window(rect: PixelRect, maxSide: number): Promise<ImageBitmap | null>;
}

/** A map image's size and pixels, what grid detection reads. */
export interface DetectableMap extends MapPixels {
  /** The image in world units, as it is drawn (stretched, where its grid's alignment says so); null while none is shown. */
  readonly worldRect: PixelRect | null;
  /** The image's own size in pixels; null while none is shown. */
  readonly imageSize: { width: number; height: number } | null;
}

/**
 * The part of `MosaicCanvas` the grid draws over: its world rect, the layer the grid goes above,
 * its pixels for the automatic line colour, and word of every other image it shows.
 */
export interface MosaicCanvasView extends DetectableMap {
  readonly layer: Container;
  /** The image's four corners in world units where it lies turned in its world rect; null or unset where the rect is the image. */
  readonly outline?: ReadonlyArray<{ x: number; y: number }> | null;
  onChange(listener: (change: MosaicCanvasChange) => void): () => void;
}
