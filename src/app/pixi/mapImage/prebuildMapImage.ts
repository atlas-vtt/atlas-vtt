import { TFile, type App } from 'obsidian';
import { TileDecoderClient } from './TileDecoderClient';

/**
 * Builds a freshly saved map image's tiles into this device's cache, so the
 * map's first open is as quick as any later one. Fire and forget: the build
 * gives way to every map being opened, the file is read only if the cache
 * cannot tell it by path, size and time, and a failure costs nothing but
 * the head start (the map is built when it is first opened instead).
 */
export function prebuildMapImage(app: App, file: TFile): void {
  const identity = { path: file.path, size: file.stat.size, mtime: file.stat.mtime };
  TileDecoderClient.forApp(app)
    .prebuild(() => app.vault.readBinary(file), identity)
    .catch((error: unknown) => console.debug(`[Atlas] The tiles of ${file.path} were not built ahead`, error));
}

/** `prebuildMapImage` for the file at `path`; nothing when it is not there. */
export function prebuildMapImageAt(app: App, path: string): void {
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) prebuildMapImage(app, file);
}
