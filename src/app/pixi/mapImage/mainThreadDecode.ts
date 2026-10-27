import type { TFile } from 'obsidian';
import { decodeImage, imageMimeType } from '../decodedImage';
import type { MainThreadDecode } from './tileOpenRequest';
import { isVideoMapPath, videoMimeType } from './video/videoMapFiles';
import { videoPoster } from './video/videoPoster';

/** Decodes an image on this thread at the size an `<img>` gives it, for the tile worker to build a pyramid from. */
export async function decodeImageOnMainThread(bytes: ArrayBuffer, extension: string): Promise<ImageBitmap> {
  const image = await decodeImage(bytes, imageMimeType(extension), Infinity);
  return image instanceof ImageBitmap ? image : createImageBitmap(image);
}

/**
 * How a map file a worker cannot decode is decoded here, for its pyramid: an SVG as an image, a
 * video as its poster (its first frame). Undefined for the images a worker decodes itself.
 */
export function requiredMainThreadDecode(file: TFile): MainThreadDecode | undefined {
  if (isVideoMapPath(file.path)) return (bytes) => videoPoster(bytes, videoMimeType(file.path));
  if (file.extension.toLowerCase() === 'svg') return (bytes) => decodeImageOnMainThread(bytes, file.extension);
  return undefined;
}
