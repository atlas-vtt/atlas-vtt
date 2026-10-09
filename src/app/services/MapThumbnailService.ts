import { App, TFile } from 'obsidian';
import { Application, Container, Rectangle, type Texture } from 'pixi.js';
import { mapThumbnailPath } from '../utils/dataFileMigration';
import { contextLost } from '../pixi/lighting/engine/gpu';
import { requestRender } from '../pixi/RenderScheduler';
import { pictureView } from '../pixi/mapImage/levelOfDetail';
import type { PixelRect } from '../pixi/mapImage/pyramid';
import type { SceneFrameCapture } from '../pixi/sceneFrameCapture';
import { trashHiddenPath } from '../utils/hiddenVaultFiles';

/** The bytes of a base64 data URL, such as the JPEG `renderThumbnail` returns. */
export function dataUrlToBytes(dataUrl: string): ArrayBuffer | null {
  const base64Data = dataUrl.split(',')[1];
  if (!base64Data) return null;
  const binaryData = atob(base64Data);
  const bytes = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) {
    bytes[i] = binaryData.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Pixel size of a rendered thumbnail. */
export interface ThumbnailSize {
  width: number;
  height: number;
}

/** Map cards in the asset manager and dashboard. */
export const MAP_THUMBNAIL_SIZE: ThumbnailSize = { width: 400, height: 300 };
/** Scene snapshot cards: 16:9 and sharp enough for their larger preview. */
export const SNAPSHOT_THUMBNAIL_SIZE: ThumbnailSize = { width: 640, height: 360 };

/** A map view without lighting or GM overlays to take care of: the render is the picture. */
const PLAIN_CAPTURE: SceneFrameCapture = (_frame, render) => render();

/** What a thumbnail renders: a world rect and the output pixels per world unit. */
export interface ThumbnailFrame {
  rect: Rectangle;
  resolution: number;
}

/**
 * The centred crop of `bounds` (the map image's world rect, else everything on the viewport) with
 * the thumbnail's aspect, and the resolution it renders at: never above 1, so a large map does not
 * spike memory. In world (viewport-local) coordinates, since `generateTexture` ignores the target's
 * camera. Null when `bounds` has no area.
 */
export function thumbnailFrame(bounds: PixelRect, size: ThumbnailSize): ThumbnailFrame | null {
  const view = pictureView(bounds, size);
  if (!view) return null;
  const { x, y, width, height } = view.rect;
  return { rect: new Rectangle(x, y, width, height), resolution: 1 / view.worldPerScreenPixel };
}

/** Renders a map view into a thumbnail and stores it next to the scene's map file. */
export class MapThumbnailService {
  constructor(private readonly app: App) {}

  /**
   * Renders the map as it looks now into a JPEG data URL of `size` (400×300 by default),
   * framed on `mapRect`, the map image's world rect (`thumbnailFrame`). Returns null when there
   * is nothing to frame, or nothing can be drawn: a lost WebGL context renders blank, and that must not replace a thumbnail.
   * `capture` runs the off-screen render: the map view's hides the GM's overlays and lights the frame.
   */
  renderThumbnail(
    pixiApp: Application,
    viewport: Container,
    mapRect?: PixelRect | null,
    size: ThumbnailSize = MAP_THUMBNAIL_SIZE,
    capture: SceneFrameCapture = PLAIN_CAPTURE,
  ): string | null {
    if (contextLost(pixiApp.renderer)) return null;
    const framed = thumbnailFrame(mapRect ?? viewport.getLocalBounds(), size);
    if (!framed) return null;
    const { rect: contentBounds, resolution: renderResolution } = framed;

    const frame = { x: contentBounds.x, y: contentBounds.y, resolution: renderResolution };
    let renderTexture: Texture;
    try {
      renderTexture = capture(frame, () => pixiApp.renderer.generateTexture({
        target: viewport,
        frame: contentBounds,
        resolution: renderResolution,
      }));
    } finally {
      // The off-screen render consumed pending stage updates; the canvas still needs them
      requestRender(pixiApp);
    }
    try {
      const sourceCanvas = this.extractRenderCanvas(pixiApp, renderTexture, size);
      const thumbnailCanvas = this.fitIntoThumbnailCanvas(sourceCanvas, size);
      return thumbnailCanvas.toDataURL('image/jpeg', 0.8); // JPEG for smaller size
    } finally {
      renderTexture.destroy(true);
    }
  }

  private extractRenderCanvas(pixiApp: Application, renderTexture: Texture, size: ThumbnailSize): HTMLCanvasElement {
    if (pixiApp.renderer.extract && typeof pixiApp.renderer.extract.canvas === 'function') {
      return pixiApp.renderer.extract.canvas(renderTexture) as HTMLCanvasElement;
    }

    const canvas = createEl('canvas');
    const pixelData = pixiApp.renderer.extract?.pixels(renderTexture);
    if (!pixelData) {
      canvas.width = size.width;
      canvas.height = size.height;
      return canvas;
    }

    canvas.width = pixelData.width;
    canvas.height = pixelData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imgData = ctx.createImageData(pixelData.width, pixelData.height);
    imgData.data.set(pixelData.pixels);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  private fitIntoThumbnailCanvas(sourceCanvas: HTMLCanvasElement, size: ThumbnailSize): HTMLCanvasElement {
    const canvas = createEl('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const sourceWidth = Math.max(1, sourceCanvas.width);
    const sourceHeight = Math.max(1, sourceCanvas.height);
    const scale = Math.max(
      size.width / sourceWidth,
      size.height / sourceHeight
    );
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (size.width - drawWidth) / 2;
    const drawY = (size.height - drawHeight) / 2;

    ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
    return canvas;
  }
  
  /** Writes `bytes` as the thumbnail of the scene at `mapPath` and tells open asset lists. */
  async saveThumbnail(mapPath: string, bytes: ArrayBuffer): Promise<void> {
    if (!(this.app.vault.getAbstractFileByPath(mapPath) instanceof TFile)) return;
    const thumbnailPath = mapThumbnailPath(mapPath);
    const existing = this.app.vault.getAbstractFileByPath(thumbnailPath);
    const { adapter } = this.app.vault;
    // Thumbnails of scenes in a collection's maps folder live in the hidden data folder, which only the adapter sees.
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, bytes);
    } else if (await adapter.exists(thumbnailPath)) {
      await adapter.writeBinary(thumbnailPath, bytes);
    } else {
      const folder = thumbnailPath.substring(0, thumbnailPath.lastIndexOf('/'));
      if (!await adapter.exists(folder)) await adapter.mkdir(folder);
      await this.app.vault.createBinary(thumbnailPath, bytes);
    }
    this.app.workspace.trigger('atlas-vtt:scene-thumbnail-updated', mapPath);
  }

  /** Moves a deleted scene's thumbnail to the trash, so a later scene of the same name does not show it. */
  async trashThumbnail(mapPath: string): Promise<void> {
    const thumbnailPath = mapThumbnailPath(mapPath);
    const file = this.app.vault.getAbstractFileByPath(thumbnailPath);
    if (file instanceof TFile) await this.app.fileManager.trashFile(file);
    else await trashHiddenPath(this.app, thumbnailPath);
  }

  /** Whether the scene at `mapPath` has a thumbnail, wherever it is stored. */
  hasThumbnail(mapPath: string): Promise<boolean> {
    return this.app.vault.adapter.exists(mapThumbnailPath(mapPath));
  }
}
