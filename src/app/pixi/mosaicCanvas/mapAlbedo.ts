import { ImageSource, Texture } from 'pixi.js';
import type { MapTesserae } from './mosaicCanvasTesserae';
import { OVERVIEW_MAX_SIDE } from './pyramid';
import { isMapClosed } from './tesseraErrors';

/**
 * The lighting's albedo of a map image: a mipmapped texture of its overview,
 * made the first time it is asked for, so a map without lighting never makes one.
 */
export class MapAlbedo {
  private owner: MapTesserae | null = null;
  private texture: Texture | null = null;
  private bitmap: ImageBitmap | null = null;

  /** `ready` is called once a texture asked for has been made. */
  constructor(private readonly ready: () => void) {}

  /** The texture of `tesserae`' overview; null while it is being made. */
  textureOf(tesserae: MapTesserae): Texture | null {
    if (this.owner === tesserae) return this.texture;
    this.reset();
    this.owner = tesserae;
    tesserae.overview(OVERVIEW_MAX_SIDE).then(
      (bitmap) => {
        if (this.owner !== tesserae) {
          bitmap.close();
          return;
        }
        const source = new ImageSource({ resource: bitmap, autoGenerateMipmaps: true, scaleMode: 'linear', label: 'map-albedo' });
        // Collected, it would be uploaded again from a bitmap that may be closed by then.
        source.autoGarbageCollect = false;
        this.bitmap = bitmap;
        this.texture = new Texture({ source, label: 'map-albedo' });
        this.ready();
      },
      (error: unknown) => {
        if (this.owner === tesserae && !isMapClosed(error)) console.warn('[MosaicCanvas] The map image could not be read for the lighting:', error);
      },
    );
    return null;
  }

  /** Destroys the texture; the next `textureOf` makes a new one. */
  reset(): void {
    this.owner = null;
    this.texture?.destroy(true);
    this.bitmap?.close();
    this.texture = null;
    this.bitmap = null;
  }
}
