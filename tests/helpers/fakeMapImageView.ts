import { Container } from 'pixi.js';
import type { MapImageChange } from '../../src/app/pixi/mapImage/MapImage';
import type { MapImageView } from '../../src/app/pixi/mapImage/mapImageView';
import type { PixelRect } from '../../src/app/pixi/mapImage/pyramid';

/** A map image for grid tests: `show` swaps the image (or takes it off) and tells the listeners, as `MapImage.load` does. */
export interface FakeMapImageView extends MapImageView {
  show(rect: PixelRect | null): void;
}

export interface FakeMapImageOptions {
  /** What the image draws in; a sprite of the map in tests that render it. A bare container by default. */
  layer?: Container;
  /** The image's pixels; none by default, so the automatic grid colour reads as white. */
  overview?: (maxSide: number) => Promise<ImageBitmap | null>;
}

/** A map image showing a `width` × `height` image at the origin. */
export function fakeMapImageView(width: number, height: number, options: FakeMapImageOptions = {}): FakeMapImageView {
  const listeners = new Set<(change: MapImageChange) => void>();
  let worldRect: PixelRect | null = { x: 0, y: 0, width, height };
  return {
    layer: options.layer ?? new Container({ label: 'map-image' }),
    get worldRect(): PixelRect | null {
      return worldRect;
    },
    overview: options.overview ?? ((): Promise<ImageBitmap | null> => Promise.resolve(null)),
    onChange(listener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    show(rect): void {
      worldRect = rect;
      for (const listener of [...listeners]) listener('image');
    },
  };
}

/** The map image whose layer is `layer` (already in the viewport), as large as `layer` is. */
export function mapImageViewOf(layer: Container, options: Omit<FakeMapImageOptions, 'layer'> = {}): FakeMapImageView {
  return fakeMapImageView(layer.width, layer.height, { ...options, layer });
}

/** Lets the automatic grid colour, read from the overview, arrive. */
export async function settleGridColor(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
