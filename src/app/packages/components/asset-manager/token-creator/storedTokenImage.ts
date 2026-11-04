import { TFile, type App } from 'obsidian';
import { imageExtension } from '../../../../services/assetImageFiles';
import { vaultImageFile } from './vaultImageFile';
import type { EditTokenInput } from './types';

/** The edited token's image as an upload, so an edit without a new image can crop it. */
export async function storedImageFile(app: App, editToken: EditTokenInput): Promise<File> {
  const file = editToken.imagePath ? app.vault.getAbstractFileByPath(editToken.imagePath) : null;
  if (!(file instanceof TFile)) throw new Error(`The image of ${editToken.name} no longer exists, so it cannot be cropped.`);
  return vaultImageFile(app, file);
}

/**
 * Writes an edited token's or map's new image over its stored one and returns the path, or
 * null when it has no image in the vault. A new file would leave the old one in the
 * collection's tokens folder, where the vault check adopts it as a second token;
 * overwriting also updates the token wherever it is placed. A file whose extension does not
 * name the new image's format is renamed first, which references follow like any rename.
 */
export async function overwriteStoredImage(app: App, imagePath: string | undefined, data: ArrayBuffer): Promise<string | null> {
  const file = imagePath ? app.vault.getAbstractFileByPath(imagePath) : null;
  if (!(file instanceof TFile)) return null;
  const extension = imageExtension(data);
  let target = file;
  if (!sameExtension(file.extension, extension)) {
    const stem = file.path.slice(0, file.path.length - file.extension.length - 1);
    const path = app.vault.getAbstractFileByPath(`${stem}.${extension}`) ? `${stem}_${Date.now()}.${extension}` : `${stem}.${extension}`;
    await app.fileManager.renameFile(file, path);
    const renamed = app.vault.getAbstractFileByPath(path);
    if (renamed instanceof TFile) target = renamed;
  }
  await app.vault.modifyBinary(target, data);
  return target.path;
}

function sameExtension(existing: string, wanted: string): boolean {
  const lower = existing.toLowerCase();
  return lower === wanted || (wanted === 'jpg' && lower === 'jpeg');
}
