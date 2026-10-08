import { Texture } from 'pixi.js';
import type { TFile, Vault } from 'obsidian';
import { describeError } from '../utils/errors';
import { decodeImage, decodedSource, imageMimeType, type DecodedImage } from './decodedImage';

/**
 * A vault image as a texture at its own size. Free it with `destroyVaultTexture`.
 *
 * The bytes are read through the vault and never from the file's resource URL, which PIXI's
 * loader would `fetch`: Obsidian answers that only where its installer registered `app://` for
 * the Fetch API (since installer 1.4.5) and for cross-origin requests (since 1.13), which
 * Electron 40 and later demand. On an older installer, or one run on a newer Electron than it
 * came with, every such request ends in "Failed to fetch", though the file is there and an
 * `<img>` shows it.
 */
export async function loadVaultTexture(vault: Vault, file: TFile): Promise<Texture> {
  let image: DecodedImage;
  try {
    image = await decodeImage(await vault.readBinary(file), imageMimeType(file.extension), Infinity);
  } catch (error) {
    // Whoever reports the failure must be able to tell which file it was
    throw new Error(`The image ${file.path} could not be read: ${describeError(error)}`, { cause: error });
  }
  return new Texture({ source: decodedSource(image, { label: file.path }), label: file.path });
}

/** Destroys a texture of `loadVaultTexture` and frees its pixels now instead of at garbage collection. */
export function destroyVaultTexture(texture: Texture): void {
  const resource: unknown = texture.source.resource;
  texture.destroy(true);
  if (resource instanceof ImageBitmap) resource.close();
}
