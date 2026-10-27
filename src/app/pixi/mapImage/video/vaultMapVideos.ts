import type { App } from 'obsidian';
import type { Renderer } from 'pixi.js';
import { glOf } from '../../lighting/engine/gpu';
import type { MapImageService } from '../MapImageService';
import type { MapVideoDeps } from './MapVideoSlot';
import { openVideoElement } from './videoElement';
import { videoMimeType } from './videoMapFiles';

/**
 * How a view plays animated maps: the file's bytes read through the vault (never a resource URL),
 * the video made in the document of the view's canvas, so a popout's map plays in the popout.
 */
export function vaultMapVideos(app: App, service: MapImageService, renderer: Renderer, canvas: HTMLCanvasElement): MapVideoDeps {
  return {
    open: async (file) => openVideoElement(canvas.ownerDocument, await app.vault.readBinary(file), videoMimeType(file.path)),
    maxTextureSize: () => maxTextureSide(renderer),
    // A video deleted since its map was shown is no video that failed: the scene shows the missing map once it loads again.
    reportStill: (file, problem) => {
      if (app.vault.getFileByPath(file.path)) service.reportVideoStill(file, problem);
    },
  };
}

/** The largest texture side `renderer` draws; null on a renderer without WebGL, which draws no video. */
function maxTextureSide(renderer: Renderer): number | null {
  const gl = glOf(renderer);
  if (!gl || gl.isContextLost()) return null;
  const side: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  return typeof side === 'number' ? side : null;
}
