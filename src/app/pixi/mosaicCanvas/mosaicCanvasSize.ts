import type { App } from 'obsidian';
import type { ImageSize } from '../../levels/levelImageReplace';
import { MosaicCanvasService } from './MosaicCanvasService';

/**
 * A vault map image's size as the map draws it: its pyramid's (`MosaicCanvasService.open`), the poster's
 * for a video, the size an `<img>` gives an SVG. Opening builds or finds its tesserae, so showing it
 * afterwards is quick. Null for a file the vault does not have; rejects where it cannot be shown.
 */
export async function mosaicCanvasSize(app: App, path: string): Promise<ImageSize | null> {
  const file = app.vault.getFileByPath(path);
  if (!file) return null;
  const service = MosaicCanvasService.forApp(app);
  const opened = await service.open(file);
  try {
    return { width: opened.pyramid.width, height: opened.pyramid.height };
  } finally {
    service.close(opened.handle);
  }
}
