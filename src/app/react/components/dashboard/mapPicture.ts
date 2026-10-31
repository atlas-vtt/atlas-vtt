import { TFile, type App } from 'obsidian';
import { MosaicCanvasService } from '../../../pixi/mosaicCanvas/MosaicCanvasService';

/** The longest side of the pictures the dashboard shows of a map: sharp across a wide pane, a small part of the map's own size. */
export const MAP_PICTURE_SIDE = 1600;
/** Pictures kept per app; beyond that the least recently asked for is let go. */
const KEPT_PICTURES = 8;
const PICTURE_QUALITY = 0.9;

interface PictureCache {
  /** By the file's path, size and time, the most recently asked for last. */
  readonly pictures: Map<string, Promise<string | null>>;
  /** Pictures are made one at a time: each opens a map's tesserae, which may first have to be built. */
  queue: Promise<unknown>;
}

const caches = new WeakMap<App, PictureCache>();

function cacheOf(app: App): PictureCache {
  let cache = caches.get(app);
  if (!cache) {
    cache = { pictures: new Map(), queue: Promise.resolve() };
    caches.set(app, cache);
  }
  return cache;
}

function revoke(picture: Promise<string | null>): void {
  void picture.then((url) => { if (url !== null) URL.revokeObjectURL(url); });
}

/** The whole map at `MAP_PICTURE_SIDE`, from the overview of its tesserae, as a WebP blob. */
async function renderPicture(app: App, file: TFile): Promise<Blob> {
  const service = MosaicCanvasService.forApp(app);
  const opened = await service.open(file);
  try {
    const bitmap = await service.overview(opened.handle, MAP_PICTURE_SIDE);
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No 2D context for the map picture.');
      context.drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: 'image/webp', quality: PICTURE_QUALITY });
    } finally {
      bitmap.close();
    }
  } finally {
    service.close(opened.handle);
  }
}

/**
 * A sharp picture of the map image at `path` for the dashboard, as an object URL; null when there
 * is none or it cannot be made. It is read from the map's tessera pyramid (built once per device and
 * kept), never by decoding the whole image here, and kept for the session, so a page shown again
 * has it at once.
 */
export function mapPictureUrl(app: App, path: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile) || typeof OffscreenCanvas === 'undefined') return Promise.resolve(null);
  const cache = cacheOf(app);
  const key = `${file.path}|${file.stat.size}|${file.stat.mtime}`;
  const known = cache.pictures.get(key);
  if (known) {
    cache.pictures.delete(key);
    cache.pictures.set(key, known);
    return known;
  }

  const picture = cache.queue.then(() => renderPicture(app, file)).then(
    (blob) => URL.createObjectURL(blob),
    (error: unknown) => {
      console.debug(`[Dashboard] No picture of ${file.path}:`, error);
      return null;
    },
  );
  cache.queue = picture;
  cache.pictures.set(key, picture);
  for (const [oldKey, old] of cache.pictures) {
    if (cache.pictures.size <= KEPT_PICTURES) break;
    cache.pictures.delete(oldKey);
    revoke(old);
  }
  return picture;
}

/** Lets go of every picture made for `app`; called when the plugin unloads. */
export function releaseMapPictures(app: App): void {
  const cache = caches.get(app);
  if (!cache) return;
  for (const picture of cache.pictures.values()) revoke(picture);
  caches.delete(app);
}
