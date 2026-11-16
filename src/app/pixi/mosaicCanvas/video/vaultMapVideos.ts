import type { App } from 'obsidian';
import type { Renderer } from 'pixi.js';
import { maxTextureSide } from '../../lighting/engine/gpu';
import type { MosaicCanvasService } from '../MosaicCanvasService';
import type { MapVideoDeps } from './MapVideoSlot';
import { openVideoElement } from './videoElement';
import { videoMimeType } from './videoMapFiles';

/**
 * How a view plays animated maps: the file's bytes read through the vault (never a resource URL),
 * the video made in the document of the view's canvas.
 */
export function vaultMapVideos(app: App, service: MosaicCanvasService, renderer: Renderer, canvas: HTMLCanvasElement): MapVideoDeps {
  return {
    open: async (file) => openVideoElement(canvas.ownerDocument, await app.vault.readBinary(file), videoMimeType(file.path)),
    // Null on a renderer without WebGL, which draws no video.
    maxTextureSize: () => maxTextureSide(renderer),
    // A video deleted since its map was shown is no video that failed: the scene shows the missing map once it loads again.
    reportStill: (file, problem) => {
      if (app.vault.getFileByPath(file.path)) service.reportVideoStill(file, problem);
    },
  };
}
