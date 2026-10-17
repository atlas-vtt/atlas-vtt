import { IMAGE_PRESETS, optimizeImage, renderFramedImage, type ProcessedImage, type ThumbnailSpec } from '../../../../imageProcessing/imageProcessing';
import { THUMBNAIL_SPEC } from '../../../../services/AssetThumbnailService';
import { cropReset, tokenCropPlacement } from './cropMath';
import type { CreatorMode, ImagePosition } from './types';

/** Token images never get fewer pixels than this, so small art stays usable on the map. */
const MIN_TOKEN_SIZE = 256;
/** What a preview card shows of a map: sharp at the card's largest size on a 2x display, and cheap to paint. */
const MAP_CARD_PREVIEW: ThumbnailSpec = { size: 640, quality: 0.8 };
/** The whole image a token card's crop editor shows, as sharp as a saved token. */
const TOKEN_CARD_PREVIEW: ThumbnailSpec = { size: IMAGE_PRESETS.token.maxWidth, quality: IMAGE_PRESETS.token.quality };

/**
 * Conversions per upload. Statblocks often share their art, and each shared
 * image is read into one `File` (`statblockPreviewImages`), so every conversion
 * of it runs once however many previews use it.
 */
const conversions = new WeakMap<File, Map<string, Promise<ProcessedImage>>>();

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * The conversion `key` of `file`, started by the first caller and shared with
 * later ones. Cancelling it only drops it for callers that cancelled too:
 * another caller still waiting starts it again.
 */
function shared(file: File, key: string, signal: AbortSignal | undefined, run: (signal?: AbortSignal) => Promise<ProcessedImage>): Promise<ProcessedImage> {
  let entries = conversions.get(file);
  if (!entries) {
    entries = new Map<string, Promise<ProcessedImage>>();
    conversions.set(file, entries);
  }
  let conversion = entries.get(key);
  if (!conversion) {
    const started = run(signal);
    started.catch(() => { if (entries.get(key) === started) entries.delete(key); });
    entries.set(key, started);
    conversion = started;
  }
  return conversion.catch((error: unknown) => {
    if (isAbort(error) && !signal?.aborted) return shared(file, key, signal, run);
    throw error;
  });
}

export interface UploadOptions {
  signal?: AbortSignal | undefined;
  /** Render the thumbnail too; only worth it when this result is what gets saved. */
  thumbnail: boolean;
  /** A conversion started ahead of time, which jobs someone waits for may overtake. */
  background?: boolean;
}

/**
 * The whole upload as a map or unframed token saves it. Maps also get a
 * card-sized copy: painting a full map in a preview card stalls the window.
 */
export function optimizeUpload(file: File, mode: CreatorMode, options: UploadOptions): Promise<ProcessedImage> {
  return shared(file, `fit:${mode}:${options.thumbnail}`, options.signal, (signal) => optimizeImage(file, IMAGE_PRESETS[mode], {
    signal,
    thumbnail: options.thumbnail ? THUMBNAIL_SPEC : undefined,
    preview: mode === 'map' ? MAP_CARD_PREVIEW : undefined,
    background: options.background ?? false,
  }));
}

/** What the preview shows inside the circle or unframed square, with transparency and a thumbnail. */
export function cropTokenImage(file: File, scale: number, position: ImagePosition, signal?: AbortSignal, background = false, framed = true): Promise<ProcessedImage> {
  const { maxWidth, quality } = IMAGE_PRESETS.token;
  return shared(file, `crop:${scale}:${position.x}:${position.y}:${background}:${framed}`, signal, (shareSignal) =>
    renderFramedImage(file, tokenCropPlacement(scale, position, framed), {
      minSize: MIN_TOKEN_SIZE, maxSize: maxWidth, quality, thumbnail: THUMBNAIL_SPEC, signal: shareSignal, background,
      ...(background && { sourcePreview: TOKEN_CARD_PREVIEW }),
    }));
}

/**
 * The conversion a new preview starts in the background, and what saving it
 * unchanged needs: a framed token's default crop with the whole image for the
 * card, or the whole image of a map or unframed token. One decode serves both
 * the card and the save.
 */
export function convertForPreview(file: File, mode: CreatorMode, framed: boolean, signal?: AbortSignal): Promise<ProcessedImage> {
  if (mode === 'token' && framed) {
    const { imageScale, imagePosition } = cropReset({ file });
    return cropTokenImage(file, imageScale, imagePosition, signal, true);
  }
  return optimizeUpload(file, mode, { signal, thumbnail: true, background: true });
}

/** Token art as the creator saves it by default: cropped to the circle when framed, whole otherwise. */
export function convertTokenArt(file: File, framed: boolean, signal?: AbortSignal): Promise<ProcessedImage> {
  return framed
    ? cropTokenImage(file, 1, { x: 0, y: 0 }, signal)
    : optimizeUpload(file, 'token', { signal, thumbnail: true });
}
