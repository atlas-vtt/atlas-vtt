import { TFile, type App } from 'obsidian';

/** Where encounter thumbnails are written; Atlas removes only files of this folder. */
export const ENCOUNTER_THUMBNAIL_DIR = 'atlas-vtt/assets/encounter-thumbnails';

/**
 * The thumbnail file an encounter's `thumbnailUrl` (the resource URL it was saved with) names, or
 * null for one outside the encounter thumbnails' folder, which is never Atlas' to remove.
 */
export function encounterThumbnailFile(app: App, url: string | undefined): TFile | null {
  if (!url) return null;
  const withoutQuery = url.split('?')[0];
  const folder = app.vault.getFolderByPath(ENCOUNTER_THUMBNAIL_DIR);
  const file = folder?.children.find((child) => child instanceof TFile && app.vault.getResourcePath(child).split('?')[0] === withoutQuery);
  return file instanceof TFile ? file : null;
}
