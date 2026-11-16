import { TFile, type App } from 'obsidian';
import { TesseraDecoderClient, TesseraOpenError } from './TesseraDecoderClient';
import { requiredMainThreadDecode } from './mainThreadDecode';

/**
 * Builds a freshly saved map image's tesserae into this device's cache, so the
 * map's first open is as quick as any later one. Fire and forget: the build
 * gives way to every map being opened, the file is read only if the cache
 * cannot tell it by path, size and time (a video's pyramid is its poster's), and a failure costs nothing but
 * the head start (the map is built when it is first opened instead).
 */
export function prebuildMosaicCanvas(app: App, file: TFile): void {
  const identity = { path: file.path, size: file.stat.size, mtime: file.stat.mtime };
  TesseraDecoderClient.forApp(app)
    .prebuild(() => app.vault.readBinary(file), identity, requiredMainThreadDecode(file))
    .catch((error: unknown) => console.debug(`[Atlas] The tesserae of ${file.path} were not built ahead`, error));
}

/** `prebuildMosaicCanvas` for the file at `path`; nothing when it is not there. */
export function prebuildMosaicCanvasAt(app: App, path: string): void {
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) prebuildMosaicCanvas(app, file);
}

/**
 * Builds the pyramid of the map image at `path` where the cache lacks it (joining the build an open map
 * started), resolving once the build has ended: the image's hash, whether its pyramid is complete
 * now and how many of its tesserae are stored. Null for a file that is not there, one built on this thread (an SVG, a video's poster: its
 * pyramid is no copy of its bytes) and one too large or undecodable; rejects where the worker failed.
 */
export async function buildMapPyramid(app: App, path: string): Promise<{ hash: string; complete: boolean; stored: number } | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile) || requiredMainThreadDecode(file) !== undefined) return null;
  try {
    return await TesseraDecoderClient.forApp(app).ensurePyramid(() => app.vault.readBinary(file), { path: file.path, size: file.stat.size, mtime: file.stat.mtime });
  } catch (error) {
    if (error instanceof TesseraOpenError) return null;
    throw error;
  }
}
