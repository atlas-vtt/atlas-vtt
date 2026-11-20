import { TFile, type App } from 'obsidian';
import { decodeImage, imageMimeType } from '../../pixi/decodedImage';
import { opaqueInset, type ArtInset } from './opaqueInset';

/** The side the art is measured at: enough to find its margins to a pixel of a card. */
const MEASURE_SIDE = 96;
/** Formats that hold no transparency. */
const OPAQUE_FORMATS = new Set(['jpg', 'jpeg', 'bmp']);

/** Each file's art inset, by its path and when it last changed. */
const measured = new Map<string, Promise<ArtInset | null>>();

/**
 * Where the art of the vault image at `imagePath` lies inside its transparent margins (`opaqueInset`), measured once
 * per version of the file. Its bytes are read from the vault: a canvas that drew the resource URL could not be read.
 * Null for an image with nothing to trim, one that is not in the vault, or one that cannot be read.
 */
export function artInsetOf(app: App, imagePath: string): Promise<ArtInset | null> {
  const file = app.vault.getAbstractFileByPath(imagePath);
  if (!(file instanceof TFile) || OPAQUE_FORMATS.has(file.extension.toLowerCase())) return Promise.resolve(null);
  const key = `${file.path}|${file.stat.mtime}`;
  let inset = measured.get(key);
  if (!inset) {
    inset = measure(app, file).catch(() => null);
    measured.set(key, inset);
  }
  return inset;
}

async function measure(app: App, file: TFile): Promise<ArtInset | null> {
  const image = await decodeImage(await app.vault.readBinary(file), imageMimeType(file.extension), MEASURE_SIDE);
  // Read before closing: a closed bitmap has no size
  const { width, height } = image;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  if ('close' in image) image.close();
  return opaqueInset(context.getImageData(0, 0, width, height).data, width, height);
}
