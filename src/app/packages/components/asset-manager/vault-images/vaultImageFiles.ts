import type { App, TFile } from 'obsidian';
import { ATLAS_VTT_DIR } from '../../../../services/assetPaths';
import { isVaultImage } from '../../../../utils/vaultImage';

/** The vault's images outside Atlas' own folder, which holds the art and maps Atlas already made, by path. */
export function vaultImages(app: App): TFile[] {
  const own = `${ATLAS_VTT_DIR}/`;
  return app.vault.getFiles()
    .filter((file) => isVaultImage(file) && !file.path.startsWith(own))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** The images whose path holds every word of `query`, in any case. */
export function matchingVaultImages(files: readonly TFile[], query: string): TFile[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return files.filter((file) => words.every((word) => file.path.toLowerCase().includes(word)));
}
