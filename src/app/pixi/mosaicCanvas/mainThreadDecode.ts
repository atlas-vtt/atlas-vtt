import type { TFile } from 'obsidian';
import { DECODED_MAX_PIXELS } from '../../imageProcessing/decodeLimits';
import { decodeImage, imageMimeType } from '../decodedImage';
import type { MainThreadDecode } from './tesseraOpenRequest';
import { isVideoMapPath, videoMimeType } from './video/videoMapFiles';
import { videoPoster } from './video/videoPoster';

/** The longest side a main-thread decode may have: a square of it stays below `DECODED_MAX_PIXELS`. */
const MAIN_THREAD_MAX_SIDE = Math.floor(Math.sqrt(DECODED_MAX_PIXELS - 1));

/**
 * Decodes an image on this thread at the size an `<img>` gives it, for the tessera worker to build a
 * pyramid from; drawn on a canvas and held as one bitmap, so never as many pixels as the browser dies on.
 */
export async function decodeImageOnMainThread(bytes: ArrayBuffer, extension: string): Promise<ImageBitmap> {
  const image = await decodeImage(bytes, imageMimeType(extension), MAIN_THREAD_MAX_SIDE);
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
