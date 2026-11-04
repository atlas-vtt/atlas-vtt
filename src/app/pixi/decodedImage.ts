import { CanvasSource, ImageSource, type TextureSourceOptions } from 'pixi.js';
import { withDecodedImage } from '../imageProcessing/imageElement';
import { fitWithin } from '../imageProcessing/imageLayout';

/** An image ready for a texture: a bitmap, or the canvas an `<img>` was drawn on. */
export type DecodedImage = ImageBitmap | HTMLCanvasElement;

const MIME_TYPES: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'bmp': 'image/bmp',
  'ico': 'image/x-icon',
  'tiff': 'image/tiff',
  'tif': 'image/tiff',
};

/** The MIME type of an image file by its extension. */
export function imageMimeType(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] || 'image/png';
}

/**
 * Decode an image off the main thread and downscale it to fit `maxSize` a side.
 * Falls back to an <img> + canvas decode for formats createImageBitmap cannot
 * handle (notably SVG in Chromium).
 */
export async function decodeImage(buffer: ArrayBuffer, mimeType: string, maxSize: number): Promise<DecodedImage> {
  const blob = new Blob([buffer], { type: mimeType });
  if (mimeType !== 'image/svg+xml') {
    try {
      const full = await createImageBitmap(blob);
      const target = fitWithin(full, maxSize, maxSize);
      if (target.width === full.width && target.height === full.height) return full;
      const scaled = await createImageBitmap(full, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high',
      });
      full.close();
      return scaled;
    } catch {
      // Fall through to the <img> path
    }
  }
  return withDecodedImage(blob, (img) => {
    const target = fitWithin({ width: img.naturalWidth || 512, height: img.naturalHeight || 512 }, maxSize, maxSize);
    const canvas = createEl('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, target.width, target.height);
    return canvas;
  });
}

/** The texture source of a decoded image. */
export function decodedSource(image: DecodedImage, options: TextureSourceOptions): ImageSource | CanvasSource {
  return image instanceof ImageBitmap
    ? new ImageSource({ resource: image, ...options })
    : new CanvasSource({ resource: image, ...options });
}
