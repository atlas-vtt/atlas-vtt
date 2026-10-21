import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import { cropReset } from './cropMath';
import { cropTokenImage, optimizeUpload } from './tokenImages';
import type { CreatorMode, TokenPreview } from './types';
import type { PreviewConversionKind } from './useTokenPreviews';

export interface SaveImageContext {
  mode: CreatorMode;
  /** The background conversion of a preview, if it produced `kind`. */
  waitForOptimized: (id: string, kind: PreviewConversionKind) => Promise<ProcessedImage | undefined>;
}

function isUntouchedCrop(preview: TokenPreview): boolean {
  const { imageScale, imagePosition } = cropReset(preview);
  return preview.imageScale === imageScale && preview.imagePosition.x === imagePosition.x && preview.imagePosition.y === imagePosition.y;
}

/**
 * The image a preview saves: a framed token cropped as the card shows it, a map
 * or untouched unframed token whole. Edited unframed art fills a square at its
 * chosen scale. The background conversion is reused when it made exactly that
 * (an untouched crop, the whole image), so the upload is decoded once;
 * otherwise the image is converted now.
 */
export async function prepareSaveImage(file: File, preview: TokenPreview, context: SaveImageContext, signal?: AbortSignal): Promise<ProcessedImage> {
  if (context.mode === 'token' && preview.showRing === false && !isUntouchedCrop(preview)) {
    return cropTokenImage(file, preview.imageScale, preview.imagePosition, signal, false, false);
  }
  if (context.mode === 'token' && preview.showRing !== false) {
    const background = isUntouchedCrop(preview) ? await context.waitForOptimized(preview.id, 'default-crop') : undefined;
    return background ?? cropTokenImage(file, preview.imageScale, preview.imagePosition, signal);
  }
  return (await context.waitForOptimized(preview.id, 'whole')) ?? optimizeUpload(file, context.mode, { signal, thumbnail: true });
}

/**
 * Starts preparing every preview's image at once; the image workers bound how
 * many run together, and the caller registers assets in order as they finish.
 */
export function prepareSaveImages(previews: readonly TokenPreview[], context: SaveImageContext, signal: AbortSignal): Map<string, Promise<ProcessedImage>> {
  const prepared = new Map<string, Promise<ProcessedImage>>();
  for (const preview of previews) {
    if (!preview.file) continue;
    const image = prepareSaveImage(preview.file, preview, context, signal);
    // Failures surface when the caller awaits this preview; previews it never reaches must not raise unhandled rejections.
    image.catch(() => undefined);
    prepared.set(preview.id, image);
  }
  return prepared;
}
