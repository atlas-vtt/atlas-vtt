import { drawMissingAssetImage, MISSING_ASSET_SIZE } from '../../services/AssetValidationService';
import { fitWithin } from '../../imageProcessing/imageLayout';
import { pyramidOf, type PixelRect, type TesseraRef } from './pyramid';
import type { OpenedMap } from './TesseraDecoderClient';
import type { TesseraSource } from './tesseraRequests';

/** What a `MosaicCanvas` shows: its tesserae, the whole picture on demand, and how to let go of it. */
export interface MapTesserae {
  readonly source: TesseraSource;
  /** Whether its tessera textures may outlive it in the cache: true for pyramids keyed by their source's hash. */
  readonly cacheable: boolean;
  /** The whole image fit within `maxSide` pixels. */
  overview(maxSide: number): Promise<ImageBitmap>;
  /** A part of the image (`rect` in its pixels) fit within `maxSide`, from the finest level that shows it so. */
  window(rect: PixelRect, maxSide: number): Promise<ImageBitmap>;
  /** Ends the open; requests still under way are cancelled. */
  close(): void;
}

/** The part of `MosaicCanvasService` a map's tesserae are read through. */
export interface TesseraReader {
  tessera(handle: number, ref: TesseraRef, signal?: AbortSignal): Promise<ImageBitmap>;
  overview(handle: number, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap>;
  window(handle: number, rect: PixelRect, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap>;
  close(handle: number): void;
}

/** The tesserae of a map image opened in the tessera worker. */
export function decoderTesserae(reader: TesseraReader, opened: OpenedMap): MapTesserae {
  const { handle, hash, pyramid } = opened;
  return {
    source: { key: hash, pyramid, requestTessera: (ref, signal) => reader.tessera(handle, ref, signal) },
    cacheable: true,
    overview: (maxSide) => reader.overview(handle, maxSide),
    window: (rect, maxSide) => reader.window(handle, rect, maxSide),
    close: () => reader.close(handle),
  };
}

/** The key the placeholder's textures are held under; never kept once it is no longer shown. */
export const PLACEHOLDER_KEY = 'missing-map-image';

/**
 * The missing-image placeholder (a grey question mark) as a pyramid of one tessera, drawn on this
 * thread from a canvas whenever a bitmap of it is asked for.
 */
export function placeholderTesserae(): MapTesserae {
  const pyramid = pyramidOf(MISSING_ASSET_SIZE, MISSING_ASSET_SIZE);
  const bitmap = async (size: { width: number; height: number }): Promise<ImageBitmap> => {
    const canvas = drawMissingAssetImage();
    if (!canvas) throw new Error('Could not draw the missing map image.');
    return createImageBitmap(canvas, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'medium' });
  };
  return {
    source: {
      key: PLACEHOLDER_KEY,
      pyramid,
      requestTessera: (_ref, signal) => {
        signal.throwIfAborted();
        return bitmap(pyramid);
      },
    },
    cacheable: false,
    overview: (maxSide) => bitmap(fitWithin(pyramid, maxSide, maxSide)),
    window: (rect, maxSide) => bitmap(fitWithin(rect, maxSide, maxSide)),
    close: () => undefined,
  };
}
