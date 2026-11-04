import { TFile, type App } from 'obsidian';
import { renderThumbnail } from '../../imageProcessing/imageProcessing';
import { imageExtension } from '../assetImageFiles';
import { THUMBNAIL_SPEC } from '../AssetThumbnailService';

/**
 * Covers and thumbnails are stored under WebP names. Atlas 0.7.0 kept a PNG or
 * JPEG that needed no scaling as it was there too, so a vault may hold such a
 * file in another format than its name says. A bundle carries it as the WebP it
 * is named, and a release or fork writes that over the vault's copy.
 */

/** A WebP made for a bundle that the vault has yet to store at `path`. */
export interface NamedWebp {
  path: string;
  data: ArrayBuffer;
}

/**
 * The file at `path` as the WebP its name says, made by `render` from the PNG
 * or JPEG it holds. Null when it holds neither under a WebP name, or cannot be
 * converted and so stays as it is.
 */
export async function asNamedWebp(path: string, data: ArrayBuffer, render: (image: Blob) => Promise<ArrayBuffer>): Promise<ArrayBuffer | null> {
  if (!/\.webp$/i.test(path) || imageExtension(data) === 'webp') return null;
  try {
    return await render(new Blob([data]));
  } catch (error) {
    console.warn(`[CollectionExport] ${path} holds another format than its name says and could not be converted:`, error);
    return null;
  }
}

/** `asNamedWebp` for an asset's thumbnail. */
export function thumbnailAsNamedWebp(path: string, data: ArrayBuffer): Promise<ArrayBuffer | null> {
  return asNamedWebp(path, data, (image) => renderThumbnail(image, THUMBNAIL_SPEC));
}

/** Writes each WebP over the mislabelled file it was made from; a file that is gone by now stays gone. */
export async function storeNamedWebps(app: App, files: readonly NamedWebp[]): Promise<void> {
  for (const { path, data } of files) {
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await app.vault.modifyBinary(existing, data);
  }
}
