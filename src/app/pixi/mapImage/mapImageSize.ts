import type { App } from 'obsidian';
import type { ImageSize } from '../../levels/levelImageReplace';
import { MapImageService } from './MapImageService';

/**
 * A vault map image's size as the map draws it: its pyramid's (`MapImageService.open`), the poster's
 * for a video, the size an `<img>` gives an SVG. Opening builds or finds its tiles, so showing it
 * afterwards is quick. Null for a file the vault does not have; rejects where it cannot be shown.
 */
export async function mapImageSize(app: App, path: string): Promise<ImageSize | null> {
  const file = app.vault.getFileByPath(path);
  if (!file) return null;
  const service = MapImageService.forApp(app);
  const opened = await service.open(file);
  try {
    return { width: opened.pyramid.width, height: opened.pyramid.height };
  } finally {
    service.close(opened.handle);
  }
}
