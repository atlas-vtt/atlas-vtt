import type { Container } from 'pixi.js';
import type { MapImageChange } from './mapImageTypes';
import type { PixelRect } from './pyramid';

/** Where a map's pixels are read from: the whole image fit within `maxSide`, or null without one. */
export interface MapPixels {
  overview(maxSide: number): Promise<ImageBitmap | null>;
}

/** A map image's size and pixels, what grid detection reads. */
export interface DetectableMap extends MapPixels {
  /** The image in world units; null while none is shown. */
  readonly worldRect: PixelRect | null;
}

/**
 * The part of `MapImage` the grid draws over: its world rect, the layer the grid goes above,
 * its pixels for the automatic line colour, and word of every other image it shows.
 */
export interface MapImageView extends DetectableMap {
  readonly layer: Container;
  onChange(listener: (change: MapImageChange) => void): () => void;
}
