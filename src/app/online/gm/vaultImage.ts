import { normalizePath, type App } from 'obsidian';
import { imageMimeType } from './assetServe.ts';
import type { VaultImage } from './TokenShare.ts';
import { isVideoMapPath, videoMimeType } from '../../pixi/mosaicCanvas/video/videoMapFiles';
import { videoPosterBlob } from '../../pixi/mosaicCanvas/video/videoPoster';

/**
 * An image of the vault as players may be sent it: its bytes and its type by its extension; null
 * for no image file. An animated map is sent as its poster, the still its thumbnails show.
 */
export async function readVaultImage(app: App, path: string): Promise<VaultImage | null> {
  const file = app.vault.getFileByPath(normalizePath(path));
  if (file === null) return null;
  if (isVideoMapPath(path)) return videoStill(await app.vault.readBinary(file), videoMimeType(path));
  const mime = imageMimeType(path);
  if (mime === null) return null;
  return { bytes: new Uint8Array(await app.vault.readBinary(file)), mime };
}

async function videoStill(bytes: ArrayBuffer, mime: string): Promise<VaultImage | null> {
  try {
    const poster = await videoPosterBlob(bytes, mime);
    return { bytes: new Uint8Array(await poster.arrayBuffer()), mime: poster.type || 'image/png' };
  } catch (error) {
    console.error('[Atlas Online] Could not take the still of an animated map', error);
    return null;
  }
}
