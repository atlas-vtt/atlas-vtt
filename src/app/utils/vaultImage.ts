import type { TFile } from 'obsidian';

/** Image formats Atlas imports as token art or maps. */
const VAULT_IMAGE_EXTENSION = /^(png|jpe?g|webp|gif|bmp|svg|avif)$/i;

/** Whether a vault file is an image Atlas can import. */
export function isVaultImage(file: TFile): boolean {
  return VAULT_IMAGE_EXTENSION.test(file.extension);
}
