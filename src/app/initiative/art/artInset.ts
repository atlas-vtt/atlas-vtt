import { TFile, type App } from 'obsidian';
import { decodeImage, imageMimeType } from '../../pixi/decodedImage';
import { artViewBox, opaqueInset, type ArtInset } from './opaqueInset';

/** The side the art is measured at: enough to find its margins to a pixel of a card. */
const MEASURE_SIDE = 96;
/** Formats that hold no transparency. */
const OPAQUE_FORMATS = new Set(['jpg', 'jpeg', 'bmp']);

/** Each file's art inset, by its path and when it last changed. */
const measured = new Map<string, Promise<ArtInset | null>>();
/** The insets measured so far, by the same key, for a list drawn anew that must not wait for one it knows. */
const known = new Map<string, ArtInset | null>();

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
    inset = measure(app, file).catch(() => null).then((found) => {
      known.set(key, found);
      return found;
    });
    measured.set(key, inset);
  }
  return inset;
}

/**
 * Hands `apply` the `object-view-box` that frames the art of `imagePath` without its transparent margins
 * (`artInsetOf`): at once where it was measured before, so a list drawn anew on every change never shows the margins
 * for a frame, else once it is. Nothing where there is nothing to trim.
 */
export function withArtViewBox(app: App, imagePath: string, apply: (viewBox: string) => void): void {
  const file = app.vault.getAbstractFileByPath(imagePath);
  const key = file instanceof TFile ? `${file.path}|${file.stat.mtime}` : null;
  if (key !== null && known.has(key)) {
    const inset = known.get(key);
    if (inset) apply(artViewBox(inset));
    return;
  }
  void artInsetOf(app, imagePath).then((inset) => {
    if (inset) apply(artViewBox(inset));
  });
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
