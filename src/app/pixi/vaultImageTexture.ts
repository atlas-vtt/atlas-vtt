import { ImageSource, Texture } from 'pixi.js';
import type { TFile, Vault } from 'obsidian';
import { withDecodedImage } from '../imageProcessing/imageElement';

/** `createImageBitmap` tells every raster format from its bytes; a vector goes through an `<img>`, which must be told its type. */
async function decode(bytes: ArrayBuffer, extension: string): Promise<ImageBitmap> {
  if (extension.toLowerCase() !== 'svg') return createImageBitmap(new Blob([bytes]));
  return withDecodedImage(new Blob([bytes], { type: 'image/svg+xml' }), (image) => createImageBitmap(image));
}

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
  const bitmap = await decode(await vault.readBinary(file), file.extension);
  return new Texture({ source: new ImageSource({ resource: bitmap, label: file.path }), label: file.path });
}

/** Destroys a texture of `loadVaultTexture` and frees its pixels now instead of at garbage collection. */
export function destroyVaultTexture(texture: Texture): void {
  const resource: unknown = texture.source.resource;
  texture.destroy(true);
  if (resource instanceof ImageBitmap) resource.close();
}
