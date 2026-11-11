import type { App, TFile } from 'obsidian';
import { IMAGE_PRESETS, optimizeImage } from '../../../imageProcessing/imageProcessing';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg']);
/** Atlas' map images: no portraits, and the largest images a vault holds. */
const MAP_IMAGES = 'atlas-vtt/assets/';
/** Pictures offered at once; the search narrows them down. */
const SHOWN_IMAGES = 48;

const isHidden = (path: string): boolean => path.startsWith('.') || path.includes('/.');

/** The vault's pictures a player's could be, matching `query` by path, newest first. */
export function vaultImages(files: readonly TFile[], query: string): TFile[] {
  const needle = query.trim().toLowerCase();
  return files
    .filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase())
      && !file.path.startsWith(MAP_IMAGES)
      && !isHidden(file.path)
      && (!needle || file.path.toLowerCase().includes(needle)))
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, SHOWN_IMAGES);
}

/** An uploaded picture, scaled down like token art and saved where the vault keeps attachments. Returns its path. */
export async function savePartyPicture(app: App, file: File): Promise<string> {
  const { image } = await optimizeImage(file, IMAGE_PRESETS.token);
  const name = `${file.name.replace(/\.[^.]*$/, '') || 'player'}.webp`;
  const path = await app.fileManager.getAvailablePathForAttachment(name);
  await app.vault.createBinary(path, await image.arrayBuffer());
  return path;
}
